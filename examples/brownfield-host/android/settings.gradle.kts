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
        flatDir {
            dirs("publish/aar")
        }
        maven {
            name = "rnModuleLocal"
            url = uri("${rootDir}/publish/maven-local")
        }
    }
}

rootProject.name = "brownfield-host-stub"
include(":stub")
include(":consumer")
include(":consumer-flatdir")
include(":consumer-maven")
