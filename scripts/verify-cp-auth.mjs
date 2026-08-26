#!/usr/bin/env node
/**
 * Map B — CP bearer auth on rn-delivery serve mutating routes.
 *
 * Usage:
 *   node scripts/verify-cp-auth.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = mkdtempSync(path.join(tmpdir(), "rn-cp-auth-"));
const port = 15040 + Math.floor(Math.random() * 1000);
const token = "map-b-verify-token";
const bin = path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs");

mkdirSync(path.join(projectRoot, ".rn/delivery"), { recursive: true });
writeFileSync(
  path.join(projectRoot, "package.json"),
  JSON.stringify({ name: "cp-auth-demo" }),
);
writeFileSync(
  path.join(projectRoot, ".rn/delivery/registry.json"),
  JSON.stringify({ staging: [], production: [], blocked: [] }, null, 2),
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const child = spawn(
  process.execPath,
  [bin, "serve", "--port", String(port), "--host", "127.0.0.1"],
  {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, RN_CP_TOKEN: token },
  },
);

let failed = false;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = true;
}

process.on("exit", () => {
  child.kill("SIGTERM");
});

try {
  await sleep(600);
  const base = `http://127.0.0.1:${port}`;

  const health = await fetchJson(`${base}/health`);
  if (health.status !== 200) fail(`health ${health.status}`);
  else console.log("OK health (no auth)");

  const noAuth = await fetchJson(`${base}/v1/promote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ digest: "deadbeef" }),
  });
  if (noAuth.status !== 401) {
    fail(`promote without token should 401, got ${noAuth.status}`);
  } else {
    console.log("OK POST /v1/promote rejects missing Bearer");
  }

  const badAuth = await fetchJson(`${base}/v1/block`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer wrong-token",
    },
    body: JSON.stringify({ digest: "deadbeef", reason: "x" }),
  });
  if (badAuth.status !== 401) {
    fail(`block wrong token should 401, got ${badAuth.status}`);
  } else {
    console.log("OK POST /v1/block rejects invalid Bearer");
  }

  const authed = await fetchJson(`${base}/v1/block`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ digest: "deadbeef", reason: "verify drill" }),
  });
  if (authed.status !== 400) {
    fail(`authed block unknown digest should 400, got ${authed.status}`);
  } else {
    console.log("OK authed POST reaches handler (400 unknown digest)");
  }
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  child.kill("SIGTERM");
}

if (failed) process.exit(1);
console.log("verify-cp-auth: PASS");
