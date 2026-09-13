#!/usr/bin/env node
/**
 * Control-plane CRL tamper stub — device acceptance leg B (#268).
 *
 * The device must REJECT an update when the control plane's revocation list is
 * not trustworthy, and stay on the embedded baseline. That behaviour cannot be
 * demonstrated with a healthy control plane, so this stub sits between the
 * device and the real CP and degrades ONLY `/v1/crl`:
 *
 *   --mode unsigned   `{schemaVersion, revoked: []}` with no seal/payload
 *                     → shell-core must throw "CRL unsigned"
 *   --mode tampered   the real body with one hex nibble of `seal` flipped
 *                     → shell-core must throw "CRL seal invalid"
 *   --mode http-404   → shell-core must throw "CRL HTTP 404"
 *   --mode ok         pure pass-through: the CONTROL leg. Without it a probe
 *                     cannot tell "rejected the tampered CRL" from "the stub
 *                     itself broke the connection, so nothing was attempted".
 *
 * Every degraded response keeps `revoked` EMPTY on purpose: clearing the
 * revocation list is exactly what an attacker who controls this endpoint wants,
 * and trusting it would re-enable a revoked signing key (the G3 hole that #253
 * closed by signing the list). Reasoning: docs/architecture/seam-deepening-map.md §8.
 *
 * Point the device at it with an adb reverse swap, so the app under test is not
 * rebuilt:
 *   adb -s "$E2E_DEVICE" reverse tcp:4040 tcp:<stub-port>
 * and restore afterwards:
 *   adb -s "$E2E_DEVICE" reverse tcp:4040 tcp:4040
 *
 * Usage:
 *   node scripts/e2e/cp-crl-tamper-stub.mjs [--port 4041] [--upstream http://127.0.0.1:4040]
 *        [--mode unsigned|tampered|http-404|ok] [--log /tmp/e2e-crl-stub.log]
 *        [--crl-delay-ms 8000]   # hold /v1/crl open (any mode) — see crlDelayMs
 *
 * Prints `STUB_READY <port>` on stdout once listening, then one line per request
 * (`<METHOD> <path> <status>`) so a probe can assert what was actually asked for.
 */
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";

const MODES = new Set(["unsigned", "tampered", "http-404", "ok"]);

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const port = Number(arg("port", "4041"));
const upstream = arg("upstream", "http://127.0.0.1:4040").replace(/\/+$/, "");
const mode = arg("mode", "unsigned");
const logFile = arg("log", "");
/**
 * Hold the /v1/crl response for N ms, in EVERY mode (#268).
 *
 * Why it exists: the crash-loop leg needs launches that DIE mid-boot, i.e. after
 * `recordStartupFailure` ran but before `resetStartupFailures` (which only runs on
 * a COMPLETED boot). Killing on a timer is a race the harness loses — a 0.6s kill
 * lands before the JS boot effect even runs (no increment) while an already-
 * installed update finishes its pull in well under a second (reset runs). Holding
 * the revocation list open turns "mid-pull" into a wide, deterministic window, so
 * the injection lands on every launch.
 */
const crlDelayMs = Number(arg("crl-delay-ms", "0"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!MODES.has(mode)) {
  console.error(`cp-crl-tamper-stub: unknown --mode ${mode} (expected ${[...MODES].join("|")})`);
  process.exit(2);
}

/** Cached real CRL for `tampered` (fetched once, validated at startup). */
let cachedRealCrl = null;

function log(line) {
  console.log(line);
  if (logFile) {
    try {
      appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);
    } catch {
      /* the probe reads stdout; a log file is a convenience */
    }
  }
}

/** Flip one hex nibble, keeping the string a valid same-length hex seal. */
function tamperSeal(seal) {
  const i = seal.search(/[0-9a-fA-F]/);
  if (i === -1) return null;
  const c = seal[i].toLowerCase();
  const replacement = c === "0" ? "1" : "0";
  return seal.slice(0, i) + replacement + seal.slice(i + 1);
}

