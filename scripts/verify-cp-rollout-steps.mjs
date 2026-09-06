#!/usr/bin/env node
/**
 * Map B B11 — thin P10 rollout_steps soak / js-gated Full / RBAC.
 *
 * Usage:
 *   node scripts/verify-cp-rollout-steps.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = mkdtempSync(path.join(tmpdir(), "rn-cp-rollout-"));
const port = 18040 + Math.floor(Math.random() * 1000);
const token = "map-b-rollout-token";
const bin = path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs");

mkdirSync(path.join(projectRoot, ".rn/delivery"), { recursive: true });
writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "cp-rollout-demo" }));
writeFileSync(
  path.join(projectRoot, ".rn/delivery/registry.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      staging: [],
      production: [
        {
          digest: "roll111",
          release_id: "r1",
          update_id: "desk-r1",
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

function spawnServe(role) {
  return spawn(process.execPath, [bin, "serve", "--port", String(port), "--host", "127.0.0.1"], {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, RN_CP_TOKEN: token, RN_CP_ROLE: role },
  });
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

try {
  const admin = spawnServe("admin");
  await sleep(700);

  const html = await (await fetch(`${base}/`)).text();
  if (!html.includes("灰度发布") || !html.includes("开始灰度") || !html.includes("Rollout")) {
    fail("console missing 灰度发布 / 开始灰度 / Rollout");
  } else {
    console.log("OK console Rollouts controls");
  }

  const start = await fetchJson(`${base}/v1/rollout/start`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      business_module: "desk",
      digest: "roll111",
      update_id: "desk-r1",
      gate: "js-standard",
      min_soak_ms: 60_000,
    }),
  });
  if (start.status !== 200 || start.body.rollout?.phase !== "canary") {
    fail(`start ${start.status} ${JSON.stringify(start.body)}`);
  } else {
    console.log("OK start canary 1%");
  }

  const early = await fetchJson(`${base}/v1/rollout/advance`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ digest: "roll111" }),
  });
  if (early.status !== 400 || early.body.code !== "soak_not_met") {
    fail(`early advance should soak_not_met, got ${early.status} ${early.body.code}`);
  } else {
    console.log("OK advance before soak → soak_not_met");
  }

  const adv = await fetchJson(`${base}/v1/rollout/advance`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ digest: "roll111", force_soak: true }),
  });
  if (adv.status !== 200 || adv.body.rollout?.steps?.[adv.body.rollout.step_index]?.percent !== 10) {
    fail(`advance after soak ${adv.status} ${JSON.stringify(adv.body.rollout)}`);
  } else {
    console.log("OK advance → rolling 10%");
  }

  // sqlite path
  admin.kill("SIGTERM");
  await sleep(300);

  const sqliteRoot = mkdtempSync(path.join(tmpdir(), "rn-cp-rollout-sql-"));
  mkdirSync(path.join(sqliteRoot, ".rn/delivery"), { recursive: true });
  writeFileSync(path.join(sqliteRoot, "package.json"), JSON.stringify({ name: "sql" }));
  writeFileSync(
    path.join(sqliteRoot, ".rn/delivery/registry.json"),
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
  const sqlPort = port + 1;
  const sqlServe = spawn(
    process.execPath,
    [bin, "serve", "--port", String(sqlPort), "--host", "127.0.0.1"],
    {
      cwd: sqliteRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        RN_CP_TOKEN: token,
        RN_CP_ROLE: "admin",
        RN_CP_REGISTRY: "sqlite",
      },
    },
  );
  await sleep(700);
  const sqlBase = `http://127.0.0.1:${sqlPort}`;
  const sqlStart = await fetchJson(`${sqlBase}/v1/rollout/start`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      business_module: "desk",
      digest: "sql1",
      min_soak_ms: 1,
    }),
  });
  if (sqlStart.status !== 200) fail(`sqlite start ${sqlStart.status}`);
  else console.log("OK sqlite registry rollout start");
  sqlServe.kill("SIGTERM");
  await sleep(300);

  // js-gated Full
  const gatedRoot = mkdtempSync(path.join(tmpdir(), "rn-cp-gated-"));
  mkdirSync(path.join(gatedRoot, ".rn/delivery"), { recursive: true });
  writeFileSync(path.join(gatedRoot, "package.json"), JSON.stringify({ name: "g" }));
  writeFileSync(
    path.join(gatedRoot, ".rn/delivery/registry.json"),
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
  const gPort = port + 2;
  const gServe = spawn(
    process.execPath,
    [bin, "serve", "--port", String(gPort), "--host", "127.0.0.1"],
    {
      cwd: gatedRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, RN_CP_TOKEN: token, RN_CP_ROLE: "admin" },
    },
  );
  await sleep(700);
  const gBase = `http://127.0.0.1:${gPort}`;
  await fetchJson(`${gBase}/v1/rollout/start`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      business_module: "desk",
      digest: "g1",
      gate: "js-gated",
      min_soak_ms: 0,
    }),
  });
  const noHuman = await fetchJson(`${gBase}/v1/rollout/advance`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ digest: "g1", force_soak: true }),
  });
  // first advance → rolling; second → full needs human
  const toFull = await fetchJson(`${gBase}/v1/rollout/advance`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ digest: "g1", force_soak: true }),
  });
  if (toFull.status !== 400 || toFull.body.code !== "human_required") {
    fail(`js-gated Full without human: ${toFull.status} ${toFull.body.code} (mid=${noHuman.body.rollout?.phase})`);
  } else {
    console.log("OK js-gated Full without human → human_required");
  }
  const withHuman = await fetchJson(`${gBase}/v1/rollout/advance`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      digest: "g1",
      force_soak: true,
      human_full_approved: true,
    }),
  });
  if (withHuman.status !== 200 || withHuman.body.rollout?.phase !== "full") {
    fail(`js-gated with human ${withHuman.status}`);
  } else {
    console.log("OK js-gated Full with human_full_approved");
  }
  gServe.kill("SIGTERM");
  await sleep(300);

  // viewer 403
  const vRoot = mkdtempSync(path.join(tmpdir(), "rn-cp-roll-v-"));
  mkdirSync(path.join(vRoot, ".rn/delivery"), { recursive: true });
  writeFileSync(path.join(vRoot, "package.json"), JSON.stringify({ name: "v" }));
  writeFileSync(
    path.join(vRoot, ".rn/delivery/registry.json"),
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
  const vPort = port + 3;
  const vServe = spawn(
    process.execPath,
    [bin, "serve", "--port", String(vPort), "--host", "127.0.0.1"],
    {
      cwd: vRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, RN_CP_TOKEN: token, RN_CP_ROLE: "viewer" },
    },
  );
  await sleep(700);
  const vDeny = await fetchJson(`http://127.0.0.1:${vPort}/v1/rollout/start`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ business_module: "desk", digest: "x" }),
  });
  if (vDeny.status !== 403) fail(`viewer should 403, got ${vDeny.status}`);
  else console.log("OK viewer POST rollout → 403");
  vServe.kill("SIGTERM");
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

if (failed) process.exit(1);
console.log("PASS verify-cp-rollout-steps");
process.exit(0);
