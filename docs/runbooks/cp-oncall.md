# Control Plane on-call runbook (thin AFK bar)

Map D **D5** · parent [#80](https://github.com/client-platform-labs/rn/issues/80) · issue [#88](https://github.com/client-platform-labs/rn/issues/88)

<!-- afk:scope -->

## Scope

**In scope:** file-registry / `rn-delivery cp-serve` stub control plane — kill/pause, promote gates, rollout tick, exception ledger expiry, channel_profile pending-rules.

**Out of scope (do not claim live):** GRC backends · CycloneDX generation · HSM signing · store submission · production ECS CP.

**Pre-flight (every incident):**

- [ ] Confirm project root has `.rn/delivery/registry.json` (or SQLite path from `rn-delivery` output).
- [ ] Note `digest`, `business_module`, `update_id`, and current `stage` (staging vs production).
- [ ] If using HTTP CP: `RN_CP_TOKEN` + `RN_CP_ROLE=admin` for mutating routes; viewer is read-only.
- [ ] Run loop smoke: `node scripts/run-map-c-loop.mjs` (C1–C7) and `node scripts/run-map-d-loop.mjs` (D1–D5).

---

<!-- afk:kill-pause -->

## Kill / Pause by `business_module`

Module-scoped **kill** blocks specific `update_id`s (A5 exclude wire). **Pause** blocks promote narrative for the module until admin resume.

### Checklist — kill suspected bad JS

- [ ] List current kills: `GET /v1/kills` (or inspect `registry.json` → `kills`).
- [ ] Post kill (HTTP): `POST /v1/kill` with `{ "business_module": "<mod>", "update_ids": ["<id>"], "reason": "oncall" }`.
- [ ] CLI alternative: use CP console at `rn-delivery serve` / `cp-serve` root HTML, or mutate registry per Map B B9 drill.
- [ ] Verify module isolation: sibling modules' `update_id`s must **not** appear in `blocked_update_ids`.
- [ ] Confirm A5 wire: `node scripts/verify-cp-kill-pause.mjs` (desk kill + fixture_second untouched).

### Checklist — pause module (soak / investigation)

- [ ] `POST /v1/pause` `{ "business_module": "<mod>", "reason": "soak" }`.
- [ ] Double-pause must return `400` / `already_paused` — if not, registry may be corrupt.
- [ ] Resume requires **admin** role: `POST /v1/resume` `{ "business_module": "<mod>" }` (`viewer` → `403`).
- [ ] Resume when not paused → `400` / `not_paused`.

**Verify:** `node scripts/verify-cp-kill-pause.mjs`

---

<!-- afk:promote-e2e-fail -->

## Promote blocked — `e2e_fail` (P7)

Quality signal `e2e_fail` is fail-closed on **promote** (not compile).

### Checklist

- [ ] Inspect `.rn/delivery/quality-signals.json` for `kind: "e2e_fail"` on the candidate `update_id`.
- [ ] Record signal (if reproducing): `rn-delivery signal record --module <mod> --update-id <id> --kind e2e_fail --detail "oncall triage"`.
- [ ] Attempt promote must fail before staging→production move: `rn-delivery promote --digest <sha256>`.
- [ ] Clear path: fix E2E · remove/resolve signal · re-run gates · promote again.

**Verify:** `node scripts/verify-cp-e2e-promote-gate.mjs`

---

<!-- afk:promote-consistency-fail -->

## Promote blocked — `consistency_fail` (P8)

Cross-artifact consistency gate blocks promote when fingerprint / tuple mismatch.

### Checklist

- [ ] Check `quality-signals.json` for `kind: "consistency_fail"`.
- [ ] Record: `rn-delivery signal record --module <mod> --update-id <id> --kind consistency_fail --detail "…"`.
- [ ] Promote must remain blocked until consistency restored (rebuild same digest chain or clear signal after fix).
- [ ] Full gate contract: `node scripts/verify-consistency-gate.mjs`.

**Verify:** `node scripts/verify-consistency-gate.mjs`

---

<!-- afk:promote-sbom -->

## Promote blocked — SBOM / supply chain (P9)

Dual-train SBOM evidence must match `artifact_kind` and digest on promote.

### Checklist

- [ ] Inspect candidate `supply_chain.host.sbom` and `supply_chain.js_update.sbom` in staging metadata.
- [ ] Missing / mismatched SBOM → promote throws `sbom:` prefixed error.
- [ ] Remediation: `rn-delivery sign` (stub SBOM) · validate metadata · ensure host vs js-update kinds align.
- [ ] Do **not** claim CycloneDX or attestation backends — stub format only in this repo.

**Verify:** `node scripts/verify-cp-sbom-promote-gate.mjs`

---

<!-- afk:promote-governance -->

## Promote blocked — governance (P16 / P17)

Compliance profile dual-landing + exception ledger must pass before promote.

### Checklist

- [ ] Compliance profile present under `.rn/delivery/` (see `governance-store` / `compliance-profile.json`).
- [ ] Exception ledger: `.rn/delivery/exception-ledger.json` — check `expires_at` on active entries.
- [ ] Expired exception → promote blocked (fail-closed).
- [ ] Single-landing compliance profile rejected at validation.
- [ ] Remediation: renew exception with ticket + owner · or fix profile dual-landing · re-run promote.

**Verify:** `node scripts/verify-compliance-profile.mjs` · `node scripts/verify-cp-governance-promote-gate.mjs`

---

<!-- afk:rollout-tick-slo -->

## Rollout tick / SLO breach (P10)

Canary rollout: soak ∧ SLI → auto-advance; SLO breach → pause.

### Checklist — service health

- [ ] `GET /health` → `service: control-plane`.
- [ ] `GET /v1/service` → `mode: cp-serve`, `replaceable_backend: true`.
- [ ] Start CP: `rn-delivery cp-serve --port <n>` with `RN_CP_TOKEN` / `RN_CP_ROLE=admin`.

### Checklist — SLO breach (manual signal)

- [ ] `POST /v1/rollout/slo-breach` `{ "digest": "<sha256>", "reason": "error_budget_breach" }`.
- [ ] Expect `rollout.phase === "paused"` and `action === "rollout_slo_breach_pause"`.

### Checklist — tick loop

- [ ] `POST /v1/rollout/start` with `business_module`, `digest`, `min_soak_ms`, `sli_thresholds`.
- [ ] `POST /v1/rollout/tick` — `waiting_sli` until SLI payload present.
- [ ] High `error_rate` in tick body → `paused_slo`.
- [ ] After `POST /v1/rollout/resume`, good SLI + elapsed soak → `advanced`.

**Verify:** `node scripts/verify-cp-service.mjs` · `node scripts/verify-cp-rollout-tick.mjs` · `node scripts/verify-cp-rollout-steps.mjs`

---

<!-- afk:exception-ledger-expiry -->

## Exception ledger expiry (P17)

Expired break-glass exceptions auto-block promote (governance gate).

### Checklist

- [ ] Open `.rn/delivery/exception-ledger.json` (or load via governance store).
- [ ] For each entry: confirm `owner`, `ticket`, `expires_at`, `scope`, `review_cadence_days`.
- [ ] If `expires_at` < now → treat as debt; promote must fail until renewed or removed through governance process.
- [ ] Fresh exception with future `expires_at` → gate passes (other gates may still block).
- [ ] Cross-check compliance profile overlay `exceptionBreakGlassRequires` if using finance sample.

**Verify:** `node scripts/verify-compliance-profile.mjs` · `node scripts/verify-cp-governance-promote-gate.mjs`

---

<!-- afk:channel-profile-pending-rules -->

## `channel_profile` pending-rules

Seven-channel China profile contract: channels with `pending_rules` block JS until evidence is fresh.

### Checklist

- [ ] Load default set via `defaultChinaChannelProfiles()` (rn-core) or project channel profile file.
- [ ] Run structural validation: `validateChannelProfileSet(profiles)`.
- [ ] If issue code `pending_rules` on e.g. `360-best-effort` → JS train blocked for that channel (`isJsBlockedForChannel`).
- [ ] Expired evidence (`expiresAt` in past) fails set validation — renew evidence before promote to that channel.
- [ ] First-class channels require complete set (seven channels).

**Verify:** `node scripts/verify-channel-profile.mjs`

---

## Quick reference

| Scenario | Primary verify |
|----------|----------------|
| Kill / pause | `verify-cp-kill-pause.mjs` |
| e2e_fail promote block | `verify-cp-e2e-promote-gate.mjs` |
| consistency_fail | `verify-consistency-gate.mjs` |
| SBOM | `verify-cp-sbom-promote-gate.mjs` |
| Governance | `verify-cp-governance-promote-gate.mjs` |
| Rollout / SLO | `verify-cp-rollout-tick.mjs` |
| Exception expiry | `verify-compliance-profile.mjs` |
| Channel pending-rules | `verify-channel-profile.mjs` |
| Runbook contract | `verify-ops-runbook.mjs` |
| Map D loop | `run-map-d-loop.mjs` |
