package `in`.ideaholiday.driver

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TripSharingTest {
    private val link = "da-1.${"b".repeat(64)}"
    private fun point(i: Int) = LocationPoint(26.8 + i / 1000.0, 80.9, 10f, null, null, 1_000L * i)

    private class FakeApi : DriverApi {
        val sessions = ArrayDeque<HttpReply>()
        val uploads = ArrayDeque<HttpReply>()
        val sentBodies = mutableListOf<Pair<String, String>>()
        var exchanges = 0
        override fun exchangeSession(linkToken: String): HttpReply { exchanges++; return sessions.removeFirstOrNull() ?: HttpReply(200, """{"token":"session-$exchanges"}""") }
        override fun postLocations(sessionToken: String, body: String): HttpReply { sentBodies += sessionToken to body; return uploads.removeFirstOrNull() ?: HttpReply(200, """{"success":true,"location":{"accuracy_m":10},"distanceToPickupM":420}""") }
    }

    @Test fun sendsTheFirstFixAtOnceThenAtMostEveryFifteenSeconds() {
        var now = 0L
        val api = FakeApi()
        val sharing = TripSharing(api, link, "session-0", clock = { now })
        sharing.onLocation(point(1))
        assertEquals(1, api.sentBodies.size)
        assertEquals(SharingStatus.State.ON, sharing.status.state)
        assertEquals(420, sharing.status.distanceToPickupM)
        now = 5_000; sharing.onLocation(point(2))
        assertEquals("not due yet", 1, api.sentBodies.size)
        now = 16_000; sharing.onLocation(point(3))
        assertEquals(2, api.sentBodies.size)
        assertTrue("points queued in between go together", api.sentBodies[1].second.contains("26.802") && api.sentBodies[1].second.contains("26.803"))
    }

    @Test fun keepsPointsThroughANetworkGap() {
        var now = 0L
        val api = FakeApi()
        api.uploads += HttpReply(-1, null)
        val sharing = TripSharing(api, link, "session-0", clock = { now })
        sharing.onLocation(point(1))
        assertEquals(SharingStatus.State.OFFLINE, sharing.status.state)
        now = 20_000; sharing.onLocation(point(2))
        assertEquals(SharingStatus.State.ON, sharing.status.state)
        assertTrue(api.sentBodies.last().second.contains("26.801") && api.sentBodies.last().second.contains("26.802"))
    }

    @Test fun renewsAnExpiredSessionFromTheTripLinkAndRetries() {
        val api = FakeApi()
        api.uploads += HttpReply(401, """{"error":"Driver session expired. Reopen your trip link.","code":"AUTH_REQUIRED"}""")
        val sharing = TripSharing(api, link, "old-session")
        sharing.onLocation(point(1))
        assertEquals(1, api.exchanges)
        assertEquals("session-1", api.sentBodies.last().first)
        assertEquals(SharingStatus.State.ON, sharing.status.state)
    }

    @Test fun noNetworkWhileRenewingIsNotAnExpiredLink() {
        val api = FakeApi()
        api.sessions += HttpReply(-1, null)
        api.sessions += HttpReply(429, """{"error":"Too many requests"}""")
        val sharing = TripSharing(api, link, null)
        assertTrue(sharing.onLocation(point(1)))
        assertEquals(SharingStatus.State.OFFLINE, sharing.status.state)
        sharing.flush()
        assertEquals("rate limited is retried, not stopped", SharingStatus.State.OFFLINE, sharing.status.state)
    }

    @Test fun stopsForGoodWhenTheTripEndsOrTheLinkIsDead() {
        val ended = FakeApi()
        ended.uploads += HttpReply(409, """{"error":"Location sharing has ended for this trip","code":"TRIP_NOT_TRACKABLE"}""")
        val sharing = TripSharing(ended, link, "session-0")
        assertFalse(sharing.onLocation(point(1)))
        assertTrue(sharing.stopped)
        assertFalse("nothing more is sent", sharing.onLocation(point(2)))
        assertEquals(1, ended.sentBodies.size)

        val reassigned = FakeApi()
        reassigned.sessions += HttpReply(401, """{"error":"This driver assignment is no longer available"}""")
        val dead = TripSharing(reassigned, link, null)
        dead.onLocation(point(1))
        assertTrue(dead.stopped)
    }

    @Test fun weakGpsIsDroppedButSharingContinues() {
        val api = FakeApi()
        api.uploads += HttpReply(422, """{"error":"Your GPS signal is too weak.","code":"LOW_ACCURACY"}""")
        val sharing = TripSharing(api, link, "session-0")
        assertTrue(sharing.onLocation(point(1)))
        assertEquals("Your GPS signal is too weak.", sharing.status.message)
        assertFalse(sharing.stopped)
    }
}
