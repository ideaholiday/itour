package `in`.ideaholiday.shell

import android.app.DownloadManager
import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.webkit.CookieManager
import android.webkit.MimeTypeMap
import android.webkit.URLUtil
import java.io.File

/** Saves what the site offers for download into Downloads/Idea Holiday. */
object Downloads {
    private const val FOLDER = "Idea Holiday"

    /**
     * Runs in the page once it has loaded. Pages download files they build in the
     * browser (`blob:` links) and revoke the link right after clicking it; the shell
     * reads the file after the click, so revoking waits a minute. It also remembers
     * each link's `download` name, which Android's download callback doesn't pass on.
     */
    const val PAGE_SCRIPT = """(function () {
  if (window.__ideaHolidayShell) return; window.__ideaHolidayShell = true;
  var names = window.__ideaHolidayDownloadNames = {};
  var revoke = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = function (u) { setTimeout(function () { revoke(u); }, 60000); };
  function remember(a) { if (a && a.href && a.href.indexOf('blob:') === 0) names[a.href] = a.download || ''; }
  var click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { remember(this); return click.apply(this, arguments); };
  document.addEventListener('click', function (e) { remember(e.target && e.target.closest ? e.target.closest('a[href^="blob:"]') : null); }, true);
})();"""

    /** Reads a `blob:` or `data:` file in the page and passes it to the bridge's saveFile. */
    fun readInPageScript(quotedUrl: String): String = """(function (url) {
  fetch(url).then(function (r) { return r.blob(); }).then(function (blob) {
    return new Promise(function (ok, fail) { var f = new FileReader(); f.onload = function () { ok([f.result, blob.type]); }; f.onerror = fail; f.readAsDataURL(blob); });
  }).then(function (read) {
    var data = read[0]; IdeaHolidayApp.saveFile(data.substring(data.indexOf(',') + 1), (window.__ideaHolidayDownloadNames || {})[url] || '', read[1] || '');
  }).catch(function () { IdeaHolidayApp.saveFailed(); });
})($quotedUrl);"""

    /** Android 8 and 9 need the storage permission to write to Downloads. */
    val needsStoragePermission: Boolean get() = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q

    fun fileName(name: String?, mime: String?): String =
        LinkPolicy.safeFileName(name, MimeTypeMap.getSingleton().getExtensionFromMimeType(mime.orEmpty()))

    /** A normal web download, fetched by Android's download manager with the page's cookies. */
    fun enqueue(context: Context, url: String, userAgent: String?, contentDisposition: String?, mime: String?): String {
        val name = fileName(URLUtil.guessFileName(url, contentDisposition, mime), mime)
        val request = DownloadManager.Request(Uri.parse(url))
            .setTitle(name)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "$FOLDER/$name")
        if (!mime.isNullOrBlank()) request.setMimeType(mime)
        if (!userAgent.isNullOrBlank()) request.addRequestHeader("User-Agent", userAgent)
        CookieManager.getInstance().getCookie(url)?.let { request.addRequestHeader("Cookie", it) }
        (context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
        return name
    }

    /** Writes a file the page built; returns a content URI to open it, or null on Android 8 and 9. */
    fun save(context: Context, bytes: ByteArray, name: String, mime: String): Uri? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = context.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.MIME_TYPE, mime.ifBlank { "application/octet-stream" })
                put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$FOLDER")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: error("Downloads is not available")
            try {
                resolver.openOutputStream(uri)?.use { it.write(bytes) } ?: error("Downloads is not available")
            } catch (err: Exception) {
                resolver.delete(uri, null, null)
                throw err
            }
            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            return uri
        }
        @Suppress("DEPRECATION")
        val folder = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), FOLDER).apply { mkdirs() }
        var file = File(folder, name)
        var copy = 1
        while (file.exists()) file = File(folder, "${name.substringBeforeLast('.')} (${copy++}).${name.substringAfterLast('.', "")}".removeSuffix("."))
        file.writeBytes(bytes)
        MediaScannerConnection.scanFile(context, arrayOf(file.absolutePath), arrayOf(mime), null)
        return null
    }
}
