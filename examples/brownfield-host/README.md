# Brownfield reference host (map-a/#5)

TS + Android **SurfaceHost stub** sharing Greenfield Dev Session protocol (ADR-006).

**Not a production app** — internal fixture. See [../README.md](../README.md) · shell commands: [docs/guides/shell-team-cheatsheet.md](../../docs/guides/shell-team-cheatsheet.md).

## Layout

| Path | Role |
|------|------|
| `.rn/host-profile.jsonc` | `profile=brownfield` for `rn doctor --profile brownfield` |
| `.rn/dev-session.jsonc` | Dual-module port table (`main:8081`, `support:8082`) |
| `src/demo.ts` | `createBrownfieldReferenceHost` demo |
| `android/.../SurfaceHostAdapter.kt` | Native-push adapter stub |
| `android/stub/` | Gradle library module → rn-module AAR |
| `android/consumer/` | Host app consuming `:stub` (project BOM) |
| `android/consumer-flatdir/` | flatDir AAR from `publish/aar/` |
| `android/consumer-maven/` | maven-local `com.clientplatform.rn:rn-module-stub` |
| `ios/RnModuleStub/` | iOS source pod stub (XCFramework binary deferred) |

## Commands

```bash
# From repo root
pnpm install
cd examples/brownfield-host
pnpm exec rn doctor --profile brownfield
pnpm demo

# On an rn init shell (same delivery pipe as GF)
node ../../scripts/apply-brownfield-host-stub.mjs .
pnpm exec rn doctor --profile brownfield
node ../../scripts/verify-m3b-brownfield.mjs .
node ../../scripts/verify-bf-gradle.mjs
node ../../scripts/verify-bf-rn-module.mjs
node ../../scripts/verify-bf-bom-consume.mjs
node ../../scripts/verify-bf-aar-publish.mjs
node ../../scripts/verify-bf-ios-stub.mjs

# On an rn init shell — native launcher + RnSurfaceActivity (RCT)
node ../../scripts/apply-brownfield-host-stub.mjs /path/to/shell
node ../../scripts/scaffold-bf-rct-host.mjs /path/to/shell
node ../../scripts/verify-bf-rct-host.mjs /path/to/shell
```

## Not in this slice

- Dedicated consumer device install HITL
- Maven-published rn-module coordinates
- iOS XCFramework consumer
