package com.clientplatform.rn.brownfield.consumer

import android.app.Activity
import android.os.Bundle
import com.clientplatform.rn.brownfield.DevSessionBridge
import com.clientplatform.rn.brownfield.SurfaceHostAdapter

/**
 * Minimal host app consuming rn-module stub AAR via Gradle BOM (project :stub).
 * Proves compile-time linkage to SurfaceHostAdapter — not a device DoD.
 */
class BrownfieldConsumerActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val adapter = SurfaceHostAdapter(
            openNativeSurface = { moduleId, bundlerUrl ->
                // Host navigation would open RCT surface here
                require(DevSessionBridge.negotiate(DevSessionBridge.PROTOCOL_VERSION))
                require(moduleId.isNotBlank() && bundlerUrl.startsWith("http"))
            },
        )
        adapter.open("main", "http://127.0.0.1:8081")
    }
}
