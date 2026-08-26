/**
 * Brownfield Android SurfaceHost adapter (map-a/#5 stub).
 *
 * Not a full AGP app — documents the native-push fork of SurfaceHost while
 * sharing DevSessionController / BundlerResolver with Greenfield (ADR-006).
 *
 * Wire this from a host Activity/Fragment:
 *   SurfaceHostAdapter.open("support", "http://127.0.0.1:8082")
 *   SurfaceHostAdapter.destroy("support")  // must run JS dispose (ADR-008 P0.1)
 */
package com.clientplatform.rn.brownfield

/**
 * Mirrors TS `OpenSurfaceFn` / `SurfaceHost.open` — native navigation owns the stack.
 */
interface SurfaceHost {
    fun open(moduleId: String, bundlerUrl: String)
    /** Native surface teardown — must invoke JS destroy→dispose before reuse. */
    fun destroy(moduleId: String)
}

/**
 * Reference adapter: logs intent; real hosts push Fragment / present RCTRootView.
 * Multi-Metro: each moduleId may target a different bundlerUrl (never force :8081 only).
 */
class SurfaceHostAdapter(
    private val openNativeSurface: (moduleId: String, bundlerUrl: String) -> Unit,
    private val destroyNativeSurface: (moduleId: String) -> Unit = { _ -> },
) : SurfaceHost {
    private val activeModules = mutableSetOf<String>()

    override fun open(moduleId: String, bundlerUrl: String) {
        require(moduleId.isNotBlank()) { "moduleId required" }
        require(bundlerUrl.startsWith("http")) { "bundlerUrl must be http(s)" }
        activeModules.add(moduleId)
        openNativeSurface(moduleId, bundlerUrl)
    }

    override fun destroy(moduleId: String) {
        require(moduleId.isNotBlank()) { "moduleId required" }
        destroyNativeSurface(moduleId)
        activeModules.remove(moduleId)
    }

    fun activeModules(): Set<String> = activeModules.toSet()
}

/**
 * Handshake mirror of `devSessionProtocolVersion` (keep in sync with rn-core).
 */
object DevSessionBridge {
    const val PROTOCOL_VERSION: Int = 1

    fun negotiate(peer: Int): Boolean = peer == PROTOCOL_VERSION
}