/**
 * Build the degraded `/v1/crl` body. `tampered` reuses the CP's own signed body
 * so it is a genuine tamper rather than an invented value.
 */
async function degradedCrl() {
  if (mode === "http-404") {
    return { status: 404, body: JSON.stringify({ error: "not_found" }) };
  }
  if (mode === "unsigned") {
    // Shape an unsigned/naive CP would return: the revocation data with no
    // signature at all.
    return {
      status: 200,
      body: JSON.stringify({ schemaVersion: 1, revoked: [] }),
    };
  }
  const seal = typeof cachedRealCrl?.seal === "string" ? cachedRealCrl.seal : null;
  const flipped = seal ? tamperSeal(seal) : null;
  if (!flipped) {
    // Unreachable: the startup preflight already rejected this case.
    throw new Error("stub: no real seal to tamper");
  }
  return {
    status: 200,
    body: JSON.stringify({ ...cachedRealCrl, seal: flipped, revoked: [] }),
  };
}

/**
 * `ok` mode is a pure pass-through, `/v1/crl` included — it is the CONTROL leg.
 * Without it a probe cannot distinguish "the device rejected the tampered CRL"
 * from "the stub broke the connection, so nothing was attempted".
 */
const degradeCrl = mode !== "ok";

// Startup preflight for `tampered`: the stub must not be able to claim it is
// tampering when there is no signed CRL to tamper. Failing HERE (instead of on
// the device's first request) keeps the instrument honest — a mid-request exit
// would make the device leg look "fail-closed" for the wrong reason.
if (mode === "tampered") {
  try {
    const res = await fetch(`${upstream}/v1/crl`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (typeof body?.seal !== "string" || typeof body?.payload !== "string") {
      throw new Error("upstream /v1/crl carries no seal/payload — is the CP serving a SIGNED CRL?");
    }
    cachedRealCrl = body;
  } catch (err) {
    log(
      `[stub] FATAL: --mode tampered needs a reachable SIGNED /v1/crl at ${upstream} (${err instanceof Error ? err.message : String(err)})`,
    );
    process.exit(2);
  }
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
  // Either branch may hold the revocation list open; see crlDelayMs above.
  const holdCrl = path === "/v1/crl" && crlDelayMs > 0;
  if (path !== "/v1/crl" || !degradeCrl) {
    // Transparent for everything else: the manifest, artifacts and health must
    // still work, otherwise a "no install" result would prove nothing.
    try {
      const upstreamRes = await fetch(`${upstream}${req.url ?? "/"}`, {
        method: req.method,
        headers: { ...req.headers, host: new URL(upstream).host },
        body: req.method === "GET" || req.method === "HEAD" ? undefined : req,
        duplex: "half",
      });
      if (holdCrl) await sleep(crlDelayMs);
      res.writeHead(upstreamRes.status, {
        "content-type": upstreamRes.headers.get("content-type") ?? "application/json",
      });
      res.end(Buffer.from(await upstreamRes.arrayBuffer()));
      log(
        `${req.method} ${req.url} ${upstreamRes.status} (passthrough${holdCrl ? `, held ${crlDelayMs}ms` : ""})`,
      );
    } catch (err) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `stub upstream error: ${String(err)}` }));
      log(`${req.method} ${req.url} 502 (upstream error)`);
    }
    return;
  }

  const degraded = await degradedCrl();
  if (holdCrl) await sleep(crlDelayMs);
  res.writeHead(degraded.status, { "content-type": "application/json" });
  res.end(degraded.body);
  log(`${req.method} ${req.url} ${degraded.status} (${mode}${holdCrl ? `, held ${crlDelayMs}ms` : ""})`);
});

server.listen(port, "127.0.0.1", () => {
  log(`[stub] mode=${mode} upstream=${upstream}`);
  console.log(`STUB_READY ${port}`);
});
