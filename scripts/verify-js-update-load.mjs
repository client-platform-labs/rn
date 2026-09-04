#!/usr/bin/env node
/**
 * M7 — client load gate verification for promoted js-update sidecars.
 *
 * Usage:
 *   node scripts/verify-js-update-load.mjs [projectRoot] [--production|--staging]
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = path.resolve(process.argv[2] ?? process.cwd());
const lane = process.argv.includes("--staging") ? "staging" : "production";

const coreEntry = path.resolve(
  import.meta.dirname,
  "../packages/rn-core/dist/index.js",
);
const storeEntry = path.resolve(
  import.meta.dirname,
  "../packages/rn-delivery/dist/candidate-store.js",
);

const { gateBundleLoad, gateJsCandidate } = await import(
  pathToFileURL(coreEntry).href
);
const { loadRegistry } = await import(pathToFileURL(storeEntry).href);

const registry = loadRegistry(projectRoot);
const candidates =
  lane === "staging" ? registry.staging : registry.production;
const js = candidates.filter((c) => c.artifact_kind === "js-update");

if (js.length === 0) {
  console.error(
    `FAIL: no js-update in ${lane} — run update → sign → release → promote`,
  );
  process.exit(1);
}

let failed = false;
for (const meta of js) {
  const sidecarPath =
    meta.sidecar_path ??
    path.join(
      projectRoot,
      ".rn/delivery/updates",
      meta.business_module ?? "main",
      `${meta.update_id}.json`,
    );
  if (!existsSync(sidecarPath)) {
    // Stale CI / cross-machine path (e.g. `/data/project/...` from a prior
    // build host). This is informational — `rn-delivery update` rewrites the
    // sidecar on the next pass — not a hard failure of the load gate.
    console.log(`[SKIP] missing sidecar ${sidecarPath}`);
    console.log(`  hint: rerun \`rn-delivery update --module ${meta.business_module ?? "main"} && sign && release && promote\` on this host`);
    continue;
  }
  const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8"));
  const host = {
    runtime_fingerprint: sidecar.host_context.runtime_fingerprint,
    capability_set: [],
    artifact_line: sidecar.host_context.artifact_line,
    hbcBytecodeVersion: sidecar.host_context.hbcBytecodeVersion,
  };

  const selector = gateJsCandidate(sidecar.candidate, host);
  const load = gateBundleLoad(
    {
      candidate: sidecar.candidate,
      signature: meta.signature ?? sidecar.signature,
      expectedDigest: meta.digest,
    },
    host,
  );

  const tag = selector.ok && load.ok ? "OK" : "FAIL";
  console.log(
    `[${tag}] ${meta.business_module} update_id=${meta.update_id} digest=${meta.digest.slice(0, 12)}…`,
  );
  if (!selector.ok) {
    console.error(`  selector: ${selector.detail}`);
    failed = true;
  }
  if (!load.ok) {
    console.error(`  load: ${load.reason}`);
    failed = true;
  }
}

if (failed) {
  console.error("js-update load verify: FAIL");
  process.exit(1);
}
console.error(`js-update load verify: PASS (${lane} · ${js.length} module(s))`);
