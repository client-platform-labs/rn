import Foundation

/// iOS rn-module stub — mirrors Android SurfaceHostAdapter (map-a/#5).
/// XCFramework packaging deferred; source pod for compile contract only.
public struct SurfaceHostAdapter {
    private var active: Set<String> = []

    public init() {}

    public mutating func open(moduleId: String, bundlerUrl: URL) throws {
        guard !moduleId.isEmpty else {
            throw NSError(domain: "SurfaceHostAdapter", code: 1)
        }
        guard bundlerUrl.scheme == "http" || bundlerUrl.scheme == "https" else {
            throw NSError(domain: "SurfaceHostAdapter", code: 2)
        }
        active.insert(moduleId)
    }

    public mutating func destroy(moduleId: String) {
        active.remove(moduleId)
    }

    public func activeModules() -> Set<String> { active }
}

public enum DevSessionBridge {
    public static let protocolVersion = 1

    public static func negotiate(peer: Int) -> Bool { peer == protocolVersion }
}
