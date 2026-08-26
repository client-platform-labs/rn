#!/usr/bin/env node
/**
 * #7 thin CP API smoke — rn-delivery serve over file registry.
 *
 * Usage:
 *   node scripts/verify-cp-stub-api.mjs [projectRoot]
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : mkdtempSync(path.join(tmpdir(), "rn-cp-stub-"));

if (!process.argv[2]) {
  mkdirSync(path.join(projectRoot, ".rn/delivery"), { recursive: true });
  writeFileSync(
    path.join(projectRoot, "package.json"),
    JSON.stringify({ name: "cp-stub-demo" }),
  );
  writeFileSync(
    path.join(projectRoot, ".rn/delivery/registry.json"),
    JSON.stringify({ staging: [], production: [], blocked: [] }, null, 2),
  );
}

const port = 14040 + Math.floor(Math.random() * 1000);
const bin = path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const body = await res.json();
  return { status: res.status, body };
}

const child = spawn(
  process.execPath,
  [bin, "serve", "--port", String(port), "--host", "127.0.0.1"],
  { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] },
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
  if (health.status !== 200 || !health.body.ok) {
    fail(`health ${health.status}`);
  } else {
    console.log("OK health");
  }

  const consoleRes = await fetch(`${base}/`);
  const consoleHtml = await consoleRes.text();
  if (
    consoleRes.status !== 200 ||
    !consoleHtml.includes("Control Plane") ||
    !consoleHtml.includes("/v1/registry")
  ) {
    fail(`console HTML ${consoleRes.status}`);
  } else {
    console.log("OK GET / thin CP Web");
  }

  const registry = await fetchJson(`${base}/v1/registry`);
  if (registry.status !== 200 || !Array.isArray(registry.body.staging)) {
    fail(`registry ${registry.status}`);
  } else {
    console.log("OK GET /v1/registry");
  }

  const staging = await fetchJson(`${base}/v1/registry/staging`);
  if (staging.status !== 200) fail(`staging ${staging.status}`);
  else console.log("OK GET /v1/registry/staging");

  const candidates = await fetchJson(`${base}/v1/candidates?lane=staging`);
  if (candidates.status !== 200 || !Array.isArray(candidates.body.candidates)) {
    fail(`candidates ${candidates.status}`);
  } else {
    console.log("OK GET /v1/candidates");
  }

  const promote = await fetchJson(`${base}/v1/promote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ digest: "deadbeef" }),
  });
  if (promote.status !== 400) {
    fail(`promote missing digest should 400, got ${promote.status}`);
  } else {
    console.log("OK POST /v1/promote rejects missing staging");
  }

  const block = await fetchJson(`${base}/v1/block`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ digest: "deadbeef", reason: "verify drill" }),
  });
  if (block.status !== 400) {
    fail(`block unknown digest should 400, got ${block.status}`);
  } else {
    console.log("OK POST /v1/block rejects unknown digest");
  }
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  child.kill("SIGTERM");
}

if (failed) process.exit(1);
console.log("verify-cp-stub-api: PASS");
