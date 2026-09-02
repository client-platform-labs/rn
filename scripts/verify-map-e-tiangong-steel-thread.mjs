#!/usr/bin/env node
/**
 * Map E E-T9 — tiangong-host + desk end-to-end steel thread.
 *
 * Usage:
 *   node scripts/verify-map-e-tiangong-steel-thread.mjs
 *
 * Env:
 *   TIANGONG_HOST  default /Users/xuwei/code/tiangong-host
 *   TIANGONG_DESK  default /Users/xuwei/code/desk
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const HOST =
  process.env.TIANGONG_HOST ?? "/Users/xuwei/code/tiangong-host";
const DESK = process.env.TIANGONG_DESK ?? "/Users/xuwei/code/desk";
const NODE24 =
  process.env.TIANGONG_NODE ??
  `${process.env.HOME}/.nvm/versions/node/v24.19.0/bin/node`;
const RD = path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs");

let failed = false;
function step(name, ok, detail = "") {
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

function runNode(args, cwd, env = {}) {
  const r = spawnSync(NODE24, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

if (!existsSync(HOST)) {
  console.error(`TIANGONG_HOST missing: ${HOST}`);
  process.exit(1);
}

step("host repo exists", existsSync(HOST), HOST);
step("desk repo exists", existsSync(DESK), DESK);
step("node 24", existsSync(NODE24), NODE24);

const apkRelease = path.join(
  HOST,
  "android/app/build/outputs/apk/release/app-release.apk",
);
step("release APK on disk", existsSync(apkRelease), apkRelease);

// Fresh registry slice for steel thread (preserve file backup in quality-signals only)
const deliveryDir = path.join(HOST, ".rn/delivery");
mkdirSync(deliveryDir, { recursive: true });
const emptyRegistry = {
  schemaVersion: 1,
  staging: [],
  production: [],
  blocked: [],
  kills: [],
  pauses: [],
  rollouts: [],
};
writeFileSync(
  path.join(deliveryDir, "registry.json"),
  `${JSON.stringify(emptyRegistry, null, 2)}\n`,
);

console.log("\n--- pack desk (host-embed) ---");
const pack = runNode(
  ["scripts/pack-business.mjs", "--plugin", "host-embed", "--module", "desk"],
  HOST,
);
step("pack-business desk", pack.ok, pack.ok ? "" : pack.stderr.slice(0, 200));

console.log("\n--- js-update: ingest → sign → release ---");
let r = runNode([RD, "ingest-pack", "--module", "desk"], HOST);
step("ingest-pack desk", r.ok, r.ok ? "" : r.stderr.slice(0, 200));

r = runNode([RD, "sign"], HOST);
step("sign js-update", r.ok, r.ok ? "" : r.stderr.slice(0, 200));

r = runNode([RD, "release"], HOST);
step("release js-update → staging", r.ok, r.ok ? "" : r.stderr.slice(0, 200));

console.log("\n--- app-host: ingest APK → sign → release ---");
r = runNode([RD, "ingest-host", "--apk", apkRelease, "--profile", "release"], HOST);
step("ingest-host APK", r.ok, r.ok ? "" : r.stderr.slice(0, 200));

r = runNode([RD, "sign"], HOST);
step("sign app-host", r.ok, r.ok ? "" : r.stderr.slice(0, 200));

r = runNode([RD, "release", "--platform", "android"], HOST);
step("release app-host → staging", r.ok, r.ok ? "" : r.stderr.slice(0, 200));

const registry = JSON.parse(
  readFileSync(path.join(deliveryDir, "registry.json"), "utf8"),
);
const jsStaging = (registry.staging ?? []).filter(
  (c) => c.artifact_kind === "js-update" && c.business_module === "desk",
);
const hostStaging = (registry.staging ?? []).filter(
  (c) =>
    c.platform === "android" &&
    (c.artifact_kind === "app-host" || c.artifact_kind === "app-host-debug"),
);
step(
  "registry has desk js-update",
  jsStaging.length >= 1,
  `count=${jsStaging.length}`,
);
step(
  "registry has app-host",
  hostStaging.length >= 1,
  `count=${hostStaging.length}`,
);

console.log("\n--- distribution API smoke ---");
const port = 14041 + Math.floor(Math.random() * 200);
const proc = spawn(NODE24, [RD, "cp-serve", "--port", String(port), "--host", "127.0.0.1"], {
  cwd: HOST,
  env: { ...process.env },
  stdio: ["ignore", "pipe", "pipe"],
});
await sleep(900);

try {
  const base = `http://127.0.0.1:${port}`;
  const regRes = await fetch(`${base}/v1/registry`);
  const reg = await regRes.json();
  step("GET /v1/registry", regRes.ok && reg.staging?.length >= 2, `staging=${reg.staging?.length}`);

  const jsRes = await fetch(`${base}/v1/js-updates?module=desk`);
  const js = await jsRes.json();
  step(
    "GET /v1/js-updates?module=desk",
    jsRes.ok && js.candidates?.length >= 1,
    `count=${js.candidates?.length}`,
  );

  const hostRes = await fetch(`${base}/v1/candidates?lane=staging`);
  const hosts = await hostRes.json();
  const dl = hosts.candidates?.[0]?.download_url;
  step(
    "GET /v1/candidates staging",
    hostRes.ok && hosts.candidates?.length >= 1,
    `count=${hosts.candidates?.length}`,
  );

  if (dl) {
    const art = await fetch(`${base}${dl}`);
    step(
      "GET artifact download",
      art.ok && (await art.arrayBuffer()).byteLength > 1000,
      dl,
    );
  } else {
    step("GET artifact download", false, "no download_url");
  }

  const html = await (await fetch(`${base}/`)).text();
  step(
    "运维验证页",
    html.includes("分发服务") && html.includes("host-builds"),
    "zh UI",
  );
} finally {
  proc.kill("SIGTERM");
}

if (failed) {
  console.error("\nverify-map-e-tiangong-steel-thread: FAIL");
  process.exit(1);
}
console.log("\nverify-map-e-tiangong-steel-thread: PASS");
console.log(`\nOpen: cd ${HOST} && RN_CP_TOKEN=dev rn-delivery cp-serve --port 4040`);
console.log(`Then: http://127.0.0.1:4040/ — should show desk js-update + host APK`);
