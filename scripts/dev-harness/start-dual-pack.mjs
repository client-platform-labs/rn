#!/usr/bin/env node
/**
 * Dual-pack Dev Harness — map #149 / #155 / #158.
 *
 * Spawns two Metro processes (desk on 8081, fixture_second on 8082) for
 * the Bind smoke test. Writes PID + port table to `.rn/dev-harness.json`
 * and cleans them up on SIGINT/SIGTERM.
 *
 * No tmux dependency: background processes + signal forwarding.
 *
 * Usage:
 *   node scripts/dev-harness/start-dual-pack.mjs
 *   DESK_ROOT=/path/to/desk FIXTURE_SECOND_ROOT=/path/to/fixture_second \
 *     node scripts/dev-harness/start-dual-pack.mjs
 *
 * Exit codes:
 *   0 = clean shutdown (SIGINT/SIGTERM)
 *   1 = spawn failure
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rnRoot = path.resolve(__dirname, "../..");

const DESK_ROOT =
  process.env.DESK_ROOT ?? "/Users/xuwei/code/desk";
const FIXTURE_SECOND_ROOT =
  process.env.FIXTURE_SECOND_ROOT ?? "/Users/xuwei/code/fixture_second";
const HARNESS_DIR = path.join(rnRoot, ".rn");
const HARNESS_FILE = path.join(HARNESS_DIR, "dev-harness.json");

const TARGETS = [
  { id: "desk", root: DESK_ROOT, port: 8081 },
  { id: "fixture_second", root: FIXTURE_SECOND_ROOT, port: 8082 },
];

const procs = [];

function log(id, msg) {
  console.log(`[harness] ${id}: ${msg}`);
}

function shutdown(code = 0) {
  for (const p of procs) {
    if (p.proc && !p.proc.killed) {
      try {
        p.proc.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
  }
  setTimeout(() => process.exit(code), 200);
}

process.on("SIGINT", () => {
  console.log("\n[harness] SIGINT — stopping Metros");
  shutdown(0);
});
process.on("SIGTERM", () => shutdown(0));

function startTarget(target) {
  const cwd = target.root;
  if (!fs.existsSync(cwd)) {
    log(target.id, `WARN cwd missing: ${cwd} — skipping`);
    return null;
  }
  // rn module dev = rn module dev (CLI shim lives in packages/rn/bin).
  // Spawn with PORT so Metro binds to the right port deterministically.
  const proc = spawn(
    "npx",
    ["rn", "module", "dev"],
    {
      cwd,
      env: { ...process.env, PORT: String(target.port) },
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    },
  );

  let resolved = false;
  proc.stdout.on("data", (chunk) => {
    const txt = chunk.toString();
    process.stdout.write(`[metro:${target.id}] ${txt}`);
    if (!resolved && /Welcome to Metro|Bundling|BUILD (OK|FAILED)/i.test(txt)) {
      resolved = true;
      log(target.id, `Metro @ ${target.port} (pid=${proc.pid})`);
    }
  });
  proc.stderr.on("data", (chunk) => {
    process.stderr.write(`[metro:${target.id}:err] ${chunk}`);
  });
  proc.on("exit", (code, signal) => {
    log(target.id, `exit code=${code} signal=${signal ?? "none"}`);
  });

  return { ...target, proc };
}

fs.mkdirSync(HARNESS_DIR, { recursive: true });

for (const t of TARGETS) {
  const p = startTarget(t);
  if (p) procs.push(p);
}

const manifest = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  pid: process.pid,
  modules: procs.map((p) => ({
    id: p.id,
    root: p.root,
    port: p.port,
    pid: p.proc.pid,
  })),
};

fs.writeFileSync(HARNESS_FILE, JSON.stringify(manifest, null, 2) + "\n", "utf8");
log("manifest", HARNESS_FILE);

log(
  "status",
  procs.length
    ? `2 Metros up — see ${HARNESS_FILE}`
    : `no Metros spawned (set DESK_ROOT/FIXTURE_SECOND_ROOT)`,
);

// Keep the harness alive until SIGINT/SIGTERM.
// Heartbeat so consumers know harness is live.
setInterval(() => {
  for (const p of procs) {
    if (p.proc.killed || p.proc.exitCode !== null) {
      log(p.id, `unexpected exit code=${p.proc.exitCode}`);
    }
  }
}, 5000).unref();
