package `in`.ideaholiday.driver

import android.net.Uri

/**
 * The private trip link a driver receives by WhatsApp or email:
 *   https://ideaholiday.in/driver/trip#<assignmentId>.<signature>
 * The app also accepts ideaholiday-driver://trip?token=<token>, which the web
 * trip page uses to hand an open trip to the installed app.
 */
object TripLink {
    private val TOKEN = Regex("^[A-Za-z0-9_-]{1,120}\\.[a-f0-9]{64}$")

    fun isValidToken(token: String?): Boolean = token != null && TOKEN.matches(token)

    /** The link token from the pieces of a URI, or null when it isn't a trip link. */
    fun tokenFrom(scheme: String?, host: String?, path: String?, fragment: String?, queryToken: String?, allowedHost: String): String? {
        val token = when {
            scheme == "https" && host.equals(allowedHost, ignoreCase = true) && path?.trimEnd('/') == "/driver/trip" -> fragment
            scheme == "ideaholiday-driver" && host == "trip" -> queryToken
            else -> null
        }
        return token?.trim()?.takeIf(::isValidToken)
    }

    fun tokenFrom(uri: Uri?, allowedHost: String): String? =
        uri?.let { tokenFrom(it.scheme, it.host, it.path, it.fragment, it.getQueryParameter("token"), allowedHost) }
}
