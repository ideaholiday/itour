import java.net.URI
import java.util.Properties

plugins {
    id("com.android.application")
    // Reads google-services.json (Firebase project ideaholiday-todothing) for push.
    id("com.google.gms.google-services")
}

// The site this app shows. Override for local testing:
//   ./gradlew :/Users/jitendramaury/ToDoThingWithIdeaHoliday/android-apps/supplierssembleDebug -PsupplierSiteUrl=http://10.0.2.2:5173
val siteUrl = (findProperty("supplierSiteUrl") as String?) ?: "https://supply.ideaholiday.in"

// Release signing uses this app's upload key from keystore-supplier.properties (never committed):
//   storeFile=/absolute/path/idea-holiday-supplier-upload.jks
//   storePassword=…  keyAlias=upload  keyPassword=…
val keystoreFile = rootProject.file("keystore-supplier.properties")
val keystore = Properties().apply { if (keystoreFile.exists()) keystoreFile.inputStream().use(::load) }

android {
    namespace = "in.ideaholiday.supplier"
    compileSdk = 36

    defaultConfig {
        applicationId = "in.ideaholiday.supplier"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
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
