#!/usr/bin/env node
/**
 * Probe runner + registry CLI (Map I / C5 — #259).
 *
 * Run one probe with a wall-clock timeout and a transparent exit code:
 *   node scripts/_run-verify.mjs scripts/verify-cp-auth.mjs
 *   node scripts/_run-verify.mjs cp-auth
 *   VERIFY_TIMEOUT_MS=90000 node scripts/_run-verify.mjs cp-auth
 *
 * Interrogate the fleet (`scripts/lib/verify/registry.mjs`):
 *   node scripts/_run-verify.mjs --list      every probe + its execution path
 *   node scripts/_run-verify.mjs --orphans   probes nobody runs + dangling refs
 *
 * Add `--json` to either query for machine consumption.
 *
 * NOTE: every path sets `process.exitCode` and returns instead of calling
 * `process.exit()`. Exiting immediately after a large write truncates stdout
 * when it is a pipe (`--orphans --json` is >64KB, and a clipped JSON payload
 * reads as corrupt data rather than as an error).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  auditProbes,
  findProbe,
  listProbes,
  REPO_ROOT,
} from "./lib/verify/registry.mjs";

const TIMEOUT_MS = parseInt(process.env.VERIFY_TIMEOUT_MS || "60000", 10);

async function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes("--json");
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const target = argv.find((a) => !a.startsWith("--"));

  if (flags.has("--list")) {
    const probes = listProbes();
    if (asJson) {
      console.log(JSON.stringify(probes, null, 2));
    } else {
      const width = Math.max(...probes.map((p) => p.name.length));
      console.log(`probes: ${probes.length} (repo: ${REPO_ROOT})`);
      for (const p of probes) {
        const path = p.orphan ? "orphan (no automation caller)" : p.kinds.join(",");
        console.log(`  ${p.name.padEnd(width)}  ${path}`);
      }
    }
    return 0;
  }

  if (flags.has("--orphans")) {
    const audit = auditProbes();
    if (asJson) {
      console.log(JSON.stringify(audit, null, 2));
    } else {
      console.log(
        `probes: ${audit.total} · referenced: ${audit.referenced.length} · ` +
          `CI-referenced: ${audit.ciReferenced.length} · orphans: ${audit.orphans.length}`,
      );
      console.log("");
      console.log(`orphans (${audit.orphans.length}) — no automation caller:`);
      for (const p of audit.orphans) console.log(`  ${p.rel}`);
      console.log("");
      console.log(
        `dangling (${audit.dangling.length}) — referenced but not on disk ` +
          "(a `[[ -f ]]` guard hides these):",
      );
      for (const d of audit.dangling) {
        console.log(`  ${d.base}  <- ${d.source} (${d.kind})`);
      }
    }
    // Dead wiring is a failed check, not a passing one. Orphans alone are
    // informational: they are made visible here, and triaged elsewhere.
    return audit.dangling.length > 0 ? 1 : 0;
  }

  if (!target) {
    console.error("usage: node scripts/_run-verify.mjs <verify-script.mjs|probe>");
    console.error("       node scripts/_run-verify.mjs --list [--json]");
    console.error("       node scripts/_run-verify.mjs --orphans [--json]");
    return 2;
  }

  // Accept a bare probe name as well as a path: the registry knows where it lives.
  const probe = !existsSync(target) && !target.includes("/") ? findProbe(target) : null;
  const script = probe ? probe.path : resolve(target);
  if (probe) console.error(`[probe] ${probe.rel}`);

  return await runProbe(script);
}

/** Run one probe with a wall-clock timeout; 124 mirrors coreutils `timeout`. */
function runProbe(script) {
  return new Promise((resolveCode) => {
    const child = spawn(process.execPath, [script], { stdio: "inherit" });
    let timedOut = false;

    const killTimer = setTimeout(() => {
      timedOut = true;
      console.error(`[timeout] ${script} 超时 ${TIMEOUT_MS}ms，kill`);
      child.kill("SIGKILL");
    }, TIMEOUT_MS);

    child.on("exit", (code, signal) => {
      clearTimeout(killTimer);
      if (timedOut || signal === "SIGKILL") resolveCode(124);
      else resolveCode(code ?? 1);
    });
  });
}

process.exitCode = await main();
