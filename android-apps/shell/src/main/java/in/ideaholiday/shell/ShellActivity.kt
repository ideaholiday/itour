package `in`.ideaholiday.shell

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.text.TextUtils
import android.util.Base64
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import android.window.OnBackInvokedDispatcher
import org.json.JSONObject
import java.util.concurrent.Executors

/** Which site an app shows (ADR 052): the live website, with no second UI. */
data class ShellConfig(
    val siteUrl: String,
    /** Hosts that load inside the app; any other site opens in the browser when tapped. */
    val ownHosts: Set<String>,
    /** Added to the user agent, e.g. "traveler", so the site can tell it is in the app. */
    val appTag: String,
    val versionName: String,
)

/**
 * The live website in a WebView, plus what a website can't do well inside an app:
 * Google sign-in in a Custom Tab, UPI and other app handoffs, file uploads,
 * downloads and "use my location".
 */
abstract class ShellActivity : Activity() {
    private companion object {
        const val FILE_REQUEST = 51
        const val LOCATION_REQUEST = 52
        const val STORAGE_REQUEST = 53
        const val MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024
        const val CUSTOM_TABS_SESSION = "android.support.customtabs.extra.SESSION"
    }

    protected abstract val config: ShellConfig

    private lateinit var web: WebView
    private val io = Executors.newSingleThreadExecutor()
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingLocation: Pair<String, GeolocationPermissions.Callback>? = null
    private var pendingStorageAction: (() -> Unit)? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            setGeolocationEnabled(true)
            userAgentString = "$userAgentString IdeaHolidayApp/${config.versionName} (${config.appTag})"
        }
        // Cashfree's checkout runs in an iframe that needs its own cookies.
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)
        web.webViewClient = ShellClient()
        web.webChromeClient = ShellChrome()
        web.addJavascriptInterface(Bridge(), "IdeaHolidayApp")
        web.setDownloadListener { url, userAgent, contentDisposition, mime, _ -> download(url, userAgent, contentDisposition, mime) }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { goBack() }
        }
        if (savedInstanceState != null) web.restoreState(savedInstanceState) else open(intent, firstOpen = true)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        open(intent, firstOpen = false)
    }

    /** An App Link (a shared page, or Google sign-in returning to /login) opens in place. */
    private fun open(intent: Intent?, firstOpen: Boolean) {
        val link = intent?.dataString
        when {
            link != null && LinkPolicy.isOwnLink(link, config.ownHosts) -> web.loadUrl(link)
            firstOpen -> web.loadUrl(config.siteUrl)
        }
    }

    private fun isOwnPage(): Boolean = LinkPolicy.isOwnLink(web.url.orEmpty(), config.ownHosts)

    private inner class ShellClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url.toString()
            return when (LinkPolicy.decide(url, config.ownHosts, request.isForMainFrame, request.hasGesture())) {
                LinkAction.LOAD -> false
                LinkAction.SIGN_IN_TAB -> { openSignIn(request.url); true }
                LinkAction.OPEN_APP -> { openApp(url); true }
                LinkAction.OPEN_BROWSER -> { openBrowser(request.url); true }
                LinkAction.BLOCK -> true
            }
        }

        override fun onPageFinished(view: WebView, url: String) {
            if (isOwnPage()) view.evaluateJavascript(Downloads.PAGE_SCRIPT, null)
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) showOffline(request.url.toString())
        }
    }

    private inner class ShellChrome : WebChromeClient() {
        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = callback
            val chooser = params.createIntent().apply {
                if (params.mode == FileChooserParams.MODE_OPEN_MULTIPLE) putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            }
            return try {
                startActivityForResult(chooser, FILE_REQUEST)
                true
            } catch (_: ActivityNotFoundException) {
                fileCallback = null
                false
            }
        }

        override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
            if (!LinkPolicy.isOwnLink(origin, config.ownHosts)) return callback.invoke(origin, false, false)
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                return callback.invoke(origin, true, false)
            }
            pendingLocation = origin to callback
            requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), LOCATION_REQUEST)
        }
    }

    /** Called by the site. Every call checks the page is ours before acting. */
    private inner class Bridge {
        @JavascriptInterface
        fun version(): String = config.versionName

        @JavascriptInterface
        fun app(): String = config.appTag

        @JavascriptInterface
        fun saveFile(base64: String, name: String, mime: String) = runOnUiThread {
            if (!isOwnPage()) return@runOnUiThread
            if (base64.length > MAX_DOWNLOAD_BYTES / 3 * 4 + 4) return@runOnUiThread toast(R.string.shell_download_too_large)
            withStoragePermission {
                io.execute {
                    val fileName = Downloads.fileName(name, mime)
                    val saved = runCatching { Downloads.save(this@ShellActivity, Base64.decode(base64, Base64.DEFAULT), fileName, mime) }
                    runOnUiThread {
                        saved.onSuccess { uri -> toast(getString(R.string.shell_download_saved, fileName)); uri?.let { view(it, mime) } }
                            .onFailure { toast(R.string.shell_download_failed) }
                    }
                }
            }
        }

        @JavascriptInterface
        fun saveFailed() = runOnUiThread { toast(R.string.shell_download_failed) }
    }

    private fun download(url: String, userAgent: String?, contentDisposition: String?, mime: String?) {
        if (url.startsWith("blob:") || url.startsWith("data:")) {
            if (isOwnPage()) web.evaluateJavascript(Downloads.readInPageScript(JSONObject.quote(url)), null)
            return
        }
        if (!url.startsWith("https:") && !url.startsWith("http:")) return
        withStoragePermission {
            runCatching { Downloads.enqueue(this, url, userAgent, contentDisposition, mime) }
                .onSuccess { toast(getString(R.string.shell_download_started, it)) }
                .onFailure { toast(R.string.shell_download_failed) }
        }
    }

    private fun withStoragePermission(action: () -> Unit) {
        if (!Downloads.needsStoragePermission || checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED) return action()
        pendingStorageAction = action
        requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), STORAGE_REQUEST)
    }

    /** Google blocks sign-in inside WebViews. The Custom Tab returns to the site's /login App Link. */
    private fun openSignIn(uri: Uri) {
        val tab = Intent(Intent.ACTION_VIEW, uri).putExtras(Bundle().apply { putBinder(CUSTOM_TABS_SESSION, null) })
        try { startActivity(tab) } catch (_: ActivityNotFoundException) { toast(R.string.shell_no_browser) }
    }

    private fun openBrowser(uri: Uri) {
        try { startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)) }
        catch (_: ActivityNotFoundException) { toast(R.string.shell_no_browser) }
    }

    /** UPI, phone, email, WhatsApp and maps links; `intent:` links are opened safely, never at a fixed component. */
    private fun openApp(url: String) {
        val intent = if (url.startsWith("intent:")) {
            runCatching { Intent.parseUri(url, Intent.URI_INTENT_SCHEME) }.getOrNull()?.apply {
                addCategory(Intent.CATEGORY_BROWSABLE)
                component = null
                selector = null
            } ?: return
        } else {
            Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)
        }
        try {
            startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            val fallback = intent.getStringExtra("browser_fallback_url")
            when {
                fallback != null && (fallback.startsWith("https:") || fallback.startsWith("http:")) -> openBrowser(Uri.parse(fallback))
                isUpi(url, intent) -> toast(R.string.shell_no_upi_app)
                else -> toast(R.string.shell_no_app)
            }
        }
    }

    private fun isUpi(url: String, intent: Intent): Boolean =
        url.startsWith("upi:") || intent.scheme == "upi" || intent.data?.scheme == "upi"

    private fun view(uri: Uri, mime: String) {
        val open = Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime.ifBlank { null }).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        runCatching { startActivity(open) }
    }

    private fun showOffline(failedUrl: String) {
        val retry = if (LinkPolicy.isOwnLink(failedUrl, config.ownHosts)) failedUrl else config.siteUrl
        val html = """<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font-family:sans-serif;padding:32px;color:#1c1917;background:#fafaf9">
<h1 style="font-size:22px">${TextUtils.htmlEncode(getString(R.string.shell_offline_title))}</h1>
<p>${TextUtils.htmlEncode(getString(R.string.shell_offline_message))}</p>
<p><a href="${TextUtils.htmlEncode(retry)}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#1c1917;color:#fff;text-decoration:none">${TextUtils.htmlEncode(getString(R.string.shell_offline_retry))}</a></p></body>"""
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", failedUrl)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != FILE_REQUEST) return
        val clip = data?.clipData
        val files = when {
            resultCode != RESULT_OK -> null
            clip != null -> Array(clip.itemCount) { clip.getItemAt(it).uri }
            else -> WebChromeClient.FileChooserParams.parseResult(resultCode, data)
        }
        fileCallback?.onReceiveValue(files)
        fileCallback = null
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        val granted = grantResults.any { it == PackageManager.PERMISSION_GRANTED }
        when (requestCode) {
            LOCATION_REQUEST -> pendingLocation?.let { (origin, callback) -> callback.invoke(origin, granted, false) }.also { pendingLocation = null }
            STORAGE_REQUEST -> {
                val action = pendingStorageAction
                pendingStorageAction = null
                if (granted) action?.invoke() else toast(R.string.shell_download_needs_storage)
            }
        }
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
    @Deprecated("Back navigation inside the site on Android 12 and older")
    override fun onBackPressed() {
        goBack()
    }

    override fun onDestroy() {
        fileCallback?.onReceiveValue(null)
        io.shutdown()
        web.destroy()
        super.onDestroy()
    }

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    private fun toast(message: Int) = toast(getString(message))
}
