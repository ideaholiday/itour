package `in`.ideaholiday.supplier

import `in`.ideaholiday.shell.ShellActivity
import `in`.ideaholiday.shell.ShellConfig
import java.net.URI

/** The supplier reservation system, supply.ideaholiday.in, for owners and staff (ADR 052). */
class MainActivity : ShellActivity() {
    override val config: ShellConfig by lazy {
        ShellConfig(BuildConfig.SITE_URL, setOf(URI(BuildConfig.SITE_URL).host), "supplier", BuildConfig.VERSION_NAME)
    }
}
