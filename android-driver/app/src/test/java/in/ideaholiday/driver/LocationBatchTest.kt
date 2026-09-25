package `in`.ideaholiday.driver

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class LocationBatchTest {
    private fun point(i: Int) = LocationPoint(26.8 + i / 1000.0, 80.9, 12f, 8.5f, 90f, 1_757_836_800_000L + i * 1000L)

    @Test fun keepsTheNewestTwentyThroughANetworkGap() {
        val batch = LocationBatch()
        repeat(25) { batch.add(point(it)) }
        val taken = batch.take()
        assertEquals(20, taken.size)
        assertEquals(point(5), taken.first())
        assertEquals(0, batch.size)
    }

    @Test fun unsentPointsGoBackAheadOfNewerOnes() {
        val batch = LocationBatch(capacity = 3)
        val unsent = listOf(point(1), point(2))
        batch.add(point(3))
        batch.add(point(4))
        batch.restore(unsent)
        assertEquals(listOf(point(2), point(3), point(4)), batch.take())
    }

    @Test fun serializesTheShapeTheServerAccepts() {
        val json = JSONObject(LocationBatch.body(listOf(point(0), LocationPoint(26.8, 80.9, null, Float.NaN, null, 1_757_836_800_000L))))
        val first = json.getJSONArray("points").getJSONObject(0)
        assertEquals(26.8, first.getDouble("lat"), 1e-9)
        assertEquals(8.5, first.getDouble("speed"), 1e-6)
        assertEquals("2025-09-14T08:00:00Z", first.getString("recordedAt"))
        val second = json.getJSONArray("points").getJSONObject(1)
        assertFalse("missing or invalid values are left out", second.has("accuracy") || second.has("speed") || second.has("heading"))
    }
}
