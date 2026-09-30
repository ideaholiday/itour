package `in`.ideaholiday.shell

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

/** Push notifications through Firebase Cloud Messaging (ADR 053). */
object Push {
    const val CHANNEL = "alerts"
    /** The site path a notification opens, from its `data.path`. */
    const val EXTRA_PATH = "path"
    private const val PREFS = "push"

    /** Called with a new token while the app is open, so the page can register it. */
    @Volatile var onToken: ((String) -> Unit)? = null

    fun savedToken(context: Context): String? = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("token", null)

    fun save(context: Context, token: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("token", token).apply()
    }

    fun ensureChannel(context: Context) {
        val channel = NotificationChannel(CHANNEL, context.getString(R.string.shell_channel_alerts), NotificationManager.IMPORTANCE_HIGH)
            .apply { description = context.getString(R.string.shell_channel_alerts_description) }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    /** Shows a push that arrived while the app was open (Android shows the others itself). */
    fun show(context: Context, title: String, body: String, path: String?) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val open = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            LinkPolicy.safeOpenPath(path)?.let { putExtra(EXTRA_PATH, it) }
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        } ?: return
        val id = (System.currentTimeMillis() % Int.MAX_VALUE).toInt()
        val tap = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        ensureChannel(context)
        val notification = Notification.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.shell_ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(tap)
            .build()
        context.getSystemService(NotificationManager::class.java).notify(id, notification)
    }
}

class PushService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        Push.save(this, token)
        Push.onToken?.invoke(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val notification = message.notification ?: return
        Push.show(this, notification.title ?: applicationInfo.loadLabel(packageManager).toString(), notification.body.orEmpty(), message.data[Push.EXTRA_PATH])
    }
}
