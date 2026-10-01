import java.net.URI
import java.util.Properties

plugins {
    id("com.android.application")
    // Reads google-services.json (Firebase project ideaholiday-todothing) for push.
    id("com.google.gms.google-services")
}

// The site this app shows. Override for local testing:
//   ./gradlew :/Users/jitendramaury/ToDoThingWithIdeaHoliday/android-apps/travelerssembleDebug -PtravelerSiteUrl=http://10.0.2.2:5173
val siteUrl = (findProperty("travelerSiteUrl") as String?) ?: "https://ideaholiday.in"

// Release signing uses this app's upload key from keystore-traveler.properties (never committed):
//   storeFile=/absolute/path/idea-holiday-traveler-upload.jks
//   storePassword=…  keyAlias=upload  keyPassword=…
val keystoreFile = rootProject.file("keystore-traveler.properties")
val keystore = Properties().apply { if (keystoreFile.exists()) keystoreFile.inputStream().use(::load) }

android {
    namespace = "in.ideaholiday.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "in.ideaholiday.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "1.0.1"
        buildConfigField("String", "SITE_URL", "\"$siteUrl\"")
        manifestPlaceholders["siteHost"] = URI(siteUrl).host
        manifestPlaceholders["cleartextAllowed"] = siteUrl.startsWith("http://").toString()
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        if (keystore.getProperty("storeFile") != null) {
            create("upload") {
                storeFile = file(keystore.getProperty("storeFile"))
                storePassword = keystore.getProperty("storePassword")
                keyAlias = keystore.getProperty("keyAlias")
                keyPassword = keystore.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("upload")
        }
    }
}

dependencies {
    implementation(project(":shell"))
}
