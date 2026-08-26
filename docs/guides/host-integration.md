# Host integration guide (Greenfield & Brownfield)

**Quick ref:** [shell-team-cheatsheet.md](./shell-team-cheatsheet.md) (one page) · this doc (full)

For **shell / platform / native** engineers who own the **host workspace**: store package, native project, `RuntimeHost` / `SurfaceHost`, and link to one or more `business_module` workspaces.

**Module developers** should read [module-developer.md](./module-developer.md) instead — they do not branch on GF/BF.

Canonical split: [gf-bf-unified-model.md](../agents/gf-bf-unified-model.md).

---

## GF vs BF in one table

| | **Greenfield (GF)** | **Brownfield (BF)** |
|---|---------------------|---------------------|
| **Who owns main Activity** | RN (`MainActivity`) | Native app |
| **How Surface opens** | RN navigation / root | Native push (`SurfaceHostAdapter`) |
| **Typical store artifact** | `artifact_kind: app-host` | Native app + optional `rn-module` AAR/XCFramework |
| **Onboarding** | `rn init` (topology B default) | Existing native repo + embed SDK |
| **Doctor** | `rn doctor` (default) | `rn doctor --profile brownfield` |
| **Host marker** | optional `host-profile.jsonc` `profile: greenfield` | **required** `profile: brownfield` + native stub |

### What must be identical (do not fork)

