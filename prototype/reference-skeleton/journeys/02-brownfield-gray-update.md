# Journey 02 — Brownfield host + JS gray update (THROWAWAY)

Goal: validate Brownfield + JS train + channel overlay without store for every JS change.

## Actors

- Native host team (Brownfield)
- Business RN module team
- Release operator

## Steps

### A. Host registration

1. Native app integrates `AppHostKernel` / `RuntimeHost` / `SurfaceHost` (see `packages/runtime-sdk` stubs).
2. `rn doctor --profile brownfield` checks host registration + navigation boundary (native owns global nav).
3. Host ships via store trains (`*-host`); builds `runtime_fingerprint` into the binary.

### B. JS train publish

1. Business changes JS only → classify `releaseGate`:
   - `needs-native` if permissions/SDK/native ABI → stop, use host train
   - else `js-standard` or `js-gated` (pay/login/new sensitive capability → gated)
2. `rn-delivery update plan --dry-run` shows selector:
   - HBC bytecode version match
   - `runtime_fingerprint` equality
   - `required_capabilities ⊆ host.capability_set`
   - `channel_profile` allows JS train on target `artifact_line`
3. If `BLOCKED_PENDING_CHANNEL_RULES` (e.g. vivo evidence gap) → cannot enable JS on that line.
4. `rn-delivery update` creates release unit; gray by cohort; error budget may auto-pause.
5. E2E Maestro signal may go red → **alert only**, does not block promote/submit of an already-approved host; JS full may pause on error budget, not on E2E alone.

### C. Observability

All events carry `tenantId`, `releaseId`, `artifactLine`, `updateId`, `runtimeFingerprint` (see observability-identity schema).

## Expected mental model

```text
brownfield-host-demo (native)
  └─ RuntimeHost loads JS update_id
control-plane-stubs
  └─ release unit state: draft→gray→paused|full
channel_profile overlays per artifact_line
```

## Open for reviewer

- Is `js-gated` default set too aggressive for first IA entries?
- Should Brownfield demo live under `apps/` or `examples/hosts/`?
