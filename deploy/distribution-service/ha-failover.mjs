#!/usr/bin/env node
/**
 * Same-region active/passive handoff.
 *
 * The standby never opens the active SQLite file. It receives a VACUUM INTO
 * snapshot plus digest files it does not already have. It binds only after
 * GET /ready fails three times and one more recheck, and only if the newest
 * snapshot is at most 2 minutes old.
 *
 *   node deploy/distribution-service/ha-failover.mjs snapshot \
 *     --active <project> --snapshots <dir>
 *   node deploy/distribution-service/ha-failover.mjs artifacts \
 *     --active <project> --standby <project>
 *   node deploy/distribution-service/ha-failover.mjs failover \
 *     --ready-url <http://active/ready> --snapshots <dir> --standby <project>
 *
 * `--start` on failover execs `ship cp-serve` in the standby project after a
 * successful bind. Without it, the script only copies the snapshot and writes
 * `.rn/delivery/ha-bound.json`.
 */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const MAX_SNAPSHOT_AGE_MS = 2 * 60 * 1000;
export const READY_FAILURES_REQUIRED = 3;
const KEEP_SNAPSHOTS = 5;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

export function vacuumRegistry(dbFile, outFile) {
  mkdirSync(path.dirname(outFile), { recursive: true });
  const db = new DatabaseSync(dbFile);
  try {
    db.exec(`VACUUM INTO '${outFile.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
}

export function takeSnapshot({ activeRoot, snapshotRoot, now = new Date() }) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const dir = path.join(snapshotRoot, stamp);
  mkdirSync(dir, { recursive: true });
  const src = path.join(activeRoot, ".rn/delivery/registry.sqlite");
  if (!existsSync(src)) {
    throw new Error(`ha-failover: registry missing: ${src}`);
  }
  vacuumRegistry(src, path.join(dir, "registry.sqlite"));
  writeFileSync(path.join(dir, "taken_at"), now.toISOString());
  pruneSnapshots(snapshotRoot);
  return { dir, takenAt: now.toISOString() };
}

function pruneSnapshots(snapshotRoot) {
  if (!existsSync(snapshotRoot)) return;
  const dirs = readdirSync(snapshotRoot)
    .map((name) => path.join(snapshotRoot, name))
    .filter((dir) => existsSync(path.join(dir, "taken_at")))
    .sort();
  for (const dir of dirs.slice(0, Math.max(0, dirs.length - KEEP_SNAPSHOTS))) {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function copyNewArtifacts(activeRoot, standbyRoot) {
  const from = path.join(activeRoot, ".rn/delivery/artifacts");
  const to = path.join(standbyRoot, ".rn/delivery/artifacts");
  mkdirSync(to, { recursive: true });
  let copied = 0;
  if (!existsSync(from)) return { copied };
  for (const name of readdirSync(from)) {
    if (name.startsWith(".")) continue;
    const src = path.join(from, name);
    const dest = path.join(to, name);
    if (existsSync(dest)) continue;
    copyFileSync(src, dest);
    copied += 1;
  }
  return { copied };
}

export function latestFreshSnapshot(snapshotRoot, now = new Date(), maxAgeMs = MAX_SNAPSHOT_AGE_MS) {
  if (!existsSync(snapshotRoot)) return null;
  const found = [];
  for (const name of readdirSync(snapshotRoot)) {
    const dir = path.join(snapshotRoot, name);
    const stampFile = path.join(dir, "taken_at");
    const dbFile = path.join(dir, "registry.sqlite");
    if (!existsSync(stampFile) || !existsSync(dbFile)) continue;
    const takenAt = readFileSync(stampFile, "utf8").trim();
    const age = now.getTime() - Date.parse(takenAt);
    if (Number.isNaN(age)) continue;
    found.push({ dir, takenAt, age });
  }
  found.sort((a, b) => Date.parse(a.takenAt) - Date.parse(b.takenAt));
  const newest = found.at(-1);
  if (!newest || newest.age > maxAgeMs || newest.age < 0) return null;
  return newest;
}

export async function attemptFailover({
  probe,
  snapshotRoot,
  standbyRoot,
  now = new Date(),
  failuresRequired = READY_FAILURES_REQUIRED,
  maxAgeMs = MAX_SNAPSHOT_AGE_MS,
}) {
  for (let i = 0; i < failuresRequired; i += 1) {
    if (await probe()) return { bound: false, reason: "active-ready" };
  }
  if (await probe()) return { bound: false, reason: "recheck-ok" };
  const snap = latestFreshSnapshot(snapshotRoot, now, maxAgeMs);
  if (!snap) return { bound: false, reason: "snapshot-stale" };
  const delivery = path.join(standbyRoot, ".rn/delivery");
  mkdirSync(delivery, { recursive: true });
  copyFileSync(path.join(snap.dir, "registry.sqlite"), path.join(delivery, "registry.sqlite"));
  const record = {
    role: "active",
    bound_at: now.toISOString(),
    snapshot: snap.dir,
    taken_at: snap.takenAt,
    start: "ship cp-serve",
  };
  writeFileSync(path.join(delivery, "ha-bound.json"), `${JSON.stringify(record)}\n`);
  return { bound: true, reason: "failover", snapshot: snap.dir, record };
}

async function probeReady(url) {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "snapshot") {
    const activeRoot = path.resolve(arg("active") ?? "");
    const snapshotRoot = path.resolve(arg("snapshots") ?? "");
    const result = takeSnapshot({ activeRoot, snapshotRoot });
    console.log(JSON.stringify(result));
    return;
  }
  if (cmd === "artifacts") {
    const activeRoot = path.resolve(arg("active") ?? "");
    const standbyRoot = path.resolve(arg("standby") ?? "");
    console.log(JSON.stringify(copyNewArtifacts(activeRoot, standbyRoot)));
    return;
  }
  if (cmd === "failover") {
    const readyUrl = arg("ready-url");
    const snapshotRoot = path.resolve(arg("snapshots") ?? "");
    const standbyRoot = path.resolve(arg("standby") ?? "");
    if (!readyUrl) {
      console.error("ha-failover: --ready-url is required");
      process.exit(1);
    }
    const result = await attemptFailover({
      probe: () => probeReady(readyUrl),
      snapshotRoot,
      standbyRoot,
    });
    console.log(JSON.stringify(result));
    if (!result.bound) process.exit(2);
    if (process.argv.includes("--start")) {
      const child = spawn(
        process.execPath,
        [path.resolve("packages/ship/bin/ship.mjs"), "cp-serve"],
        { cwd: standbyRoot, stdio: "inherit" },
      );
      child.on("exit", (code) => process.exit(code ?? 1));
      return;
    }
    return;
  }
  console.error("ha-failover: snapshot | artifacts | failover");
  process.exit(2);
}

const isDirect = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isDirect) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
