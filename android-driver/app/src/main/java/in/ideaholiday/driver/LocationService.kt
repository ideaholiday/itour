package `in`.ideaholiday.driver

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import java.text.DateFormat
import java.util.Date
import java.util.concurrent.Executors

/**
 * Shares the driver's location for one trip while the app is in the
 * background, the screen is locked or the driver navigates in another app.
 * Runs as a location foreground service (with its required notification), so
 * it needs only "while using the app" location permission.
 */
class LocationService : Service(), LocationListener {
    companion object {
        private const val ACTION_START = "in.ideaholiday.driver.action.START"
        private const val ACTION_STOP = "in.ideaholiday.driver.action.STOP"
        private const val EXTRA_LINK = "link"
        private const val EXTRA_SESSION = "session"
        private const val EXTRA_REF = "ref"
        private const val CHANNEL_ID = "trip_location"
        private const val NOTIFICATION_ID = 1001
        private const val UPDATE_INTERVAL_MS = 10_000L
        private const val HEARTBEAT_MS = 60_000L

        @Volatile var latestStatus: SharingStatus? = null
            private set
        /** The open screen listens here to pass status to the trip page. */
        @Volatile var listener: ((SharingStatus) -> Unit)? = null

        fun start(context: Context, linkToken: String, sessionToken: String?, bookingRef: String?) {
            val intent = Intent(context, LocationService::class.java).setAction(ACTION_START)
                .putExtra(EXTRA_LINK, linkToken).putExtra(EXTRA_SESSION, sessionToken).putExtra(EXTRA_REF, bookingRef)
            context.startForegroundService(intent)
        }

        fun stop(context: Context) {
            context.startService(Intent(context, LocationService::class.java).setAction(ACTION_STOP))
        }
    }

    private val main = Handler(Looper.getMainLooper())
    private val uploads = Executors.newSingleThreadExecutor()
    private lateinit var locations: LocationManager
    private var sharing: TripSharing? = null
    private var bookingRef: String? = null
    private var lastGpsFixMs = 0L
    private var lastFixMs = 0L

    private val heartbeat = object : Runnable {
        override fun run() {
            // A parked driver still reports once a minute so the trip stays "live".
            if (System.currentTimeMillis() - lastFixMs >= HEARTBEAT_MS) requestSingleFix()
            main.postDelayed(this, HEARTBEAT_MS)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        locations = getSystemService(LOCATION_SERVICE) as LocationManager
        val channel = NotificationChannel(CHANNEL_ID, getString(R.string.channel_trip_location), NotificationManager.IMPORTANCE_LOW)
        channel.description = getString(R.string.channel_trip_location_description)
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSharing(null)
            return START_NOT_STICKY
        }
        val trip = TripStore(this)
        val link = intent?.getStringExtra(EXTRA_LINK) ?: trip.linkToken
        if (!TripLink.isValidToken(link)) {
            stopSelf()
            return START_NOT_STICKY
        }
        bookingRef = intent?.getStringExtra(EXTRA_REF) ?: trip.bookingRef
        trip.save(link!!, bookingRef, active = true)

        val notification = notification(getString(R.string.notification_starting))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            stopSharing(getString(R.string.status_permission_needed))
            return START_NOT_STICKY
        }
        if (sharing == null || sharing?.stopped == true) {
            sharing = TripSharing(HttpDriverApi(BuildConfig.API_BASE_URL), link, intent?.getStringExtra(EXTRA_SESSION), onStatus = ::publish)
            startUpdates()
        }
        return START_STICKY
    }

    private fun startUpdates() {
        try {
            listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
                .filter { locations.isProviderEnabled(it) }
                .forEach { locations.requestLocationUpdates(it, UPDATE_INTERVAL_MS, 0f, this, Looper.getMainLooper()) }
            if (!locations.isProviderEnabled(LocationManager.GPS_PROVIDER) && !locations.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                publish(SharingStatus(SharingStatus.State.OFFLINE, message = getString(R.string.status_location_off)))
            }
            requestSingleFix()
            main.removeCallbacks(heartbeat)
            main.postDelayed(heartbeat, HEARTBEAT_MS)
        } catch (error: SecurityException) {
            stopSharing(getString(R.string.status_permission_needed))
        }
    }

    private fun requestSingleFix() {
        try {
            val provider = if (locations.isProviderEnabled(LocationManager.GPS_PROVIDER)) LocationManager.GPS_PROVIDER else LocationManager.NETWORK_PROVIDER
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                locations.getCurrentLocation(provider, null, mainExecutor) { location -> location?.let(::onLocationChanged) }
            } else {
                @Suppress("DEPRECATION")
                locations.requestSingleUpdate(provider, this, Looper.getMainLooper())
            }
        } catch (_: SecurityException) {
        } catch (_: IllegalArgumentException) {
        }
    }

    override fun onLocationChanged(location: Location) {
        val now = System.currentTimeMillis()
        val gps = location.provider == LocationManager.GPS_PROVIDER
        // Prefer GPS; a coarse network fix only fills gaps when GPS has gone quiet.
        if (!gps && now - lastGpsFixMs < 30_000) return
        if (gps) lastGpsFixMs = now
        lastFixMs = now
        val point = LocationPoint(
            lat = location.latitude,
            lng = location.longitude,
            accuracyM = if (location.hasAccuracy()) location.accuracy else null,
            speedMps = if (location.hasSpeed()) location.speed else null,
            heading = if (location.hasBearing()) location.bearing else null,
            recordedAtMs = location.time.takeIf { it > 0 } ?: now,
        )
        val current = sharing ?: return
        uploads.execute { current.onLocation(point) }
    }

    @Deprecated("Needed for API levels below 29")
    override fun onStatusChanged(provider: String?, status: Int, extras: android.os.Bundle?) = Unit

    private fun publish(status: SharingStatus) {
        latestStatus = status
        main.post {
            if (status.state == SharingStatus.State.STOPPED) {
                stopSharing(status.message)
            } else {
                listener?.invoke(status)
                getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification(describe(status)))
            }
        }
    }

    private fun describe(status: SharingStatus): String = when (status.state) {
        SharingStatus.State.ON -> getString(R.string.notification_on, status.lastSentAtMs?.let { DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(it)) } ?: "—")
        SharingStatus.State.OFFLINE -> status.message ?: getString(R.string.notification_offline)
        else -> getString(R.string.notification_starting)
    }

    private fun notification(text: String): Notification {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE)
        val builder = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(bookingRef?.let { getString(R.string.notification_title_ref, it) } ?: getString(R.string.notification_title))
            .setContentText(text)
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
        // Android 12+ may delay a foreground service notification; show it at once.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
        return builder.build()
    }

    private fun stopSharing(message: String?) {
        locations.removeUpdates(this)
        main.removeCallbacks(heartbeat)
        sharing = null
        TripStore(this).save(TripStore(this).linkToken, bookingRef, active = false)
        val stopped = SharingStatus(SharingStatus.State.STOPPED, message = message)
        latestStatus = stopped
        listener?.invoke(stopped)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        locations.removeUpdates(this)
        main.removeCallbacks(heartbeat)
        uploads.shutdown()
        super.onDestroy()
    }
}
