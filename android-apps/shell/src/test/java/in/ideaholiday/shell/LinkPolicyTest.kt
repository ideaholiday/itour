package `in`.ideaholiday.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LinkPolicyTest {
    private val traveler = setOf("ideaholiday.in", "www.ideaholiday.in")
    private fun decide(url: String, mainFrame: Boolean = true, tapped: Boolean = true) = LinkPolicy.decide(url, traveler, mainFrame, tapped)

    @Test
    fun ownSitePagesLoadInTheApp() {
        assertEquals(LinkAction.LOAD, decide("https://ideaholiday.in/activity/goa-tour/abc"))
        assertEquals(LinkAction.LOAD, decide("https://WWW.ideaholiday.in/bookings"))
        assertEquals(LinkAction.LOAD, decide("blob:https://ideaholiday.in/1234"))
    }

    @Test
    fun googleSignInRunsInACustomTab() {
        assertEquals(LinkAction.SIGN_IN_TAB, decide("https://jidknptoyloucgldaool.supabase.co/auth/v1/authorize?provider=google", tapped = false))
        assertEquals(LinkAction.SIGN_IN_TAB, decide("https://accounts.google.com/o/oauth2/v2/auth?client_id=x"))
        assertEquals(LinkAction.LOAD, decide("https://jidknptoyloucgldaool.supabase.co/rest/v1/x", mainFrame = false), "other Supabase calls are untouched")
    }

    @Test
    fun upiAndOtherAppLinksOpenTheirApp() {
        assertEquals(LinkAction.OPEN_APP, decide("upi://pay?pa=merchant@bank&am=100"))
        assertEquals(LinkAction.OPEN_APP, decide("intent://pay?pa=x#Intent;scheme=upi;package=com.phonepe.app;end"))
        assertEquals(LinkAction.OPEN_APP, decide("phonepe://pay?x=1"))
        assertEquals(LinkAction.OPEN_APP, decide("tel:+919696777391"))
        assertEquals(LinkAction.OPEN_APP, decide("whatsapp://send?text=hi"))
    }

    @Test
    fun paymentPagesAndRedirectsStayButTappedLinksLeave() {
        assertEquals(LinkAction.LOAD, decide("https://sdk.cashfree.com/js/checkout", tapped = true))
        assertEquals(LinkAction.LOAD, decide("https://acs.somebank.co.in/3ds?id=1", tapped = false), "a 3-D Secure redirect stays in checkout")
        assertEquals(LinkAction.LOAD, decide("https://maps.example.com/embed", mainFrame = false), "iframes load where the page put them")
        assertEquals(LinkAction.OPEN_BROWSER, decide("https://instagram.com/ideaholiday", tapped = true))
        assertEquals(LinkAction.OPEN_BROWSER, decide("https://supply.ideaholiday.in/supplier", tapped = true), "the supplier site is not the traveler app")
    }

    @Test
    fun localFilesAreBlocked() {
        assertEquals(LinkAction.BLOCK, decide("file:///data/data/in.ideaholiday.app/shared_prefs/x.xml"))
        assertEquals(LinkAction.BLOCK, decide("content://com.android.contacts/contacts"))
        assertEquals(LinkAction.BLOCK, decide("not a url"))
    }

    @Test
    fun onlyOwnLinksOpenFromOutside() {
        assertTrue(LinkPolicy.isOwnLink("https://ideaholiday.in/login?from=%2Fbookings#access_token=x", traveler))
        assertFalse(LinkPolicy.isOwnLink("https://evil.example/ideaholiday.in", traveler))
        assertFalse(LinkPolicy.isOwnLink("javascript:alert(1)", traveler))
    }

    @Test
    fun notificationsOpenOnlyOwnSitePaths() {
        org.junit.Assert.assertEquals("/supplier/bookings", LinkPolicy.safeOpenPath("/supplier/bookings"))
        org.junit.Assert.assertEquals(null, LinkPolicy.safeOpenPath("//evil.example/x"))
        org.junit.Assert.assertEquals(null, LinkPolicy.safeOpenPath("https://evil.example"))
        org.junit.Assert.assertEquals(null, LinkPolicy.safeOpenPath("/\\evil.example"))
        org.junit.Assert.assertEquals(null, LinkPolicy.safeOpenPath(null))
        org.junit.Assert.assertEquals("/bookings?ref=IH-AB12", LinkPolicy.safeOpenPath("/bookings?ref=IH-AB12"))
    }

    @Test
    fun onlyOwnPagesGetTheCameraAndNeverTheMicrophone() {
        val supplier = setOf("supply.ideaholiday.in")
        val camera = LinkPolicy.VIDEO_CAPTURE
        val microphone = "android.webkit.resource.AUDIO_CAPTURE"
        org.junit.Assert.assertEquals(listOf(camera), LinkPolicy.mediaToGrant("https://supply.ideaholiday.in/", supplier, listOf(camera, microphone)))
        org.junit.Assert.assertEquals(emptyList<String>(), LinkPolicy.mediaToGrant("https://supply.ideaholiday.in/", supplier, listOf(microphone)))
        org.junit.Assert.assertEquals(emptyList<String>(), LinkPolicy.mediaToGrant("https://evil.example/", supplier, listOf(camera)))
        org.junit.Assert.assertEquals(emptyList<String>(), LinkPolicy.mediaToGrant("https://ideaholiday.in/", supplier, listOf(camera)))
    }

    @Test
    fun downloadNamesAreSafe() {
        assertEquals("guest-list-2026-10-01.csv", LinkPolicy.safeFileName("guest-list-2026-10-01.csv", "csv"))
        assertEquals("passwd.pdf", LinkPolicy.safeFileName("../../etc/passwd", "pdf"))
        assertEquals("idea-holiday-download.pdf", LinkPolicy.safeFileName("", "pdf"))
        assertEquals("Quotation _1_.pdf", LinkPolicy.safeFileName("Quotation <1>.pdf", null))
        assertEquals("env", LinkPolicy.safeFileName(".env", "exe!"))
    }

    private fun assertEquals(expected: LinkAction, actual: LinkAction, message: String) = org.junit.Assert.assertEquals(message, expected, actual)
}
