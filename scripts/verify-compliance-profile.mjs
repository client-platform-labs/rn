#!/usr/bin/env node
/**
 * Map D D1 — P16 dual-landing compliance + P17 exception ledger.
 *
 * Usage:
 *   node scripts/verify-compliance-profile.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const mod = await import(
  pathToFileURL(
    path.join(repoRoot, "packages/rn-core/dist/compliance-profile.js"),
  ).href
);

function step(name, ok, detail) {
  if (!ok) {
    console.error(`[FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
    process.exit(1);
  }
  console.log(`[OK] ${name}`);
}

const good = mod.validateComplianceProfile(
  mod.defaultFinanceComplianceProfile(),
);
step("finance profile dual-lands", good.ok);

const bad = mod.validateComplianceProfile({
  id: "x",
  name: "x",
  rules: [{ id: "r1", description: "ci only", bindings: ["ci"] }],
});
step(
  "single-landing rejected",
  bad.ok === false && bad.issues[0]?.code === "SINGLE_LANDING",
);

const expired = mod.evaluateExceptionLedger(
  [
    {
      id: "e1",
      owner: "a",
      ticket: "T",
      expires_at: "2020-01-01T00:00:00.000Z",
      scope: "m",
      review_cadence_days: 7,
    },
  ],
  { now: new Date("2026-09-01T00:00:00.000Z") },
);
step("expired exception blocks", expired.ok === false && expired.debt_count === 1);

const fresh = mod.evaluateExceptionLedger(
  [
    {
      id: "e2",
      owner: "b",
      ticket: "T2",
      expires_at: "2099-01-01T00:00:00.000Z",
      scope: "m",
      review_cadence_days: 7,
    },
  ],
  { now: new Date("2026-09-01T00:00:00.000Z") },
);
step("fresh exception ok", fresh.ok === true);

console.log("PASS verify-compliance-profile");
