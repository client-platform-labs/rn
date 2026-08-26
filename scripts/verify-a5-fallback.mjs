#!/usr/bin/env node
/**
 * A5 (#8) — client fallback: slots persist + health exclude + Failed UI model.
 *
 * Usage:
 *   node scripts/verify-a5-fallback.mjs [projectRoot]
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = path.resolve(process.argv[2] ?? process.cwd());

const core = await import(
  pathToFileURL(path.join(repoRoot, "packages/rn-core/dist/index.js")).href
);

const fingerprint = {
  rnExactTuple: "0.87.0+hermes-v1+newarch+codegen-locked",
  hermesVmIdentity: "hermes-v1@compiler-id",
  hbcBytecodeVersion: 96,
  newArchFlags: {
    bridgeless: true,
    fabric: true,
    turboModules: true,
  },
  nativeAbiSurfaceDigest: "sha256:abi-surface-sample",
};

const host = {
  runtime_fingerprint: fingerprint,
  capability_set: ["capability.camera@1.2.0"],
  artifact_line: "android-cn-huawei",
  hbcBytecodeVersion: 96,
  channel_js_allowed: true,
};

function candidate(update_id) {
  return {
    business_module: "checkout",
    update_id,
    runtime_fingerprint: fingerprint,
    hbcBytecodeVersion: 96,
    required_capabilities: [],
    target_artifact_lines: ["android-cn-huawei"],
    release_gate: "js-standard",
  };
}

const work = mkdtempSync(path.join(tmpdir(), "rn-a5-"));
const root = path.join(work, "app");

try {
  const slots = {
    business_module: "checkout",
    baseline: candidate("baseline-1"),
    active: candidate("active-bad"),
    previous: candidate("previous-1"),
  };
  core.saveModuleSlots(root, slots);
  const loaded = core.loadModuleSlots(root, "checkout");
  if (!loaded.ok) {
    console.error("FAIL: loadModuleSlots", loaded.reason);
    process.exit(1);
  }

  const health = core.excludeSlotsFromHealth([
    {
      slot: "active",
      kind: "startup_crash",
      at: new Date().toISOString(),
      detail: "A5 verify health",
    },
  ]);
  const cpKill = core.excludeSlotsByBlockedUpdates(loaded.slots, [
    "never-matches",
  ]);
  const exclude = core.mergeExcludeSlots(health, cpKill);

  const selected = core.selectFallbackSlot(loaded.slots, host, {
    excludeSlots: exclude,
  });
  if (!selected.ok || selected.slot !== "previous") {
    console.error("FAIL: expected previous after health exclude", selected);
    process.exit(1);
  }

  const uiOk = core.presentFallbackUi(selected);
  if (uiOk.mode !== "load" || uiOk.updateId !== "previous-1") {
    console.error("FAIL: presentFallbackUi load", uiOk);
    process.exit(1);
  }

  const failed = core.selectFallbackSlot(loaded.slots, host, {
    excludeSlots: ["active", "previous", "baseline"],
  });
  if (failed.ok) {
    console.error("FAIL: expected FAILED when all excluded");
    process.exit(1);
  }
  const uiFail = core.presentFallbackUi(failed, "checkout");
  if (uiFail.mode !== "failed") {
    console.error("FAIL: presentFallbackUi failed", uiFail);
    process.exit(1);
  }

  let budget = core.createDownloadRetryBudget(1);
  const attempt = core.recordDownloadAttempt(budget);
  if (!attempt.ok) {
    console.error("FAIL: first download attempt");
    process.exit(1);
  }
  budget = attempt.budget;
  const exhausted = core.recordDownloadAttempt(budget);
  if (exhausted.ok) {
    console.error("FAIL: expected retry budget exhausted");
    process.exit(1);
  }

  const dig = core.verifyArtifactDigest("sha256:ok", "sha256:ok");
  if (!dig.ok) {
    console.error("FAIL: digest");
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectRoot,
        slot: selected.slot,
        update_id: selected.candidate.update_id,
        failed_ui: uiFail.title,
        slots_path: loaded.path,
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
