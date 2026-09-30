package `in`.ideaholiday.driver

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Trip-request alerts by Firebase push (ADR 053). Needs Google Play services;
 * phones without it still get the WhatsApp and email alerts, and location
 * sharing never depends on it (ADR 014).
 */
object TripAlerts {
    const val CHANNEL = "alerts"
    /** A tapped alert opens the driver's trip list. */
    const val EXTRA_OPEN_TRIPS = "openTrips"
    private const val PREFS = "push"

    @Volatile var onToken: ((String) -> Unit)? = null

    fun savedToken(context: Context): String? = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("token", null)

    fun save(context: Context, token: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("token", token).apply()
    }

    fun ensureChannel(context: Context) {
        val channel = NotificationChannel(CHANNEL, context.getString(R.string.channel_trip_alerts), NotificationManager.IMPORTANCE_HIGH)
            .apply { description = context.getString(R.string.channel_trip_alerts_description) }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    /** Shows an alert that arrived while the app was open (Android shows the others itself). */
    fun show(context: Context, title: String, body: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val open = Intent(context, MainActivity::class.java).putExtra(EXTRA_OPEN_TRIPS, true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val id = (System.currentTimeMillis() % Int.MAX_VALUE).toInt()
        val tap = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        ensureChannel(context)
        val notification = Notification.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(tap)
            .build()
        context.getSystemService(NotificationManager::class.java).notify(id, notification)
    }
}

class TripAlertService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        TripAlerts.save(this, token)
        TripAlerts.onToken?.invoke(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val notification = message.notification ?: return
        TripAlerts.show(this, notification.title ?: getString(R.string.app_name), notification.body.orEmpty())
    }
}
