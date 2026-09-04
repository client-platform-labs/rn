# Metro peel real-mode runbook (#141b)

Step-by-step commands for reproducing the real `react-native bundle` +
`hermesc` peel pipeline locally. Use this when:

- You have changed the metro config or example project and want to
  verify the HBCs still build.
- You're setting up the toolchain on a fresh machine.
- The `--real` verify check is failing and you need to bisect.

## 1. Verify the toolchain

The real-mode pipeline needs three things on disk:

```bash
# 1a. Node 24 (the repo's pinned version)
/Users/xuwei/.nvm/versions/node/v24.19.0/bin/node --version
# v24.19.0

# 1b. RN 0.87 host project with react-native + hermesc installed
#     Default: ~/code/tiangong-host (overridable via TIANGONG_HOST)
ls /Users/xuwei/code/tiangong-host/node_modules/react-native/package.json
ls /Users/xuwei/code/tiangong-host/node_modules/hermes-compiler/hermesc/osx-bin/hermesc

# 1c. The pack script (this repo)
ls /path/to/client-platform-labs/rn/scripts/pack-base-peel.mjs
```

If `hermesc` is missing, install it via the host project:

```bash
cd ~/code/tiangong-host   # or whatever TIANGONG_HOST points at
pnpm install                # installs react-native + hermes-compiler
ls node_modules/hermes-compiler/hermesc/osx-bin/hermesc
```

If the host project doesn't have `hermesc`, install it explicitly:

```bash
cd ~/code/tiangong-host
pnpm add -D hermes-compiler
```

## 2. Build the contract spine

```bash
cd /path/to/client-platform-labs/rn
pnpm --filter @client-platform/rn-core build
```

The `metro-peel.ts` types + functions are loaded by `pack-base-peel.mjs`
at startup; if the dist is stale, the contract gate may misbehave.

## 3. Run the synthetic verify (fast)

This is the always-on contract gate. No Metro, no hermesc.

```bash
node scripts/verify-base-peel.mjs --config examples/base-host/client-platform.peel.jsonc
```

Expected: 9/9 OK, exits 0.

## 4. Run the real verify (slow)

```bash
node scripts/verify-base-peel.mjs --config examples/base-host/client-platform.peel.jsonc --real
```

Expected: 17/17 OK, exits 0. Takes ~10s on a Mac mini. Each Metro run
spawns ~4 transform workers; the warnings about `NO_COLOR` are harmless.

## 5. Manual pack + inspect

```bash
# 5a. Pack into a temp dir
rm -rf /tmp/peel-r1
node scripts/pack-base-peel.mjs \
  --config examples/base-host/client-platform.peel.jsonc \
  --real \
  --out /tmp/peel-r1

# 5b. Inspect the artefacts
ls -la /tmp/peel-r1/
#  base/                            ← base pack artefacts
#  base-module-id-map.json          ← shared id map (525+ entries)
#  base.marker.json                 ← HBC pointer + digest
#  peeled/
#    checkout.marker.json
#    checkout/
#    orders.marker.json
#    orders/
#  sidecar-draft.json               ← BundleManager ingest shape

# 5c. Verify the HBC magic
xxd /tmp/peel-r1/base/index.hbc | head -1
# 00000000: c61f bc03 c103 191f  ...  ← Hermes bytecode magic (0xc61fbc03 LE)

# 5d. Verify the digests
cat /tmp/peel-r1/base.marker.json
# {
#   "schemaVersion": 1,
#   "kind": "base",
#   "base_digest": "<sha256>",
#   "module_id_map_digest": "<sha256>",
#   "hbcPath": "base/index.hbc",
#   "hbcBytes": 1258216,
#   ...
# }

shasum -a 256 /tmp/peel-r1/base/index.hbc
# <same sha256 as base.marker.json.base_digest>
```

## 6. Id-stability check (most important contract)

```bash
# 6a. Run --real twice into separate temp dirs
rm -rf /tmp/peel-r1 /tmp/peel-r2
node scripts/pack-base-peel.mjs \
  --config examples/base-host/client-platform.peel.jsonc \
  --real --out /tmp/peel-r1
node scripts/pack-base-peel.mjs \
  --config examples/base-host/client-platform.peel.jsonc \
  --real --out /tmp/peel-r2

# 6b. The persisted id maps must be byte-identical
diff /tmp/peel-r1/base-module-id-map.json /tmp/peel-r2/base-module-id-map.json
# (no output = pass)

# 6c. HBCs may differ slightly (hermesc embeds a build timestamp)
#     but their sha256 digests must also match
shasum -a 256 /tmp/peel-r1/base/index.hbc /tmp/peel-r2/base/index.hbc
# the two sha256s MUST be identical

# 6d. The verify script's --real mode wraps 6a-6c automatically
node scripts/verify-base-peel.mjs \
  --config examples/base-host/client-platform.peel.jsonc \
  --real
```

If the id maps drift, the persistent factory is broken. Likely causes:

- The `RN_PEEL_CTX` env var was not set before requiring the metro
  config (the factory would have created a fresh empty map).
- The `relativizeToRoot` function in the metro config was changed and
  no longer aligns with the JSONC config's project-relative paths.
- A new pack was added but the `peeledModules` graph in the JSONC
  config wasn't updated, so Metro walked a different graph.

## 7. Override the toolchain path

If your RN toolchain doesn't live at `~/code/tiangong-host`:

```bash
export TIANGONG_HOST=/path/to/your/host
node scripts/verify-base-peel.mjs --config examples/base-host/client-platform.peel.jsonc --real
```

The `hermescBin` field in `examples/base-host/client-platform.peel.jsonc`
can also be overridden per-config (the default uses the `${TIANGONG_HOST}`
token).

## 8. Skip hermesc (offline mode)

If `hermesc` is not available but you want to verify the Metro part
of the pipeline:

```bash
# The pack script will FAIL with "hermesc not found" if --real is
# passed. Use the synthetic mode instead:
node scripts/verify-base-peel.mjs --config examples/base-host/client-platform.peel.jsonc
```

The `--real` verify check itself has a `hermesc missing → skip
real-only checks` fallback so the script exits 0 even if hermesc is
not installed (it just skips the HBC magic / digest checks).

## 9. CI integration sketch

The brownfield host CI can run the real verify on every push:

```yaml
# .github/workflows/host-peel.yml (sketch)
- name: Metro peel real verify
  env:
    TIANGONG_HOST: ${{ github.workspace }}/host
  run: |
    cd client-platform-labs/rn
    pnpm --filter @client-platform/rn-core build
    node scripts/verify-base-peel.mjs \
      --config examples/base-host/client-platform.peel.jsonc \
      --real
```

The AFK spine's `run-metro-peel-loop.mjs` always uses synthetic mode
and is wired into the Map D loop; it stays fast for pre-merge lanes.
