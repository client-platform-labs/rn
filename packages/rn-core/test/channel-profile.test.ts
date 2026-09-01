import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultChinaChannelProfiles,
  isJsBlockedForChannel,
  validateChannelProfileSet,
} from "../dist/channel-profile.js";

describe("channel-profile", () => {
  it("default China set structurally ok", () => {
    const profiles = defaultChinaChannelProfiles();
    const v = validateChannelProfileSet(profiles);
    assert.equal(v.ok, true);
    assert.ok(v.blockedJsChannels.includes("360-best-effort"));
    assert.equal(isJsBlockedForChannel(v, "360-best-effort"), true);
    assert.equal(isJsBlockedForChannel(v, "huawei"), false);
  });

  it("flags expired evidence", () => {
    const profiles = defaultChinaChannelProfiles("gov", "2020-01-01");
    const v = validateChannelProfileSet(profiles, {
      now: new Date("2026-09-01"),
    });
    assert.equal(v.ok, false);
    assert.ok(v.issues.some((i) => i.code === "evidence_expired"));
  });

  it("requires first-class channels", () => {
    const v = validateChannelProfileSet([
      {
        channelId: "huawei",
        supportTier: "first-class",
        jsTrain: { allowed: true },
        evidence: { owner: "x", expiresAt: "2099-01-01" },
      },
    ]);
    assert.equal(v.ok, false);
    assert.ok(v.issues.some((i) => i.message.includes("app-store-cn")));
  });
});