- `.rn/dev-session.jsonc` schema (multi-Metro port table, protocol version)
- `rn dev` / DevTransport (USB, Wi‑Fi adb, LAN)
- `DevSessionController`, `BundlerResolver`, dispose, event bus, load gate
- Enterprise P0 doctor (L3e)
- `rn-delivery` + control plane per `business_module`
- Release hygiene: **no DevSession / Dev Support in release builds** ([#20](https://github.com/client-platform-labs/rn/issues/20))

---

## Topology B (industrial default)

```text
shell-workspace/                 # app-host — native + RN runtime shell
  android/ ios/
  .rn/
    dev-session.jsonc            # shared port table
    host-profile.jsonc         # greenfield | brownfield
  modules/
    main/                      # linked module workspace
    <other-id>/
```

- **`rn init`** creates shell + links `main` (path B).
- **`--starter inline-main`** = onboarding shortcut (path A) — not the long-term default.
- Business JS stays in **`modules/<id>`**, not piled into shell `src/` (except teaching demo).

```bash
rn module init <id>
rn module link <id>
```

---

## Greenfield path

### Bootstrap

```bash
mkdir ~/Work/my-app-host && cd ~/Work/my-app-host
rn init --demo          # or: rn init && rn demo add
rn doctor
rn dev --android
```

Full smoke / CLI install: [a1-greenfield.md](../a1-greenfield.md) (entry hub).

### Host profile (optional)

```jsonc
// .rn/host-profile.jsonc
{
  "schemaVersion": 1,
  "profile": "greenfield",
  "topology": "shell-plus-modules",
  "devSessionProtocolVersion": 1
}
```

### Debug-only surfaces

```bash
rn dev-support add      # FAB → Dev Menu extensions (__DEV__)
rn dev-support remove   # must leave zero release residue (#20)
```

### Release candidate (L3)

```bash
rn-delivery build --platform android --profile release
```

HITL tracker: [#21](https://github.com/client-platform-labs/rn/issues/21).

---

## Brownfield path

### Reference layout

Live example: [`examples/brownfield-host`](../../examples/brownfield-host/README.md) (reference stub — see [examples/README.md](../../examples/README.md)).

| Path | Role |
|------|------|
| `.rn/host-profile.jsonc` | `profile: brownfield` |
| `.rn/dev-session.jsonc` | Same schema as GF |
| `android/.../SurfaceHostAdapter.kt` | Native **only** fork — push/pop Surface |
| `src/` (optional) | TS reference host using `createBrownfieldReferenceHost` |

```bash
cd examples/brownfield-host
pnpm exec rn doctor --profile brownfield
```

### Implementing SurfaceHost (native)

1. Import the same `RuntimeHost` / session config the GF Debug Host uses.
2. On native navigation: call **open** with `business_module` id → resolve bundler URL from port table.
3. On pop/destroy: call **destroy→dispose** (ADR-008 P0).
4. Do **not** hardcode `localhost:8081` as the only bundler.

**RCT embed (minimal):** on an `rn init` shell:

```bash
node scripts/apply-brownfield-host-stub.mjs <shell>
node scripts/scaffold-bf-rct-host.mjs <shell>
```

See [bf-rct-host HITL](../hitl/bf-rct-host-2026-08-26.md).

TS contract: `createBrownfieldReferenceHost` in `@client-platform/rn-core` — thin wrapper over `createReferenceRuntimeHost`.

### BF gaps (as of Map A progress)

- [x] Gradle RCT host scaffold + `assembleDebug` HITL ([#5](https://github.com/client-platform-labs/rn/issues/5) · [bf-rct-host](../hitl/bf-rct-host-2026-08-26.md))
- [x] `rn-module` AAR thin slice ([bf-rn-module-aar](../hitl/bf-rn-module-aar-2026-08-26.md) · `verify-bf-rn-module`)
- [x] Host BOM consume AAR ([bf-bom-consume](../hitl/bf-bom-consume-2026-08-26.md) · `verify-bf-bom-consume`)
- [ ] XCFramework · Maven publish · full production integrate DoD
- [ ] Release host without DevSession symbols (shared #20 gate)

---

## Shared dev session

### Multi-Metro

```bash
rn dev --modules main,support
```

Rules (ADR-006):

- One module ↔ one Metro port
- Parallel listeners OK; HMR must not cross modules
- `adb reverse` for each port when using USB transport

### Transport

```bash
rn dev --android --transport auto|usb|wifi|lan --device <serial|ip:port>
```

Brownfield **must** use the same DevTransport — no per-app adb scripts (ADR-001).

### Protocol version

`devSessionProtocolVersion` in `.rn/dev-session.jsonc` must match CLI. Doctor fails fast on mismatch.

---

## Android / iOS toolchain

`rn doctor` L1 lists SDK gaps. Install helpers:

```bash
rn host android --check
rn host android --yes
rn doctor --strict
```

Metro-only work does not require SDK; device install and `rn-delivery build` do.

---

## npm policy (`rn init` on shell only)

| Priority | Source |
|----------|--------|
| 1 | CLI flags |
| 2 | env (`CLIENT_PLATFORM_NPM_*`) |
| 3 | `~/.client-platform/rn/config.json` |
| 4 | inherit local `~/.npmrc` |

See [a1-greenfield.md](../a1-greenfield.md#npm-policy-rn-init).

---

## Enterprise promotion (GF = BF)

Same levels and P0 checklist for both host shapes: [enterprise-promotion-gates.md](../agents/enterprise-promotion-gates.md).

| Level | Host action |
|-------|-------------|
| L2 | Prove release artifact has no dev-only symbols (#20) |
| L3 | `rn-delivery build` HITL + install (#21 GF, #22 BF) |
| L4 | Signed `js-update` + control plane promote/block |

---

## Anti-patterns (review blockers)

- Second dev-session file or BF-only `rn dev-*` command
- Skipping L3e enterprise doctor on BF hosts
- Teaching demo layout as mandatory BF/GF production topology
- Shipping Metro dev output as OTA release

---

## Related

- [module-developer.md](./module-developer.md)
- [gf-bf-unified-model.md](../agents/gf-bf-unified-model.md)
- ADR-001 · ADR-005 · ADR-006 · ADR-008
- GitHub: [#5](https://github.com/client-platform-labs/rn/issues/5) A2 · [#20](https://github.com/client-platform-labs/rn/issues/20) · [#21](https://github.com/client-platform-labs/rn/issues/21) · [#22](https://github.com/client-platform-labs/rn/issues/22)
