#!/usr/bin/env node
/**
 * Map B / #15 — thin distribution console agent (script PoC, not rn CLI).
 *
 * Lists installable app-host candidates from registry, adb install, audit log,
 * optional quality_signal record (A6 hook).
 *
 * Usage:
 *   node scripts/distribution-console-agent.mjs <projectRoot> [options]
 *
 * Options:
 *   --lane staging|production|all   (default staging)
 *   --digest <sha256>               pick candidate (default: newest in lane)
 *   --serial <adb-serial>
 *   --record-signal                 append rn-delivery signal record on success
 *   --dry-run                       list + audit only, no adb
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const projectRoot = path.resolve(args.find((a) => !a.startsWith("--")) ?? ".");
const laneArg = args.find((a) => a.startsWith("--lane="))?.split("=")[1] ?? "staging";
const digest = args.find((a) => a.startsWith("--digest="))?.split("=")[1];
const serial = args.find((a) => a.startsWith("--serial="))?.split("=")[1];
const dryRun = args.includes("--dry-run");
const recordSignal = args.includes("--record-signal");

const lane =
  laneArg === "staging" || laneArg === "production" || laneArg === "all"
    ? laneArg
    : "staging";

const { listInstallableCandidates, loadRegistry } = await import(
  pathToFileURL(
    path.join(repoRoot, "packages/rn-delivery/dist/candidate-store.js"),
  ).href
);

function audit(entry) {
  const dir = path.join(projectRoot, ".rn/delivery");
  mkdirSync(dir, { recursive: true });
  const line = `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`;
  appendFileSync(path.join(dir, "install-audit.jsonl"), line);
  return line.trim();
}

function adb(argv, opts = {}) {
  const base = serial ? ["-s", serial, ...argv] : argv;
  return spawnSync("adb", base, {
    encoding: "utf8",
    timeout: opts.timeout ?? 180_000,
    ...opts,
  });
}

const registry = loadRegistry(projectRoot);
const candidates = listInstallableCandidates(registry, lane);
if (candidates.length === 0) {
  console.error(
    `distribution-console-agent: no installable candidates in lane=${lane}`,
  );
  process.exit(1);
}

const picked =
  (digest ? candidates.find((c) => c.digest === digest) : null) ??
  candidates[candidates.length - 1];

if (!picked?.path || !existsSync(picked.path)) {
  console.error(`distribution-console-agent: APK missing: ${picked?.path}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      action: dryRun ? "dry-run" : "install",
      lane,
      digest: picked.digest,
      artifact_kind: picked.artifact_kind,
      path: picked.path,
    },
    null,
    2,
  ),
);

if (dryRun) {
  audit({
    action: "dry-run",
    operator: process.env.USER ?? "agent",
    digest: picked.digest,
    artifact_kind: picked.artifact_kind,
    apk: picked.path,
    serial: serial ?? null,
  });
  process.exit(0);
}

const devices = adb(["devices"]);
const authorized =
  devices.stdout
    ?.split("\n")
    .slice(1)
    .filter((l) => l.includes("\tdevice")).length ?? 0;
if (authorized === 0) {
  console.error("distribution-console-agent: no authorized adb device");
  process.exit(1);
}

const install = adb(["install", "-r", picked.path]);
const ok = install.status === 0;
audit({
  action: "install",
  ok,
  operator: process.env.USER ?? "agent",
  digest: picked.digest,
  release_id: picked.release_id,
  artifact_kind: picked.artifact_kind,
  apk: picked.path,
  serial: serial ?? "default",
  adb_exit: install.status,
  adb_out: `${install.stdout ?? ""}${install.stderr ?? ""}`.trim().slice(0, 500),
});

if (!ok) {
  console.error(install.stderr || install.stdout);
  process.exit(1);
}

console.error("distribution-console-agent: install Success");

if (recordSignal) {
  const bin = path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs");
  const sig = spawnSync(
    process.execPath,
    [
      bin,
      "signal",
      "record",
      "--module",
      "app-host",
      "--update-id",
      picked.digest.slice(0, 12),
      "--kind",
      "custom",
      "--detail",
      "distribution-console-agent install ok",
    ],
    { cwd: projectRoot, encoding: "utf8" },
  );
  if (sig.status !== 0) {
    console.error(sig.stderr || sig.stdout);
    process.exit(1);
  }
}

console.log("distribution-console-agent: PASS");
