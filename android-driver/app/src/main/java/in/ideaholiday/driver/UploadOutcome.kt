package `in`.ideaholiday.driver

import org.json.JSONObject

/** What to do after the server answered a location upload. */
sealed class UploadOutcome {
    data class Sent(val accuracyM: Int?, val distanceToPickupM: Int?) : UploadOutcome()
    /** The 12-hour driver session ended: exchange the trip link again, then retry. */
    object SessionExpired : UploadOutcome()
    /** The trip ended, was reassigned, or is no longer accepted: stop sharing. */
    data class Stop(val message: String) : UploadOutcome()
    /** The server refused these points (for example GPS too weak): drop them, keep sharing. */
    data class Rejected(val message: String) : UploadOutcome()
    /** Network or server trouble: keep the points and try again with the next position. */
    object Retry : UploadOutcome()

    companion object {
        private val STOP_CODES = setOf("TRIP_NOT_TRACKABLE", "TRIP_NOT_ACCEPTED", "ASSIGNMENT_NOT_FOUND")

        fun from(status: Int, body: String?): UploadOutcome {
            val json = runCatching { JSONObject(body ?: "") }.getOrNull()
            val message = json?.optString("error")?.takeIf { it.isNotBlank() } ?: "Location could not be sent"
            return when {
                status in 200..299 -> {
                    val location = json?.optJSONObject("location")
                    Sent(
                        accuracyM = location?.takeIf { it.has("accuracy_m") && !it.isNull("accuracy_m") }?.optInt("accuracy_m"),
                        distanceToPickupM = json?.takeIf { it.has("distanceToPickupM") && !it.isNull("distanceToPickupM") }?.optInt("distanceToPickupM"),
                    )
                }
                status == 401 -> SessionExpired
                status == 409 && json?.optString("code") in STOP_CODES -> Stop(message)
                status == 404 -> Stop(message)
                status == 422 || status == 400 -> Rejected(message)
                else -> Retry
            }
        }
    }
}
