package `in`.ideaholiday.driver

import android.content.Context

/** The current trip link, kept in the app's private storage so sharing survives the app being closed. */
class TripStore(context: Context) {
    private val prefs = context.getSharedPreferences("driver_trip", Context.MODE_PRIVATE)

    val linkToken: String? get() = prefs.getString("link", null)?.takeIf(TripLink::isValidToken)
    val bookingRef: String? get() = prefs.getString("ref", null)
    val active: Boolean get() = prefs.getBoolean("active", false)

    fun save(linkToken: String?, bookingRef: String?, active: Boolean) {
        prefs.edit().putString("link", linkToken).putString("ref", bookingRef).putBoolean("active", active).apply()
    }
}
