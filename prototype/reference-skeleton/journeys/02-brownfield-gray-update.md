# Journey 02 — Brownfield + JS gray (THROWAWAY)

Example lives under `examples/hosts/brownfield` (not a first-class product app).

## A. Host

1. Native integrates `AppHostKernel` / `RuntimeHost` / `SurfaceHost` (from `packages/core` contracts).
2. `rn doctor --profile brownfield`
3. Host ships on `*-host` trains; binary embeds `runtime_fingerprint`.

## B. JS train

1. JS-only change → gate from **release-gate-policy** plugin:
   - default **`js-standard`**
   - elevate to **`js-gated`** only for pay / login / new sensitive capability / first IA entry
   - **`needs-native`** if permissions / SDK / native ABI
2. `rn-delivery update plan --dry-run`  
   HBC + fingerprint + capability subset + `channel_profile`
3. `BLOCKED_PENDING_CHANNEL_RULES` on a line → no JS enable there
4. `rn-delivery update` → gray; error budget may pause
5. Maestro red → **alert only** (not submit blocker)

## Mental model

```text
examples/hosts/brownfield
plugins/adapter-* + release-gate-policy + channel-profile-cn
packages/delivery-cli
```
