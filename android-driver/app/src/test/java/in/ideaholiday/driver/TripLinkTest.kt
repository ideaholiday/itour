package `in`.ideaholiday.driver

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TripLinkTest {
    private val signature = "a".repeat(64)
    private val token = "3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f.$signature"

    @Test fun readsTheTokenFromAWhatsAppTripLink() {
        assertEquals(token, TripLink.tokenFrom("https", "ideaholiday.in", "/driver/trip", token, null, "ideaholiday.in"))
        assertEquals(token, TripLink.tokenFrom("https", "IdeaHoliday.in", "/driver/trip/", token, null, "ideaholiday.in"))
    }

    @Test fun readsTheTokenHandedOverByTheWebPage() {
        assertEquals(token, TripLink.tokenFrom("ideaholiday-driver", "trip", null, null, token, "ideaholiday.in"))
    }

    @Test fun refusesOtherSitesPathsAndMalformedTokens() {
        assertNull(TripLink.tokenFrom("https", "evil.example", "/driver/trip", token, null, "ideaholiday.in"))
        assertNull(TripLink.tokenFrom("http", "ideaholiday.in", "/driver/trip", token, null, "ideaholiday.in"))
        assertNull(TripLink.tokenFrom("https", "ideaholiday.in", "/bookings", token, null, "ideaholiday.in"))
        assertNull(TripLink.tokenFrom("https", "ideaholiday.in", "/driver/trip", "not-a-token", null, "ideaholiday.in"))
        assertNull(TripLink.tokenFrom("https", "ideaholiday.in", "/driver/trip", "abc.${"g".repeat(64)}", null, "ideaholiday.in"))
        assertNull(TripLink.tokenFrom("https", "ideaholiday.in", "/driver/trip", null, null, "ideaholiday.in"))
    }
}
