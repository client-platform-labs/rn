# Multi-pack Bind harness (Docker + adb)

**Map:** [#149](https://github.com/client-platform-labs/rn/issues/149) · Task: [#155](https://github.com/client-platform-labs/rn/issues/155)

This harness is the **automated evidence** for the "Host 真·Bind" milestone
— desk + fixture_second Metros up side by side, with the bind contracts
checked end-to-end (Metro `/status`, host-surface bundle, optional adb cold start).

It replaces the manual "open two terminals" ritual so the AFK loop can gate
on `verify-dev-harness.mjs`.

---

## What it does

| Step | Owner | Output |
|------|-------|--------|
| Spawn `rn module dev` in `desk` (port 8081) | `start-dual-pack.mjs` | Metro process + log prefix `[metro:desk]` |
| Spawn `rn module dev` in `fixture_second` (port 8082) | `start-dual-pack.mjs` | Metro process + log prefix `[metro:fixture_second]` |
| Write PID + port table | both | `.rn/dev-harness.json` |
| SIGINT/SIGTERM cleanup | both | both Metros killed |
| Verify (separate process) | `verify-dev-harness.mjs` | exit 0/1 |

No tmux dependency: background processes + signal forwarding.

---

## Usage

### Start the harness

```bash
# From the platform-labs/rn worktree:
node scripts/dev-harness/start-dual-pack.mjs

# Custom paths:
DESK_ROOT=/path/to/desk \
  FIXTURE_SECOND_ROOT=/path/to/fixture_second \
  node scripts/dev-harness/start-dual-pack.mjs
```

It writes `.rn/dev-harness.json` so the verifier can find PIDs + ports without
parsing stdout. Press `Ctrl+C` to stop both Metros cleanly.

### Verify the harness (AFK gate)

```bash
# Exit 0 = green; exit 2 = harness not started (SKIP).
node scripts/verify-dev-harness.mjs

# Strict mode: SKIP becomes FAIL.
STRICT=1 node scripts/verify-dev-harness.mjs
```

What it asserts (per module):

1. **PID alive** (or Metro still responding — tolerates parent re-spawn).
2. `GET http://127.0.0.1:<port>/status` → 200 + body contains `packager-status:running`.
3. `GET http://127.0.0.1:<port>/index.bundle?platform=android&dev=true` → 200 + `application/javascript`.
4. If `adb devices` lists at least one authorized device AND the catalog embed
   has `androidPackage` for the module, runs `adb shell am start` to confirm
   cold start. Missing `androidPackage` is SKIP, not FAIL.

### Docker / CI

In CI the harness runs the same way but the Metros must exit cleanly when the
harness script receives SIGTERM. For containerized runs:

```bash
docker run --rm \
  -v "$PWD:/repo" \
  -v "$HOME/code/desk:/desk:ro" \
  -v "$HOME/code/fixture_second:/fixture_second:ro" \
  -w /repo \
  node:24 \
  bash -c "DESK_ROOT=/desk FIXTURE_SECOND_ROOT=/fixture_second \
           node scripts/dev-harness/start-dual-pack.mjs & \
           HARNESS_PID=\$!; \
           sleep 20; \
           node scripts/verify-dev-harness.mjs; \
           kill -TERM \$HARNESS_PID"
```

The `sleep 20` is the cold-start window — both Metros need time to bind ports,
build initial bundles, and write `packager-status:running`.

---

## Manifest shape (`.rn/dev-harness.json`)

```json
{
  "schemaVersion": 1,
  "startedAt": "2026-09-04T14:30:00.000Z",
  "pid": 12345,
  "modules": [
    { "id": "desk", "root": "/path/to/desk", "port": 8081, "pid": 12346 },
    { "id": "fixture_second", "root": "/path/to/fixture_second", "port": 8082, "pid": 12347 }
  ]
}
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Metro /status` returns `ECONNREFUSED` | Metro not yet bound | Wait 10–20s and re-run verify |
| `host-surface bundle` 404 | `metro.config.js` missing the `host-surface` entry | `npm run dev` already configured for both packs |
| adb cold start `Activity class … does not exist` | catalog embed has no `androidPackage` | host-ops: re-run `rn module register <id>` with androidPackage set |
| harness exits without writing manifest | DESK_ROOT/FIXTURE_SECOND_ROOT not set | set env vars; or edit defaults in the script |

---

## Related

- [verify-multi-pack-bind.mjs](../../scripts/verify-multi-pack-bind.mjs) — file/contract layer (catalog embed, `resolveBindMetroUrl` USB+Wi‑Fi rules)
- [verify-dual-pack-live.mjs](../../scripts/verify-dual-pack-live.mjs) — Broker Live row check (USB/LAN URLs match Metro ports)
- [verify-panel-sot.mjs](../../scripts/verify-panel-sot.mjs) — catalog embed drives Panel SoT (#155)
- [module-developer.md](./module-developer.md) — `resolveBindMetroUrl` USB vs Wi‑Fi contract
