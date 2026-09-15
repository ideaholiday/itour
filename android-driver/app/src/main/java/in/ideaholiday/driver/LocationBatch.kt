package `in`.ideaholiday.driver

import java.time.Instant

/** One position, in the shape POST /api/driver-trips/location accepts. */
data class LocationPoint(
    val lat: Double,
    val lng: Double,
    val accuracyM: Float?,
    val speedMps: Float?,
    val heading: Float?,
    val recordedAtMs: Long,
) {
    fun toJson(): String = buildString {
        append("{\"lat\":").append(lat).append(",\"lng\":").append(lng)
        accuracyM?.takeIf { it.isFinite() }?.let { append(",\"accuracy\":").append(it) }
        speedMps?.takeIf { it.isFinite() }?.let { append(",\"speed\":").append(it) }
        heading?.takeIf { it.isFinite() }?.let { append(",\"heading\":").append(it) }
        append(",\"recordedAt\":\"").append(Instant.ofEpochMilli(recordedAtMs)).append("\"}")
    }
}

/**
 * Positions waiting to be sent. The server takes at most 20 per request, so the
 * newest 20 are kept through a network gap: the latest position matters most.
 */
class LocationBatch(private val capacity: Int = 20) {
    private val points = ArrayDeque<LocationPoint>()

    @Synchronized fun add(point: LocationPoint) {
        points.addLast(point)
        while (points.size > capacity) points.removeFirst()
    }

    @Synchronized fun take(): List<LocationPoint> = points.toList().also { points.clear() }

    /** Put back points that could not be sent, ahead of newer ones, within capacity. */
    @Synchronized fun restore(unsent: List<LocationPoint>) {
        val merged = (unsent + points).takeLast(capacity)
        points.clear()
        points.addAll(merged)
    }

    @get:Synchronized val size: Int get() = points.size

    companion object {
        fun body(points: List<LocationPoint>): String = points.joinToString(",", prefix = "{\"points\":[", postfix = "]}") { it.toJson() }
    }
}
