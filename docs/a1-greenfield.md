# A1 entry hub (Greenfield acceptance)

Map A **host-side** smoke path for a **Greenfield shell** (pure RN app-host). This file is a **short entry**; role-based docs live under [guides/](./guides/README.md).

| Role | Document |
|------|----------|
| **Shell / host team** | [guides/shell-team-cheatsheet.md](./guides/shell-team-cheatsheet.md) · [host-integration.md](./guides/host-integration.md) |
| Business module JS | [guides/module-developer.md](./guides/module-developer.md) — **no GF/BF in daily workflow** |
| GF/BF architecture | [agents/gf-bf-unified-model.md](./agents/gf-bf-unified-model.md) |

Industrial RN **0.87.x** + Hermes V1 + New Architecture only.

---

## Quick smoke (GF shell)

```bash
# CLI install — see cli-distribution.md
curl -fsSL https://raw.githubusercontent.com/client-platform-labs/rn/main/scripts/get-rn.sh | bash

mkdir ~/Work/my-rn-app && cd ~/Work/my-rn-app
rn init --demo
rn doctor
rn dev --android
```

Sample demo: [specs/2026-08-24-sample-demo-design.md](./specs/2026-08-24-sample-demo-design.md).

```bash
rn demo remove && rn demo add    # refresh template implant
rn dev-support add               # optional debug FAB (__DEV__ only)
rn-delivery build --platform android
```

Brownfield host smoke: [examples/brownfield-host/README.md](../examples/brownfield-host/README.md) + [host-integration.md](./guides/host-integration.md#brownfield-path).

---

## npm policy (`rn init`)

Default **inherit** local `~/.npmrc`. CI / clean pull:

| Way | Example |
|-----|---------|
| One-shot isolated | `rn init --isolated-npmrc` |
| Policy flag | `rn init --npm-policy isolated` |
| Registry override | `rn init --npm-registry https://registry.npmjs.org/` |
| Env | `CLIENT_PLATFORM_NPM_POLICY=isolated` |
| Host config | `~/.client-platform/rn/config.json` |

```json
{
  "npm": {
    "policy": "isolated",
    "registry": "https://registry.npmjs.org/"
  }
}
```

Priority: **CLI flag > env > host config > default(inherit)**.

---

## Contributors (monorepo)

```bash
./scripts/install.sh
```

---

## Device / SDK

Metro-only: no Android SDK required. Device / APK: need `ANDROID_HOME`, `adb`, JDK 17+.

```bash
rn host android --yes
rn doctor --strict
```

Details: [host-integration.md](./guides/host-integration.md#android--ios-toolchain).
