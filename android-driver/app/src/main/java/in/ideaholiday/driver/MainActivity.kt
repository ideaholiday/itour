package `in`.ideaholiday.driver

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.window.OnBackInvokedDispatcher
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject

/**
 * The driver trip page (the same page drivers open in a browser), plus a
 * bridge that hands location sharing to [LocationService] so it keeps working
 * when the driver switches to Maps or locks the phone.
 */
class MainActivity : Activity() {
    private companion object {
        const val LOCATION_REQUEST = 41
        const val NOTIFICATION_REQUEST = 42
    }

    private lateinit var web: WebView
    private val baseUri: Uri by lazy { Uri.parse(BuildConfig.API_BASE_URL) }
    private var pendingSession: String? = null
    private var pendingRef: String? = null
    private val statusListener: (SharingStatus) -> Unit = { sendStatusToPage(it) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.setGeolocationEnabled(false) // location comes from the service, not the page
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (isOwnSite(uri)) return false
                // Phone calls, maps and everything off-site open in the right app.
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                return true
            }
        }
        web.addJavascriptInterface(Bridge(), "IdeaHolidayDriverApp")
        LocationService.listener = statusListener
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { goBack() }
        }
        if (savedInstanceState != null) web.restoreState(savedInstanceState) else openTrip(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        openTrip(intent)
    }

    private fun openTrip(intent: Intent?) {
        val store = TripStore(this)
        val fromLink = TripLink.tokenFrom(intent?.data, baseUri.host ?: "ideaholiday.in")
        val token = fromLink ?: store.linkToken.takeIf { store.active }
        if (fromLink != null && fromLink != store.linkToken && store.active) {
            // A new trip link replaces the one being shared.
            LocationService.stop(this)
        }
        if (fromLink != null) store.save(fromLink, null, active = store.active && fromLink == store.linkToken)
        web.loadUrl(baseUri.buildUpon().path("/driver/trip").encodedFragment(token).build().toString())
    }

    private fun isOwnSite(uri: Uri): Boolean = uri.scheme == baseUri.scheme && uri.host == baseUri.host && uri.port == baseUri.port

    private fun sendStatusToPage(status: SharingStatus) {
        val json = JSONObject()
            .put("state", status.state.name)
            .put("lastSentAtMs", status.lastSentAtMs ?: JSONObject.NULL)
            .put("accuracyM", status.accuracyM ?: JSONObject.NULL)
            .put("distanceToPickupM", status.distanceToPickupM ?: JSONObject.NULL)
            .put("message", status.message ?: JSONObject.NULL)
        runOnUiThread {
            if (!isOwnSite(Uri.parse(web.url ?: ""))) return@runOnUiThread
            web.evaluateJavascript("window.__ideaHolidayDriverAppStatus && window.__ideaHolidayDriverAppStatus($json)", null)
        }
    }

    /** Called by the trip page. Every call checks the page is ours before acting. */
    private inner class Bridge {
        @JavascriptInterface
        fun rememberLink(linkToken: String) = onPage {
            if (TripLink.isValidToken(linkToken)) {
                val store = TripStore(this@MainActivity)
                if (store.linkToken != linkToken) store.save(linkToken, null, active = false)
            }
        }

        @JavascriptInterface
        fun startSharing(sessionToken: String?, bookingRef: String?) = onPage {
            pendingSession = sessionToken
            pendingRef = bookingRef
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) startService()
            else explainThenAskForLocation()
        }

        @JavascriptInterface
        fun stopSharing() = onPage { LocationService.stop(this@MainActivity) }

        @JavascriptInterface
        fun version(): String = BuildConfig.VERSION_NAME

        private fun onPage(action: () -> Unit) = runOnUiThread { if (isOwnSite(Uri.parse(web.url ?: ""))) action() }
    }

    private fun explainThenAskForLocation() {
        AlertDialog.Builder(this)
            .setTitle(R.string.disclosure_title)
            .setMessage(R.string.disclosure_message)
            .setPositiveButton(R.string.disclosure_continue) { _, _ ->
                requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), LOCATION_REQUEST)
            }
            .setNegativeButton(R.string.disclosure_not_now) { _, _ -> sendStatusToPage(SharingStatus(SharingStatus.State.STOPPED, message = getString(R.string.status_permission_needed))) }
            .setCancelable(false)
            .show()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        when (requestCode) {
            LOCATION_REQUEST -> {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                    sendStatusToPage(SharingStatus(SharingStatus.State.STOPPED, message = getString(R.string.status_permission_needed)))
                    return
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    // Without it sharing still works; the driver just doesn't see the notification.
                    requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFICATION_REQUEST)
                } else {
                    startService()
                }
            }
            NOTIFICATION_REQUEST -> startService()
        }
    }

    private fun startService() {
        val link = TripStore(this).linkToken
        if (link == null) {
            sendStatusToPage(SharingStatus(SharingStatus.State.STOPPED, message = getString(R.string.status_open_link)))
            return
        }
        sendStatusToPage(SharingStatus(SharingStatus.State.STARTING))
        LocationService.start(this, link, pendingSession, pendingRef)
    }

    override fun onResume() {
        super.onResume()
        LocationService.latestStatus?.let(::sendStatusToPage)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    private fun goBack() {
        if (web.canGoBack()) web.goBack() else finish()
    }

    /** Android 12 and older; newer versions use the back callback registered in onCreate. */
    @SuppressLint("GestureBackNavigation")
    @Deprecated("Back navigation inside the trip page on Android 12 and older")
    override fun onBackPressed() {
        goBack()
    }

    override fun onDestroy() {
        if (LocationService.listener === statusListener) LocationService.listener = null
        web.destroy()
        super.onDestroy()
    }
}
