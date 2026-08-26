package com.clientplatform.rn.brownfield.consumer.flatdir

import android.app.Activity
import android.os.Bundle
import com.clientplatform.rn.brownfield.SurfaceHostAdapter

/**
 * Host app consuming rn-module via flatDir AAR (publish/aar/stub-release.aar).
 */
class BrownfieldFlatDirConsumerActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val adapter = SurfaceHostAdapter(
            openNativeSurface = { _, _ -> },
        )
        adapter.open("main", "http://127.0.0.1:8081")
    }
}
