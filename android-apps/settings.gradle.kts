pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "IdeaHolidayApps"
// The traveler and supplier apps share one WebView shell (ADR 052, ADR 053).
include(":shell", ":traveler", ":supplier")
