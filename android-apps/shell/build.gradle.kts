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
    // Push notifications (ADR 053). The apps apply the google-services plugin.
    implementation(platform("com.google.firebase:firebase-bom:34.18.0"))
    implementation("com.google.firebase:firebase-messaging")
    testImplementation("junit:junit:4.13.2")
}
