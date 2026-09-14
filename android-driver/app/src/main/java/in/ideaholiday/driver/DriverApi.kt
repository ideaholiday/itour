package `in`.ideaholiday.driver

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

data class HttpReply(val status: Int, val body: String?)

/** The two driver-trip calls the app makes itself; everything else is the web trip page. */
interface DriverApi {
    /** Exchange the private trip link for a 12-hour driver session: `{ "token": "…" }` on success. */
    fun exchangeSession(linkToken: String): HttpReply
    fun postLocations(sessionToken: String, body: String): HttpReply
}

class HttpDriverApi(private val baseUrl: String) : DriverApi {
    override fun exchangeSession(linkToken: String): HttpReply =
        post("/api/driver-trips/session", JSONObject().put("token", linkToken).toString(), null)

    override fun postLocations(sessionToken: String, body: String): HttpReply =
        post("/api/driver-trips/location", body, sessionToken)

    private fun post(path: String, body: String, bearer: String?): HttpReply {
        val connection = URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 15_000
            connection.readTimeout = 15_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("X-Driver-Client", "android/${BuildConfig.VERSION_NAME}")
            bearer?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status >= 400) connection.errorStream else connection.inputStream
            return HttpReply(status, stream?.bufferedReader()?.use { it.readText() })
        } catch (error: IOException) {
            return HttpReply(-1, null)
        } finally {
            connection.disconnect()
        }
    }
}
