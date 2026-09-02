#!/usr/bin/env node
/**
 * Map E #103 — GET/PUT /v1/dependency-manifest + gateBundleLoad composition.
 *
 * Usage:
 *   node scripts/verify-cp-dependency-manifest-api.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = mkdtempSync(path.join(tmpdir(), "rn-e-dep-api-"));
mkdirSync(path.join(projectRoot, ".rn/delivery"), { recursive: true });
writeFileSync(
  path.join(projectRoot, "package.json"),
  JSON.stringify({ name: "e-dep-api" }),
);
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

const rd = path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs");
const port = 18765 + Math.floor(Math.random() * 200);

const proc = spawn(
  process.execPath,
  [rd, "serve", "--port", String(port), "--host", "127.0.0.1"],
  {
    cwd: projectRoot,
    env: { ...process.env, RN_CP_TOKEN: "test-token", RN_CP_ROLE: "admin" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

await new Promise((r) => setTimeout(r, 900));

async function req(method, pathname, body) {
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

try {
  const get0 = await req("GET", "/v1/dependency-manifest");
  if (get0.status !== 200 || !Array.isArray(get0.json.dependencies)) {
    console.error("GET empty fail", get0);
    process.exit(1);
  }
  console.log("OK GET empty manifest");

  const put = await req("PUT", "/v1/dependency-manifest", {
    dependencies: [
      {
        from_update_id: "js-chk-p184",
        from_module: "checkout",
        strength: "hard",
        kind: "contract",
        to_update_id: "js-base-p12",
      },
    ],
    version_labels: { "js-base-p12": "1.2.0" },
    host_capability_set: ["PaymentTurbo"],
  });
  if (put.status !== 200 || !put.json.ok) {
    console.error("PUT fail", put);
    process.exit(1);
  }
  console.log("OK PUT manifest");

  const get1 = await req("GET", "/v1/dependency-manifest");
  if (get1.json.dependencies?.length !== 1) {
    console.error("GET after PUT fail", get1);
    process.exit(1);
  }
  console.log("OK GET after PUT");

  const { gateBundleLoad, defaultGreenfieldFingerprint } = await import(
    pathToFileURL(path.join(repoRoot, "packages/rn-core/dist/index.js")).href
  );
  const fp = defaultGreenfieldFingerprint("0.87.0");
  const host = {
    runtime_fingerprint: fp,
    capability_set: ["PaymentTurbo", "ShellBus.v2", "MapTurbo"],
    artifact_line: "pure-rn-greenfield",
    hbcBytecodeVersion: fp.hbcBytecodeVersion,
    channel_js_allowed: true,
  };
  const checkout = {
    business_module: "checkout",
    update_id: "js-chk-p184",
    runtime_fingerprint: fp,
    hbcBytecodeVersion: fp.hbcBytecodeVersion,
    required_capabilities: ["PaymentTurbo", "ShellBus.v2"],
    target_artifact_lines: ["pure-rn-greenfield"],
    release_gate: "js-standard",
  };
  const home = {
    business_module: "home",
    update_id: "js-home-p29",
    runtime_fingerprint: fp,
    hbcBytecodeVersion: fp.hbcBytecodeVersion,
    required_capabilities: ["ShellBus.v2"],
    target_artifact_lines: ["pure-rn-greenfield"],
    release_gate: "js-standard",
  };
  const bad = gateBundleLoad(
    {
      candidate: checkout,
      signature: "x",
      expectedDigest: "x",
      composition: { checkout, home },
      dependencies: [
        {
          from_update_id: "js-chk-p184",
          from_module: "checkout",
          strength: "peer",
          kind: "coexistence",
          to_module: "home",
          to_range: ">=3.0.0",
        },
      ],
      version_labels: { "js-home-p29": "2.9.4", "js-chk-p184": "1.8.4" },
    },
    host,
  );
  if (bad.ok) {
    console.error("expected composition fail", bad);
    process.exit(1);
  }
  console.log("OK gateBundleLoad composition blocks peer");

  const consoleRes = await fetch(`http://127.0.0.1:${port}/`);
  const html = await consoleRes.text();
  if (
    consoleRes.status !== 200 ||
    !html.includes("依赖清单") ||
    !html.includes("/v1/dependency-manifest") ||
    !html.includes("btn-dep-save")
  ) {
    console.error(
      "console missing deps section",
      consoleRes.status,
      html.slice(0, 200),
    );
    process.exit(1);
  }
  console.log("OK thin CP console projects dependency-manifest");

  console.log("verify-cp-dependency-manifest-api: PASS");
} finally {
  proc.kill("SIGTERM");
}
