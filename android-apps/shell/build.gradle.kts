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
        // Keep rules the apps pick up when R8 shrinks their release builds.
        consumerProguardFiles("consumer-rules.pro")
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    // Push notifications (ADR 053). The apps apply the google-services plugin.
    implementation(platform("com.google.firebase:firebase-bom:34.18.0"))
    implementation("com.google.firebase:firebase-messaging")
    // Firebase pulls in fragment 1.1.0 and activity 1.0.0, which Play flags as outdated.
    implementation("androidx.activity:activity:1.13.0")
    implementation("androidx.fragment:fragment:1.9.1")
    testImplementation("junit:junit:4.13.2")
}
