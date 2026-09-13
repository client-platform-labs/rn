#!/usr/bin/env node
/**
 * Live fail-closed probe for the revocation path (#268).
 *
 * Companion to `verify-crl-tamper-stub.mjs`:
 *   - that one verifies the INSTRUMENT offline against a fixture;
 *   - this one drives the REAL shipped code (`createControlPlaneFetch` from
 *     shell-core) against a REAL running control plane and a REAL tamper stub,
 *     so the fail-closed contract is asserted on real bytes rather than on a
 *     re-implementation of the check.
 *
 * What it proves without a device: the client-side half of device acceptance
 * leg B. What it cannot prove: that the on-device shell actually re-launches the
 * baseline (that needs hardware — see the runbook).
 *
 * Requires: a CP on --upstream whose /v1/crl is SIGNED, and the tamper stub.
 * Exit codes: 0 PASS · 1 FAIL · 2 SKIP (precondition unmet — SKIP != PASS).
 *
 * Usage:
 *   node scripts/e2e/verify-crl-failclosed-live.mjs [--upstream http://127.0.0.1:4040]
 */
import { spawn } from "node:child_process";
import path from "node:path";

const STUB = path.join(import.meta.dirname, "cp-crl-tamper-stub.mjs");
const REPO = path.resolve(import.meta.dirname, "..", "..");
const upstream = (() => {
  const i = process.argv.indexOf("--upstream");
  return (i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : "http://127.0.0.1:4040").replace(/\/+$/, "");
})();

const { createControlPlaneFetch } = await import(
  `file://${path.join(REPO, "packages/shell-core/dist/release-boot.js")}`
);

let fails = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fails += 1;
};

/** Reads the CP's own seal verification key, so the fake adapter mirrors a device. */
async function readCrlKeyHex() {
  const res = await fetch(`${upstream}/v1/crl`);
  const body = await res.json();
  if (typeof body?.seal !== "string" || typeof body?.payload !== "string") return null;
  // The key that signs the CRL is the one a device must have baked. We cannot
  // read it from the seal, so the caller passes it in (E2E_CRL_PUBKEY_HEX).
  return process.env.E2E_CRL_PUBKEY_HEX?.trim() || null;
}

/** A device-shaped adapter: only the surface the revocation check touches. */
const fakeNative = (pubkeyHex) => ({ getOtaPublicKeys: () => (pubkeyHex ? [pubkeyHex] : []) });

async function fetchRevocations(port, pubkeyHex) {
  const { fetchRevocations } = createControlPlaneFetch(`http://127.0.0.1:${port}`, {
    native: fakeNative(pubkeyHex),
    timeoutMs: 8000,
  });
  return await fetchRevocations();
}

// ── preconditions ──────────────────────────────────────────────────────────
const pubkeyHex = await readCrlKeyHex();
if (!pubkeyHex) {
  console.log("  ⊘ SKIP: /v1/crl is not signed, or E2E_CRL_PUBKEY_HEX is unset.");
  console.log("    Set the CP's signing key (RN_DELIVERY_SIGN_KEY_FILE/PEM) and pass its");
  console.log("    public key hex — a device cannot verify a CRL it has no key for.");
  process.exit(2);
}

let stubPort = 47000 + (process.pid % 500);
const startStub = (mode, port) => {
  const child = spawn(process.execPath, [STUB, "--port", String(port), "--upstream", upstream, "--mode", mode], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ready = new Promise((resolve, reject) => {
    let out = "";
    const t = setTimeout(() => reject(new Error(`stub ${mode} not ready`)), 10_000);
    child.stdout.on("data", (c) => {
      out += c;
      if (out.includes(`STUB_READY ${port}`)) {
        clearTimeout(t);
        resolve();
      }
    });
    child.on("exit", (code) => {
      clearTimeout(t);
      reject(new Error(`stub ${mode} exited ${code}`));
    });
  });
  return { child, ready };
};

// ── 1. the healthy leg: the real CP's CRL must verify ──────────────────────
const direct = createControlPlaneFetch(upstream, {
  native: fakeNative(pubkeyHex),
  timeoutMs: 8000,
});
try {
  const revoked = await direct.fetchRevocations();
  check("live CP: signed CRL verifies and is trusted", Array.isArray(revoked), `revoked=${JSON.stringify(revoked)}`);
} catch (err) {
  check(
    "live CP: signed CRL verifies and is trusted",
    false,
    `${err instanceof Error ? err.message : String(err)} (wrong E2E_CRL_PUBKEY_HEX?)`,
  );
}

// ── 2. the degraded legs: each must refuse, and with the right reason ─────
for (const [mode, expect] of [
  ["unsigned", /CRL unsigned/],
  ["tampered", /CRL seal invalid/],
  ["http-404", /CRL HTTP 404/],
]) {
  const { child, ready } = startStub(mode, stubPort);
  try {
    await ready;
    try {
      const revoked = await fetchRevocations(stubPort, pubkeyHex);
      check(`[${mode}] must NOT be trusted`, false, `it was trusted: revoked=${JSON.stringify(revoked)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      check(`[${mode}] fail-closed with the right reason`, expect.test(msg), `got "${msg}"`);
    }
  } finally {
    child.kill("SIGKILL");
    await new Promise((r) => setTimeout(r, 150));
  }
}

// ── 3. the control leg: a transparent stub must still verify ──────────────
// Without this, "the tampered legs refused" could be explained by the stub
// breaking every connection rather than by the signature check.
{
  const { child, ready } = startStub("ok", stubPort);
  try {
    await ready;
    try {
      const revoked = await fetchRevocations(stubPort, pubkeyHex);
      check("[ok] transparent stub still verifies (control leg)", Array.isArray(revoked), `revoked=${JSON.stringify(revoked)}`);
    } catch (err) {
      check("[ok] transparent stub still verifies (control leg)", false, `${err instanceof Error ? err.message : String(err)}`);
    }
  } finally {
    child.kill("SIGKILL");
  }
}

// ── 4. an empty key set must fail closed (no baked trust root) ────────────
{
  const { fetchRevocations: fr } = createControlPlaneFetch(upstream, {
    native: fakeNative(null),
    timeoutMs: 8000,
  });
  try {
    const revoked = await fr();
    check("no baked keys: must fail closed", false, `it was trusted: revoked=${JSON.stringify(revoked)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check("no baked keys: must fail closed", /CRL seal invalid/.test(msg), `got "${msg}"`);
  }
}

console.log(fails === 0 ? "\nPASS verify-crl-failclosed-live" : `\nFAIL verify-crl-failclosed-live (${fails})`);
process.exit(fails === 0 ? 0 : 1);
