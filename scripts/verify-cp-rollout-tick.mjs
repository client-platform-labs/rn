#!/usr/bin/env node
/**
 * Map C C5 — P10 tick: soak∧SLO → advance; SLO breach → pause.
 *
 * Usage:
 *   node scripts/verify-cp-rollout-tick.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = mkdtempSync(path.join(tmpdir(), "rn-c5-tick-"));
const port = 18140 + Math.floor(Math.random() * 1000);
const token = "map-c-tick-token";
const bin = path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs");
const digest = "tickdigest001";

mkdirSync(path.join(projectRoot, ".rn/delivery"), { recursive: true });
writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "c5-tick" }));
writeFileSync(
  path.join(projectRoot, ".rn/delivery/registry.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      staging: [],
      production: [
        {
          digest,
          release_id: "r-tick",
          update_id: "desk-tick",
          business_module: "desk",
          platform: "android",
          artifact_kind: "js-update",
          stage: "promote",
        },
      ],
      blocked: [],
      kills: [],
      pauses: [],
      rollouts: [],
    },
    null,
    2,
  ),
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function step(name, ok, detail) {
  if (!ok) {
    console.error(`[FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
    process.exit(1);
  }
  console.log(`[OK] ${name}`);
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
    env: { ...process.env, RN_CP_TOKEN: token, RN_CP_ROLE: "admin" },
  },
);

try {
  await sleep(800);

  const start = await fetchJson(`${base}/v1/rollout/start`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      business_module: "desk",
      digest,
      min_soak_ms: 60_000,
      sli_thresholds: { error_rate: 0.01 },
    }),
  });
  step("start rollout", start.status === 200, JSON.stringify(start.body));

  const waitSli = await fetchJson(`${base}/v1/rollout/tick`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ digest, now: "2026-09-01T00:02:00.000Z" }),
  });
  step(
    "tick waits for SLI",
    waitSli.body.tick === "waiting_sli",
    waitSli.body.detail,
  );

  const breach = await fetchJson(`${base}/v1/rollout/tick`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      digest,
      now: "2026-09-01T00:02:00.000Z",
      sli: { error_rate: 0.09 },
    }),
  });
  step(
    "tick pauses on SLO breach",
    breach.body.tick === "paused_slo" && breach.body.rollout?.phase === "paused",
    breach.body.detail,
  );

  const resume = await fetchJson(`${base}/v1/rollout/resume`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ digest }),
  });
  step("resume after breach", resume.status === 200, JSON.stringify(resume.body));

  // Re-enter with known entered_at via start again after pause cleared by restarting steps:
  // resume resets soak clock; advance with injected now past soak + good SLI.
  const entered = resume.body.rollout?.step_entered_at;
  const t0 = entered ? Date.parse(entered) : Date.now();
  const later = new Date(t0 + 120_000).toISOString();

  const waitSoak = await fetchJson(`${base}/v1/rollout/tick`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      digest,
      now: new Date(t0 + 1000).toISOString(),
      sli: { error_rate: 0.001 },
    }),
  });
  step(
    "tick waits soak",
    waitSoak.body.tick === "waiting_soak",
    waitSoak.body.detail,
  );

  const adv = await fetchJson(`${base}/v1/rollout/tick`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      digest,
      now: later,
      sli: { error_rate: 0.001 },
    }),
  });
  step(
    "tick auto-advances",
    adv.body.tick === "advanced",
    `${adv.body.tick} ${adv.body.detail}`,
  );

  console.log("PASS verify-cp-rollout-tick");
} finally {
  child.kill("SIGTERM");
}
