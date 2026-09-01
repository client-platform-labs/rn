#!/usr/bin/env node
/**
 * Map D D5 — ops oncall runbook AFK checklist contract.
 *
 * Asserts required section anchors and script references exist in
 * docs/runbooks/cp-oncall.md (machine-readable, no GRC backend claim).
 *
 * Usage:
 *   node scripts/verify-ops-runbook.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const runbookPath = path.join(repoRoot, "docs/runbooks/cp-oncall.md");

/** @type {{ anchor: string, title: string, scripts: string[] }[]} */
export const OPS_RUNBOOK_CHECKLIST = [
  {
    anchor: "afk:scope",
    title: "scope",
    scripts: ["run-map-d-loop.mjs", "run-map-c-loop.mjs"],
  },
  {
    anchor: "afk:kill-pause",
    title: "kill/pause by module",
    scripts: ["verify-cp-kill-pause.mjs"],
  },
  {
    anchor: "afk:promote-e2e-fail",
    title: "promote blocked e2e_fail",
    scripts: ["verify-cp-e2e-promote-gate.mjs"],
  },
  {
    anchor: "afk:promote-consistency-fail",
    title: "promote blocked consistency_fail",
    scripts: ["verify-consistency-gate.mjs"],
  },
  {
    anchor: "afk:promote-sbom",
    title: "promote blocked SBOM",
    scripts: ["verify-cp-sbom-promote-gate.mjs"],
  },
  {
    anchor: "afk:promote-governance",
    title: "promote blocked governance",
    scripts: [
      "verify-compliance-profile.mjs",
      "verify-cp-governance-promote-gate.mjs",
    ],
  },
  {
    anchor: "afk:rollout-tick-slo",
    title: "rollout tick / SLO breach",
    scripts: [
      "verify-cp-service.mjs",
      "verify-cp-rollout-tick.mjs",
    ],
  },
  {
    anchor: "afk:exception-ledger-expiry",
    title: "exception ledger expiry",
    scripts: [
      "verify-compliance-profile.mjs",
      "verify-cp-governance-promote-gate.mjs",
    ],
  },
  {
    anchor: "afk:channel-profile-pending-rules",
    title: "channel_profile pending-rules",
    scripts: ["verify-channel-profile.mjs"],
  },
];

function step(name, ok, detail = "") {
  if (!ok) {
    console.error(`[FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
    process.exit(1);
  }
  console.log(`[OK] ${name}`);
}

let text;
try {
  text = readFileSync(runbookPath, "utf8");
} catch {
  console.error(`[FAIL] missing runbook at ${runbookPath}`);
  process.exit(1);
}

step("runbook file exists", text.length > 200);

step(
  "disclaims GRC live",
  /NOT.*GRC|do not claim live|Out of scope/i.test(text),
);

for (const section of OPS_RUNBOOK_CHECKLIST) {
  const marker = `<!-- ${section.anchor} -->`;
  step(`anchor ${section.anchor}`, text.includes(marker), `missing ${marker}`);
  for (const script of section.scripts) {
    step(
      `${section.anchor} links ${script}`,
      text.includes(script),
      `runbook must reference scripts/${script}`,
    );
  }
}

step(
  "self-verify reference",
  text.includes("verify-ops-runbook.mjs"),
);

console.log("PASS verify-ops-runbook");
