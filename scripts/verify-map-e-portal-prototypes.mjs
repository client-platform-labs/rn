#!/usr/bin/env node
/**
 * Map E E-T10 — product portal pages wired to Distribution API.
 *
 * Usage:
 *   node scripts/verify-map-e-portal-prototypes.mjs [tiangong-host-path]
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const hostRoot =
  process.argv[2] ||
  process.env.TIANGONG_HOST ||
  path.join(process.env.HOME || "", "code/tiangong-host");
const rd = path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs");
const port = 18820 + Math.floor(Math.random() * 200);

function step(name, ok, detail = "") {
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exit(1);
}

if (!existsSync(hostRoot)) {
  console.error(`host repo missing: ${hostRoot}`);
  process.exit(1);
}

const proc = spawn(
  process.execPath,
  [rd, "cp-serve", "--port", String(port), "--host", "127.0.0.1"],
  { cwd: hostRoot, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] },
);

await new Promise((r) => setTimeout(r, 900));

try {
  const base = `http://127.0.0.1:${port}`;

  const hostHtml = await (await fetch(`${base}/portal/host`)).text();
  step(
    "GET /portal/host",
    hostHtml.includes("portal-live.js") && hostHtml.includes("产品门户"),
  );

  const jsHtml = await (await fetch(`${base}/portal/js`)).text();
  step(
    "GET /portal/js",
    jsHtml.includes("portal-live.js") && jsHtml.includes("离线包发布"),
  );

  const liveJs = await (await fetch(`${base}/portal/portal-live.js`)).text();
  step("GET /portal/portal-live.js", liveJs.includes("hydrateHostWorld"));

  const relation = await (
    await fetch(`${base}/portal/shell-bundle-relation.html`)
  ).text();
  step(
    "GET /portal/shell-bundle-relation.html",
    relation.includes("portal-live.js") && relation.includes("分发 API"),
  );

  const hosts = await (await fetch(`${base}/v1/candidates?lane=all`)).json();
  step(
    "host candidates API",
    Array.isArray(hosts.candidates) && hosts.candidates.length > 0,
    `count=${hosts.candidates?.length ?? 0}`,
  );

  const js = await (
    await fetch(`${base}/v1/js-updates?lane=all&module=desk`)
  ).json();
  step(
    "js-updates API",
    Array.isArray(js.candidates) && js.candidates.length > 0,
    `desk count=${js.candidates?.length ?? 0}`,
  );

  const digest = js.candidates?.[0]?.digest;
  if (digest) {
    const art = await fetch(`${base}/v1/artifacts/${digest}`);
    step(
      "js artifact download",
      art.status === 200,
      `status=${art.status}`,
    );
  }

  console.log("\nverify-map-e-portal-prototypes: PASS");
  console.log(`Open: ${base}/portal/host · ${base}/portal/js`);
} finally {
  proc.kill("SIGTERM");
}
