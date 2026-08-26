#!/usr/bin/env node
/**
 * Map B / #15 — distribution console thin slice verify.
 *
 * Usage:
 *   node scripts/verify-distribution-console.mjs [projectRoot]
 */
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : mkdtempSync(path.join(tmpdir(), "rn-dist-console-"));

let failed = false;
function step(name, ok, detail = "") {
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

if (!process.argv[2]) {
  mkdirSync(path.join(projectRoot, ".rn/delivery"), { recursive: true });
  writeFileSync(
    path.join(projectRoot, "package.json"),
    JSON.stringify({ name: "dist-console-demo" }),
  );
  const fakeApk = path.join(projectRoot, "fake-debug.apk");
  writeFileSync(fakeApk, "PK\x03\x04fake-apk");
  writeFileSync(
    path.join(projectRoot, ".rn/delivery/registry.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        staging: [
          {
            release_id: "rel-1",
            artifact_kind: "app-host-debug",
            platform: "android",
            profile: "debug-host",
            digest: "c".repeat(64),
            stage: "promote",
            path: fakeApk,
            configuration: "debug",
          },
        ],
        production: [],
        blocked: [],
      },
      null,
      2,
    ),
  );
}

const { listInstallableCandidates, loadRegistry } = await import(
  pathToFileURL(
    path.join(repoRoot, "packages/rn-delivery/dist/candidate-store.js"),
  ).href
);

const registry = loadRegistry(projectRoot);
const installable = listInstallableCandidates(registry, "staging");
step("listInstallableCandidates", installable.length > 0, `count=${installable.length}`);

const agent = spawnSync(
  process.execPath,
  [
    path.join(repoRoot, "scripts/distribution-console-agent.mjs"),
    projectRoot,
    "--dry-run",
    "--lane=staging",
  ],
  { cwd: repoRoot, encoding: "utf8" },
);
step("distribution-console-agent dry-run", agent.status === 0, agent.stderr?.trim());

const auditPath = path.join(projectRoot, ".rn/delivery/install-audit.jsonl");
step("install audit jsonl", existsSync(auditPath));
if (existsSync(auditPath)) {
  const last = readFileSync(auditPath, "utf8").trim().split("\n").pop();
  const row = JSON.parse(last);
  step("audit has digest + operator", Boolean(row.digest && row.operator));
}

const port = 15040 + Math.floor(Math.random() * 1000);
const bin = path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs");
const child = spawn(process.execPath, [bin, "serve", "--port", String(port)], {
  cwd: projectRoot,
  stdio: ["ignore", "pipe", "pipe"],
});
await sleep(700);
try {
  const res = await fetch(`http://127.0.0.1:${port}/v1/candidates?lane=staging`);
  const body = await res.json();
  step(
    "GET /v1/candidates",
    res.status === 200 && Array.isArray(body.candidates) && body.candidates.length > 0,
  );
} catch (err) {
  step("GET /v1/candidates", false, String(err));
} finally {
  child.kill("SIGTERM");
}

console.log("");
if (failed) {
  console.error("verify-distribution-console: FAIL");
  process.exit(1);
}
console.log("verify-distribution-console: PASS");
