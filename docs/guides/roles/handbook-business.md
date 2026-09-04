# Role handbook — Business module engineer

**Map:** [#143](https://github.com/client-platform-labs/rn/issues/143) · Capabilities: **C1** module-dev · **C2** doctor · **C3** host-onboard (once)

Thin main path only. Deep-read → [handbook-platform.md](./handbook-platform.md).

---

## Own / do not own

| Own | Do not |
|-----|--------|
| Business repo (e.g. `desk`) | Shell git / Catalog serve / Broker CLI |
| Daily Metro + Debug panel | `rn module register` / `rn-delivery` promote |
| `rn doctor` L0 | Platform plumbing flags |

---

## Daily (≤3)

```bash
# once per machine if needed — prefer Node 24 (desk ships .nvmrc)
nvm use   # or: export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
rn doctor
rn host android          # only when toolchain missing

# first clone: install Metro toolchain in the business repo
npm install

# every day — from business cwd
cd /path/to/desk
npm run dev              # ≡ rn module dev (keeps Broker alive until Ctrl+C)
```

On phone (Debug Host already installed): Dev Session panel → module **LIVE** → **Bind**.  
If **LOCKED / not in Catalog**: host-ops must `register` on CP and ensure phone **Pulls latest registry** (P2 or new Debug Host) — see [module-environment-sync.md](../module-environment-sync.md) §4.

> **Panel = CP catalog read; ModuleRegistry = legacy cache (read-only).**
> The Dev Session panel module list is the **CP catalog embed** (`.rn/catalog-embed.json` on the host).
> The legacy in-process ModuleRegistry is deprecated — kept read-only for one release (#155).

Do **not** manually point Dev Menu bundler at desk `index` (causes `hermesgfapp has not been registered`).

---

## Forbidden on this path

- `rn catalog serve` / `rn session status`
- `rn module register` / `catalog publish` (ask host-ops)
- Editing shell `.rn/dev-session.jsonc`

---

## When stuck

1. Panel not live → restart `npm run dev`; check USB/`adb devices`
2. Panel LOCKED / not in Catalog → host-ops must **register** the module
3. Deeper → [handbook-platform.md](./handbook-platform.md) § Broker / Catalog

---

## Dev 联调 Bind — preset UX

The Dev Session panel **Bind** UX uses a 3-preset selector (auto / usb / wifi). Pick at panel open time:

| Preset | adb device | URL resolver | Failure code |
|--------|------------|--------------|--------------|
| `auto` (default) | preferred | USB if device present, else Wi‑Fi | `no_device` if neither |
| `usb` | required | `resolveBindMetroUrl("usb", { adbSerial })` → `http://127.0.0.1:<port>` (adb reverse) | `no_device` |
| `wifi` | forbidden | `resolveBindMetroUrl("wifi", { lanIp })` → `http://<lanIp>:<port>` | `no_wifi_ip` |

Wi‑Fi must not silently fall back to `127.0.0.1` / `usbUrl`. See `packages/rn/src/dev-transport-ux.ts`.

---

## Detailed path

Capability index · C8/C9 pipes · D1–D8 scripts → **platform booklet**.
