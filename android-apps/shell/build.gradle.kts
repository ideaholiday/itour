plugins {
    id("com.android.library")
}

// The WebView shell shared by the traveler and supplier apps: site navigation,
// Google sign-in in a Custom Tab, UPI handoff, file uploads and downloads.
android {
    namespace = "in.ideaholiday.shell"
    compileSdk = 36

    defaultConfig {
        minSdk = 26
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
