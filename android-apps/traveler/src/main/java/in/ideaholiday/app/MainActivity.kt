package `in`.ideaholiday.app

import `in`.ideaholiday.shell.ShellActivity
import `in`.ideaholiday.shell.ShellConfig
import java.net.URI

/** The traveler marketplace, ideaholiday.in (ADR 052). */
class MainActivity : ShellActivity() {
    override val config: ShellConfig by lazy {
        val host = URI(BuildConfig.SITE_URL).host
        ShellConfig(BuildConfig.SITE_URL, setOf(host, "www.$host"), "traveler", BuildConfig.VERSION_NAME)
    }
}
