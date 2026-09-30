package `in`.ideaholiday.shell

import java.net.URI

/** What the shell does with a URL the page navigates to. */
enum class LinkAction {
    /** Load it in the WebView. */
    LOAD,
    /** Google sign-in: Google refuses WebViews, so it runs in a Custom Tab and returns by App Link. */
    SIGN_IN_TAB,
    /** Hand it to another app: UPI, phone, email, WhatsApp, maps, `intent:` links. */
    OPEN_APP,
    /** A link the user tapped to another site: open it in the browser. */
    OPEN_BROWSER,
    /** Local files and content the page must never open. */
    BLOCK,
}

object LinkPolicy {
    /** Payment pages that must stay in the WebView so checkout can return to the site. */
    private val PAYMENT_HOSTS = listOf("cashfree.com")
    private val PAGE_SCHEMES = setOf("blob", "data", "about", "javascript")
    private val BLOCKED_SCHEMES = setOf("file", "content")

    fun decide(url: String, ownHosts: Set<String>, isMainFrame: Boolean, userTapped: Boolean): LinkAction {
        val scheme = url.substringBefore(':', "").lowercase()
        if (scheme in PAGE_SCHEMES) return LinkAction.LOAD
        if (scheme in BLOCKED_SCHEMES || scheme.isEmpty()) return LinkAction.BLOCK
        if (scheme != "http" && scheme != "https") return LinkAction.OPEN_APP

        val uri = runCatching { URI(url) }.getOrNull() ?: return LinkAction.BLOCK
        val host = uri.host?.lowercase() ?: return LinkAction.BLOCK
        if (isSignIn(host, uri.path.orEmpty())) return LinkAction.SIGN_IN_TAB
        if (!isMainFrame || host in ownHosts) return LinkAction.LOAD
        if (PAYMENT_HOSTS.any { host == it || host.endsWith(".$it") }) return LinkAction.LOAD
        // Redirects nobody tapped (bank 3-D Secure, payment returns) stay in the app;
        // a link the user taps to another site opens in the browser.
        return if (userTapped) LinkAction.OPEN_BROWSER else LinkAction.LOAD
    }

    /** Supabase's OAuth start and Google's own sign-in pages. */
    fun isSignIn(host: String, path: String): Boolean =
        (host.endsWith(".supabase.co") && path.startsWith("/auth/v1/authorize")) || host == "accounts.google.com"

    /** Whether a link opened from outside (App Link, notification) belongs in this app. */
    fun isOwnLink(url: String, ownHosts: Set<String>): Boolean {
        val uri = runCatching { URI(url) }.getOrNull() ?: return false
        return (uri.scheme == "https" || uri.scheme == "http") && uri.host?.lowercase() in ownHosts
    }

    /** A path from a push notification, opened on the app's own site; anything else is ignored. */
    fun safeOpenPath(path: String?): String? =
        path?.takeIf { it.startsWith("/") && !it.startsWith("//") && !it.contains('\\') && !it.contains(':') && it.length <= 500 }

    /** A file name safe to save in Downloads, keeping its extension. */
    fun safeFileName(name: String?, fallbackExtension: String?): String {
        val cleaned = name.orEmpty().substringAfterLast('/').substringAfterLast('\\')
            .replace(Regex("[^A-Za-z0-9._ -]"), "_").trim().trimStart('.').take(120)
        if (cleaned.isNotEmpty() && cleaned.contains('.')) return cleaned
        val extension = fallbackExtension?.lowercase()?.takeIf { it.matches(Regex("[a-z0-9]{1,8}")) }
        val base = cleaned.ifEmpty { "idea-holiday-download" }
        return if (extension != null) "$base.$extension" else base
    }
}
