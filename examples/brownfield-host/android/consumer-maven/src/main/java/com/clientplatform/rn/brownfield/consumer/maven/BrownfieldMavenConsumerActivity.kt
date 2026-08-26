package com.clientplatform.rn.brownfield.consumer.maven

import android.app.Activity
import android.os.Bundle
import com.clientplatform.rn.brownfield.SurfaceHostAdapter

/** Host app consuming rn-module from maven-local (com.clientplatform.rn:rn-module-stub). */
class BrownfieldMavenConsumerActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        SurfaceHostAdapter(openNativeSurface = { _, _ -> })
            .open("main", "http://127.0.0.1:8081")
    }
}
