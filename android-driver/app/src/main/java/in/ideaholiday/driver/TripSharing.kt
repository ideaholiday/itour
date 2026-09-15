package `in`.ideaholiday.driver

import org.json.JSONObject

/** What the driver sees in the notification and on the trip page. */
data class SharingStatus(
    val state: State,
    val lastSentAtMs: Long? = null,
    val accuracyM: Int? = null,
    val distanceToPickupM: Int? = null,
    val message: String? = null,
) {
    enum class State { STARTING, ON, OFFLINE, STOPPED }
}

/**
 * Sends a trip's positions: at most every [sendEveryMs] while moving, queues
 * them through network gaps, renews the driver session from the trip link when
 * it expires, and stops for good when the server says the trip is over.
 * Pure logic with an injectable API and clock, so it is unit-tested on the JVM.
 */
class TripSharing(
    private val api: DriverApi,
    private val linkToken: String,
    private var sessionToken: String?,
    private val sendEveryMs: Long = 15_000,
    private val clock: () -> Long = System::currentTimeMillis,
    private val onStatus: (SharingStatus) -> Unit = {},
) {
    private val batch = LocationBatch()
    private var lastAttemptMs = 0L
    var status: SharingStatus = SharingStatus(SharingStatus.State.STARTING)
        private set

    val stopped: Boolean get() = status.state == SharingStatus.State.STOPPED

    /** Record a position; sends when due. Returns true while sharing should continue. */
    @Synchronized
    fun onLocation(point: LocationPoint, force: Boolean = false): Boolean {
        if (stopped) return false
        batch.add(point)
        val first = status.state == SharingStatus.State.STARTING
        if (force || first || clock() - lastAttemptMs >= sendEveryMs) flush()
        return !stopped
    }

    @Synchronized
    fun flush() {
        if (stopped || batch.size == 0) return
        lastAttemptMs = clock()
        val points = batch.take()
        var outcome = send(points)
        if (outcome == UploadOutcome.SessionExpired) {
            sessionToken = null
            outcome = renewSession() ?: send(points)
        }
        when (outcome) {
            is UploadOutcome.Sent -> update(SharingStatus(SharingStatus.State.ON, clock(), outcome.accuracyM, outcome.distanceToPickupM))
            is UploadOutcome.Rejected -> update(status.copy(message = outcome.message))
            is UploadOutcome.Stop -> update(SharingStatus(SharingStatus.State.STOPPED, status.lastSentAtMs, message = outcome.message))
            UploadOutcome.Retry, UploadOutcome.SessionExpired -> {
                batch.restore(points)
                update(status.copy(state = SharingStatus.State.OFFLINE, message = "No network. Your location will be sent when the connection returns."))
            }
        }
    }

    private fun send(points: List<LocationPoint>): UploadOutcome {
        if (sessionToken == null) renewSession()?.let { return it }
        val reply = api.postLocations(sessionToken ?: return UploadOutcome.Retry, LocationBatch.body(points))
        return UploadOutcome.from(reply.status, reply.body)
    }

    /** Null when a new session was obtained; otherwise why not (link dead: stop; no network: retry). */
    private fun renewSession(): UploadOutcome? {
        val reply = api.exchangeSession(linkToken)
        val token = if (reply.status in 200..299) runCatching { JSONObject(reply.body ?: "").getString("token") }.getOrNull() else null
        if (token != null) { sessionToken = token; return null }
        // 429 is the shared per-IP limit (many phones share a carrier IP): wait, don't give up.
        return if (reply.status in 400..499 && reply.status != 429) UploadOutcome.Stop("This trip link no longer works. The trip may have been reassigned; contact your supplier.")
        else UploadOutcome.Retry
    }

    private fun update(next: SharingStatus) {
        status = next
        onStatus(next)
    }
}
