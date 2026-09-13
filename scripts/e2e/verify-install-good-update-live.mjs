#!/usr/bin/env node
/**
 * Live install probe for the OTA update path (#268 leg 1).
 *
 * Companion to `verify-crl-failclosed-live.mjs`:
 *   - that one proves the device REJECTS an untrusted update (fail-closed);
 *   - this one proves the device-side code ACCEPTS and INSTALLS a good one.
 *
 * The previous device run could only prove rejection: the control plane's
 * candidate was sealed with a key the DUT did not trust, so the real
 * `gateBundleLoad` refused it. This probe drives the REAL shipped boot sequence
 * (`bootReleaseOta` from shell-core) against a REAL control plane serving a REAL
 * cert-chain-signed candidate, through the full native adapter surface, and
 * asserts the outcome is `installed`.
 *
 * What it proves without a device: the whole JS half of the install leg —
 * revocation fetch, manifest fetch, seal + cert-chain verification, artifact
 * download, digest check, slot write, installed_update_id persistence and the
 * reload call — on real bytes rather than on a re-implementation.
 * What it cannot prove: that the on-device native writes land and the process
 * actually restarts (needs hardware — see the runbook).
 *
 * Requirements: a CP reachable at --upstream whose /v1/crl is SIGNED and whose
 * production lane holds a js-update candidate for --module, plus the device's
 * BAKED root-CA pubkey (--pubkey-hex or E2E_BAKED_PUBKEY_HEX).
 *
 * Exit codes: 0 PASS · 1 FAIL · 2 SKIP (precondition unmet — SKIP != PASS).
 *
 * Usage:
 *   node scripts/e2e/verify-install-good-update-live.mjs \
 *     --upstream http://127.0.0.1:4040 --module main --pubkey-hex <64hex>
 */
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..", "..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const upstream = arg("--upstream", "http://127.0.0.1:4040").replace(/\/+$/, "");
const moduleId = arg("--module", "main");
const bakedPubkeyHex = arg("--pubkey-hex", process.env.E2E_BAKED_PUBKEY_HEX ?? "");

const skip = (why) => {
  console.log(`SKIP: ${why}`);
  process.exit(2);
};

if (!/^[0-9a-fA-F]{64}$/.test(bakedPubkeyHex)) {
  skip(
    "no baked root-CA pubkey — pass --pubkey-hex <64hex> (the key the DUT bakes; find it in its OtaModule.kt pushString) or set E2E_BAKED_PUBKEY_HEX",
  );
}

const { bootReleaseOta } = await import(
  `file://${path.join(REPO, "packages/shell-core/dist/release-boot.js")}`
);

let fails = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fails += 1;
};

// Preconditions that make the probe meaningful rather than vacuous.
let health;
try {
  const res = await fetch(`${upstream}/health`, { signal: AbortSignal.timeout(5000) });
  health = await res.json();
} catch (err) {
  skip(`control plane not reachable at ${upstream} (${err.message})`);
}
const crl = await (await fetch(`${upstream}/v1/crl`)).json();
if (typeof crl?.seal !== "string" || typeof crl?.payload !== "string") {
  skip(
    "the CP's /v1/crl is UNSIGNED — the device would fail closed on it, so an install can never happen (configure RN_DELIVERY_SIGN_KEY_FILE with the RCA key)",
  );
}
const lane = await (
  await fetch(`${upstream}/v1/js-updates?module=${moduleId}&lane=production`, {
    headers: process.env.RN_CP_TOKEN ? { Authorization: `Bearer ${process.env.RN_CP_TOKEN}` } : {},
  })
).json();
if (!(lane?.candidates ?? []).length) {
  skip(`no production-lane js-update candidate for module=${moduleId} — nothing to install`);
}

/**
 * Device-shaped native adapter. Faithful to `OtaNativeAdapter`, and it RECORDS
 * every call so a failure can be attributed to the exact step rather than
 * reported as "nothing happened" (which is what the silent on-device path gives
 * you: the shell catches the boot error and renders the baseline).
 */
function recordingNative(pubkeyHex) {
  const calls = [];
  const state = { installedUpdateId: null, bytes: 0, reloads: 0 };
  const rec = (name) => calls.push(name);
  const adapter = {
    getOtaPublicKeys: () => [pubkeyHex],
    ensureModuleSlots: async (m) => {
      rec(`ensureModuleSlots(${m})`);
    },
    writeFileBase64: async (rel, b64) => {
      rec(`writeFileBase64(${rel})`);
      state.bytes += Buffer.from(b64, "base64").length;
      return `files/${rel}`;
    },
    writeFileUtf8: async (rel) => {
      rec(`writeFileUtf8(${rel})`);
      return `files/${rel}`;
    },
    setActiveBundlePathForModule: async () => rec("setActiveBundlePathForModule"),
    clearActiveBundlePathForModule: async () => rec("clearActiveBundlePathForModule"),
    setRootModuleId: async () => rec("setRootModuleId"),
    getActiveBundlePathForModule: async () => null,
    getActiveBundlePath: async () => null,
    getInstalledUpdateId: async () => state.installedUpdateId,
    setInstalledUpdateId: async (_m, id) => {
      rec(`setInstalledUpdateId(${id})`);
      state.installedUpdateId = id;
    },
    reload: async () => {
      rec("reload");
      state.reloads += 1;
    },
    recordStartupFailure: async () => 0, // healthy device: below the crash-loop budget
    resetStartupFailures: async () => rec("resetStartupFailures"),
  };
  return { adapter, calls, state };
}

const { adapter, calls, state } = recordingNative(bakedPubkeyHex);
const warnings = [];
const outcome = await bootReleaseOta(
  {
    native: adapter,
    controlPlaneBaseUrl: upstream,
    warn: (m) => warnings.push(m),
  },
  moduleId,
);

console.log(`  cp: ${upstream} (project ${health.projectRoot ?? "?"})`);
console.log(`  outcome: phase=${outcome.phase} status=${outcome.result?.status ?? "-"} reason=${outcome.result?.reason ?? outcome.skippedReason ?? "-"}`);
console.log(`  native calls: ${calls.join(" → ") || "(none)"}`);

check(
  "the boot installed the update",
  outcome.result?.status === "installed",
  outcome.result?.status ?? outcome.skippedReason ?? "no result",
);
check(
  "the artifact was written to a module slot",
  calls.some((c) => c.startsWith("writeFileBase64(")),
  calls.find((c) => c.startsWith("writeFileBase64(")) ?? "no write",
);
check(
  "installed_update_id was persisted (skips the re-pull on the next boot)",
  state.installedUpdateId === outcome.result?.updateId && state.installedUpdateId !== null,
  String(state.installedUpdateId),
);
check("the reload was requested (activation)", state.reloads === 1, `${state.reloads} reload(s)`);
check("no control-plane warning was emitted", warnings.length === 0, warnings.join(" | "));

if (fails > 0) {
  console.log(`FAIL: ${fails} check(s) failed`);
  process.exit(1);
}
console.log("PASS verify-install-good-update-live");
process.exit(0);
