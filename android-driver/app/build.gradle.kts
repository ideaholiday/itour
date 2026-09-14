import java.net.URI
import java.util.Properties

plugins {
    id("com.android.application")
}

// The site the app opens and sends locations to. Override for local testing:
//   ./gradlew assembleDebug -PdriverBaseUrl=http://10.0.2.2:5173
val driverBaseUrl = (findProperty("driverBaseUrl") as String?) ?: "https://ideaholiday.in"

// Release signing uses the upload key from keystore.properties (never committed):
//   storeFile=/absolute/path/idea-holiday-driver-upload.jks
//   storePassword=…  keyAlias=upload  keyPassword=…
val keystoreFile = rootProject.file("keystore.properties")
val keystore = Properties().apply { if (keystoreFile.exists()) keystoreFile.inputStream().use(::load) }

android {
    namespace = "in.ideaholiday.driver"
    compileSdk = 36

    defaultConfig {
        applicationId = "in.ideaholiday.driver"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "API_BASE_URL", "\"$driverBaseUrl\"")
        manifestPlaceholders["driverHost"] = URI(driverBaseUrl).host
        manifestPlaceholders["cleartextAllowed"] = driverBaseUrl.startsWith("http://").toString()
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

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    // Android provides org.json at runtime; JVM unit tests need a real implementation.
    testImplementation("org.json:json:20260814")
}
