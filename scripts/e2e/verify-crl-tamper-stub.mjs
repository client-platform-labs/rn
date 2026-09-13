#!/usr/bin/env node
/**
 * Probe for the CRL tamper stub (#268).
 *
 * The stub is the instrument for device acceptance leg B ("tampered /v1/crl must
 * be rejected"). If the instrument is broken, that leg fails for the wrong
 * reason — or worse, PASSES for the wrong reason (nothing attempted → "no
 * install" observed). So the stub is verified here, without a device:
 *
 *   ok         must be byte-transparent (the control leg's premise)
 *   unsigned   must carry no seal/payload and an EMPTY revoked list
 *   tampered   must preserve payload + seal LENGTH while changing the seal
 *   http-404   must return 404
 *   passthrough must keep every non-/v1/crl route working in every mode
 *
 * Exit codes follow the suite contract (scripts/e2e/lib.sh): 0 PASS, 1 FAIL.
 *
 * Usage: node scripts/e2e/verify-crl-tamper-stub.mjs
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";

const STUB = path.join(import.meta.dirname, "cp-crl-tamper-stub.mjs");
const REAL_SEAL = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
const REAL_PAYLOAD = '{"schemaVersion":1,"revoked":["revoked-key-hex"]}';

let fails = 0;
const check = (label, ok, detail = "") => {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    fails += 1;
  }
};

/** Minimal CP double: a signed /v1/crl plus a route the stub must pass through. */
async function startFakeCp() {
  const server = createServer((req, res) => {
    if (req.url.startsWith("/v1/crl")) {
      res.writeHead(200, { "content-type": "application/json" });
      // `revoked` non-empty on purpose: the stub must strip it, so a probe can
      // tell "the list was cleared" from "the list came back empty anyway".
      res.end(
        JSON.stringify({
          schemaVersion: 1,
          revoked: ["revoked-key-hex"],
          payload: REAL_PAYLOAD,
          seal: REAL_SEAL,
        }),
      );
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, path: req.url }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, port: server.address().port };
}

function startStub({ port, upstream, mode }) {
  const child = spawn(
    process.execPath,
    [STUB, "--port", String(port), "--upstream", upstream, "--mode", mode],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const ready = new Promise((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error(`stub ${mode} not ready`) ), 10_000);
    child.stdout.on("data", (c) => {
      out += c;
      if (out.includes(`STUB_READY ${port}`)) {
        clearTimeout(timer);
        resolve(out);
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`stub ${mode} exited early (code ${code})`));
    });
  });
  return { child, ready };
}

async function get(port, p) {
  const res = await fetch(`http://127.0.0.1:${port}${p}`);
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON is fine for this probe */
  }
  return { status: res.status, body, text };
}

const { server: cp, port: cpPort } = await startFakeCp();
const upstream = `http://127.0.0.1:${cpPort}`;
let stubPort = 46000 + (process.pid % 500);

try {
  // The upstream double must itself look like a signed CP, else the `tampered`
  // assertions below would be vacuous.
  const real = await get(cpPort, "/v1/crl");
  check("fixture: fake CP serves a signed CRL", typeof real.body?.seal === "string" && typeof real.body?.payload === "string");

  for (const mode of ["ok", "unsigned", "tampered", "http-404"]) {
    const { child, ready } = startStub({ port: stubPort, upstream, mode });
    try {
      await ready;
      const crl = await get(stubPort, "/v1/crl");
      const health = await get(stubPort, "/health");

      // Every mode must remain transparent for non-/v1/crl routes; otherwise a
      // "no install" result is explained by a broken pipe, not by fail-closed.
      check(
        `[${mode}] passthrough keeps /health working`,
        health.status === 200 && health.body?.ok === true,
        `got ${health.status} ${health.text.slice(0, 60)}`,
      );

      if (mode === "ok") {
        check(
          "[ok] byte-transparent /v1/crl (control leg premise)",
          crl.body?.seal === REAL_SEAL && crl.body?.revoked?.length === 1,
          `seal=${crl.body?.seal?.slice(0, 8)} revoked=${JSON.stringify(crl.body?.revoked)}`,
        );
      } else if (mode === "unsigned") {
        check(
          "[unsigned] no seal, no payload",
          crl.status === 200 && !("seal" in (crl.body ?? {})) && !("payload" in (crl.body ?? {})),
          `body=${crl.text.slice(0, 80)}`,
        );
        check(
          "[unsigned] revocation list cleared (the attack shape)",
          Array.isArray(crl.body?.revoked) && crl.body.revoked.length === 0,
          `revoked=${JSON.stringify(crl.body?.revoked)}`,
        );
      } else if (mode === "tampered") {
        check(
          "[tampered] payload preserved",
          crl.body?.payload === REAL_PAYLOAD,
          `payload=${String(crl.body?.payload).slice(0, 40)}`,
        );
        check(
          "[tampered] seal differs from the real seal",
          typeof crl.body?.seal === "string" && crl.body.seal !== REAL_SEAL,
          `seal=${String(crl.body?.seal).slice(0, 12)}`,
        );
        check(
          "[tampered] seal keeps its length and hex shape",
          typeof crl.body?.seal === "string" &&
            crl.body.seal.length === REAL_SEAL.length &&
            /^[0-9a-fA-F]+$/.test(crl.body.seal),
          `len=${crl.body?.seal?.length}`,
        );
        check(
          "[tampered] revocation list cleared (the attack shape)",
          Array.isArray(crl.body?.revoked) && crl.body.revoked.length === 0,
        );
      } else if (mode === "http-404") {
        check("[http-404] /v1/crl answers 404", crl.status === 404, `got ${crl.status}`);
      }
    } finally {
      child.kill("SIGKILL");
      // reclaim the port for the next mode
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  // Negative control: an unreachable upstream must make `tampered` refuse to
  // serve rather than invent a seal, i.e. the instrument cannot fabricate the
  // very signal the device leg is supposed to observe. Bounded so a stub that
  // (wrongly) starts listening instead of failing fast is reported as a FAIL
  // rather than hanging the suite.
  const dead = spawn(
    process.execPath,
    [STUB, "--port", String(stubPort + 1), "--upstream", "http://127.0.0.1:1", "--mode", "tampered"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const deadCode = await Promise.race([
    new Promise((r) => dead.on("exit", r)),
    new Promise((r) => setTimeout(() => r("TIMEOUT"), 10_000)),
  ]);
  if (deadCode === "TIMEOUT") dead.kill("SIGKILL");
  check(
    "negative control: tampered + unreachable upstream exits non-zero (no invented seal)",
    typeof deadCode === "number" && deadCode !== 0,
    `exit=${deadCode}`,
  );
} finally {
  // closeAllConnections: the stub's fetches are keep-alive, so a plain close()
  // would wait on idle sockets and keep the probe alive.
  cp.closeAllConnections?.();
  cp.close();
}

console.log(fails === 0 ? "\nPASS verify-crl-tamper-stub" : `\nFAIL verify-crl-tamper-stub (${fails})`);
process.exit(fails === 0 ? 0 : 1);
