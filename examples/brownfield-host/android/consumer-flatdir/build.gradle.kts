plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.clientplatform.rn.brownfield.consumer.flatdir"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.clientplatform.rn.brownfield.consumer.flatdir"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // Production-style: consume staged rn-module AAR from publish/aar/ (flatDir in settings)
    implementation(name = "stub-release", ext = "aar")
    implementation("org.jetbrains.kotlin:kotlin-stdlib:2.0.21")
}
