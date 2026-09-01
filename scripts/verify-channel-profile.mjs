#!/usr/bin/env node
/**
 * Map C C3 — channel_profile seven-channel contract (no store backends).
 *
 * Usage:
 *   node scripts/verify-channel-profile.mjs
 */
import { pathToFileURL } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const {
  defaultChinaChannelProfiles,
  validateChannelProfileSet,
  isJsBlockedForChannel,
} = await import(
  pathToFileURL(path.join(repoRoot, "packages/rn-core/dist/channel-profile.js"))
    .href
);

let failed = false;
function step(name, ok, detail = "") {
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

const good = defaultChinaChannelProfiles();
const v = validateChannelProfileSet(good);
step("seven-channel set structural ok", v.ok === true, `issues=${v.issues.length}`);
step(
  "360 pending rules blocks JS",
  isJsBlockedForChannel(v, "360-best-effort") === true,
);
step(
  "huawei JS allowed when evidence fresh",
  isJsBlockedForChannel(v, "huawei") === false,
);

const expired = defaultChinaChannelProfiles("gov", "2019-01-01");
const bad = validateChannelProfileSet(expired, {
  now: new Date("2026-09-01"),
});
step("expired evidence fails set", bad.ok === false);
step(
  "pending_rules issue present on 360",
  v.issues.some((i) => i.code === "pending_rules" && i.channelId === "360-best-effort"),
);

const missing = validateChannelProfileSet([
  {
    channelId: "vivo",
    supportTier: "first-class",
    jsTrain: { allowed: true },
    evidence: { owner: "x", expiresAt: "2099-01-01" },
  },
]);
step("incomplete first-class set fails", missing.ok === false);

if (failed) {
  console.error("verify-channel-profile: FAIL");
  process.exit(1);
}
console.log("PASS verify-channel-profile");
process.exit(0);
