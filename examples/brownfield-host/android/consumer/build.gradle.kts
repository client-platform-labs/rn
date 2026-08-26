plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.clientplatform.rn.brownfield.consumer"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.clientplatform.rn.brownfield.consumer"
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
    // Host BOM consume: rn-module AAR from :stub library (map-a/#5)
    implementation(project(":stub"))
    implementation("org.jetbrains.kotlin:kotlin-stdlib:2.0.21")
}
