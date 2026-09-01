#!/usr/bin/env node
/**
 * Map C C2 — CP as standalone service process + slo-breach → pause.
 *
 * Usage:
 *   node scripts/verify-cp-service.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = mkdtempSync(path.join(tmpdir(), "rn-cp-svc-"));
const port = 19040 + Math.floor(Math.random() * 1000);
const token = "map-c-cp-token";
const bin = path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs");

mkdirSync(path.join(projectRoot, ".rn/delivery"), { recursive: true });
writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "cp-svc" }));
writeFileSync(
  path.join(projectRoot, ".rn/delivery/registry.json"),
  JSON.stringify({
    schemaVersion: 1,
    staging: [],
    production: [],
    blocked: [],
    kills: [],
    pauses: [],
    rollouts: [],
  }),
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

let failed = false;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = true;
}

const base = `http://127.0.0.1:${port}`;
const auth = {
  "content-type": "application/json",
  authorization: `Bearer ${token}`,
};

const child = spawn(
  process.execPath,
  [bin, "cp-serve", "--port", String(port), "--host", "127.0.0.1"],
  {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      RN_CP_TOKEN: token,
      RN_CP_ROLE: "admin",
      RN_CP_PROJECT: projectRoot,
    },
  },
);

try {
  await sleep(800);

  const health = await fetchJson(`${base}/health`);
  if (health.status !== 200 || health.body.service !== "control-plane") {
    fail(`health ${health.status} ${JSON.stringify(health.body)}`);
  } else {
    console.log("OK /health service=control-plane");
  }

  const svc = await fetchJson(`${base}/v1/service`);
  if (
    svc.status !== 200 ||
    svc.body.name !== "control-plane" ||
    svc.body.mode !== "cp-serve" ||
    svc.body.replaceable_backend !== true
  ) {
    fail(`/v1/service ${svc.status} ${JSON.stringify(svc.body)}`);
  } else {
    console.log(`OK /v1/service mode=cp-serve storage=${svc.body.storage}`);
  }

  const start = await fetchJson(`${base}/v1/rollout/start`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      business_module: "desk",
      digest: "b".repeat(64),
      min_soak_ms: 60_000,
    }),
  });
  if (start.status !== 200 || start.body.rollout?.phase !== "canary") {
    fail(`rollout start ${start.status}`);
  } else {
    console.log("OK rollout start canary");
  }

  const breach = await fetchJson(`${base}/v1/rollout/slo-breach`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      digest: "b".repeat(64),
      reason: "error_budget_breach",
    }),
  });
  if (
    breach.status !== 200 ||
    breach.body.rollout?.phase !== "paused" ||
    breach.body.action !== "rollout_slo_breach_pause"
  ) {
    fail(`slo-breach ${breach.status} ${JSON.stringify(breach.body)}`);
  } else {
    console.log("OK slo-breach → paused");
  }
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  child.kill("SIGTERM");
  await sleep(400);
}

if (failed) process.exit(1);
console.log("PASS verify-cp-service");
process.exit(0);
