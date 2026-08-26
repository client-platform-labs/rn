#!/usr/bin/env node
/**
 * Map B B5 — CP role matrix (viewer read-only · admin mutate).
 *
 * Usage:
 *   node scripts/verify-cp-rbac.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = mkdtempSync(path.join(tmpdir(), "rn-cp-rbac-"));
const port = 16040 + Math.floor(Math.random() * 1000);
const token = "map-b-rbac-token";
const bin = path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs");

mkdirSync(path.join(projectRoot, ".rn/delivery"), { recursive: true });
writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "cp-rbac-demo" }));
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

function spawnServe(role) {
  return spawn(process.execPath, [bin, "serve", "--port", String(port), "--host", "127.0.0.1"], {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      RN_CP_TOKEN: token,
      RN_CP_ROLE: role,
    },
  });
}

let failed = false;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = true;
}

const base = `http://127.0.0.1:${port}`;

try {
  const viewer = spawnServe("viewer");
  await sleep(600);

  const read = await fetchJson(`${base}/v1/registry`);
  if (read.status !== 200) fail(`viewer GET registry ${read.status}`);
  else console.log("OK viewer GET /v1/registry");

  const viewerPost = await fetchJson(`${base}/v1/promote`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ digest: "deadbeef" }),
  });
  if (viewerPost.status !== 403) {
    fail(`viewer POST promote should 403, got ${viewerPost.status}`);
  } else {
    console.log("OK viewer POST /v1/promote → 403");
  }
  viewer.kill("SIGTERM");
  await sleep(300);

  const admin = spawnServe("admin");
  await sleep(600);

  const adminPost = await fetchJson(`${base}/v1/block`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ digest: "deadbeef", reason: "rbac drill" }),
  });
  if (adminPost.status !== 400) {
    fail(`admin POST should reach handler (400), got ${adminPost.status}`);
  } else {
    console.log("OK admin POST reaches handler (400 unknown digest)");
  }
  admin.kill("SIGTERM");
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

if (failed) process.exit(1);
console.log("verify-cp-rbac: PASS");
