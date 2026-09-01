/**
 * Map C C3 — channel_profile contract (blueprint 04).
 * Validates profiles; does not call store APIs.
 */

export const CHANNEL_IDS = [
  "app-store-cn",
  "huawei",
  "xiaomi",
  "oppo",
  "vivo",
  "honor",
  "yingyongbao",
  "360-best-effort",
] as const;

export type ChannelId = (typeof CHANNEL_IDS)[number];

export type ChannelSupportTier = "first-class" | "best-effort";

export type ChannelJsBlockReason =
  | null
  | "BLOCKED_PENDING_CHANNEL_RULES"
  | "POLICY_DENY";

export type ChannelProfile = {
  channelId: ChannelId;
  supportTier: ChannelSupportTier;
  jsTrain: {
    allowed: boolean;
    blockReason?: ChannelJsBlockReason;
  };
  evidence: {
    owner: string;
    expiresAt: string;
    sources?: string[];
  };
};

export type ChannelProfileIssue = {
  channelId?: string;
  code:
    | "unknown_channel"
    | "missing_field"
    | "evidence_expired"
    | "pending_rules"
    | "policy_deny"
    | "duplicate";
  message: string;
  blocking: boolean;
};

export type ChannelProfileValidation = {
  ok: boolean;
  issues: ChannelProfileIssue[];
  /** Channels where JS train must not ship */
  blockedJsChannels: ChannelId[];
};

const FIRST_CLASS: ChannelId[] = [
  "app-store-cn",
  "huawei",
  "xiaomi",
  "oppo",
  "vivo",
  "honor",
  "yingyongbao",
];

/** Default China set — conservative: JS allowed only when evidence fresh. */
export function defaultChinaChannelProfiles(
  evidenceOwner = "platform-governance",
  expiresAt = "2099-01-01",
): ChannelProfile[] {
  const first = FIRST_CLASS.map(
    (channelId): ChannelProfile => ({
      channelId,
      supportTier: "first-class",
      jsTrain: { allowed: true, blockReason: null },
      evidence: { owner: evidenceOwner, expiresAt, sources: ["kickoff-stub"] },
    }),
  );
  first.push({
    channelId: "360-best-effort",
    supportTier: "best-effort",
    jsTrain: {
      allowed: false,
      blockReason: "BLOCKED_PENDING_CHANNEL_RULES",
    },
    evidence: {
      owner: evidenceOwner,
      expiresAt,
      sources: ["best-effort-no-parity"],
    },
  });
  return first;
}

function isChannelId(id: string): id is ChannelId {
  return (CHANNEL_IDS as readonly string[]).includes(id);
}

function evidenceExpired(expiresAt: string, now: Date): boolean {
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return true;
  return t < now.getTime();
}

export function validateChannelProfileSet(
  profiles: readonly ChannelProfile[],
  opts?: { now?: Date; requireAllFirstClass?: boolean },
): ChannelProfileValidation {
  const now = opts?.now ?? new Date();
  const issues: ChannelProfileIssue[] = [];
  const blockedJsChannels: ChannelId[] = [];
  const seen = new Set<string>();

  for (const p of profiles) {
    if (!p?.channelId || !isChannelId(p.channelId)) {
      issues.push({
        channelId: p?.channelId,
        code: "unknown_channel",
        message: `unknown channelId ${p?.channelId}`,
        blocking: true,
      });
      continue;
    }
    if (seen.has(p.channelId)) {
      issues.push({
        channelId: p.channelId,
        code: "duplicate",
        message: `duplicate channelId ${p.channelId}`,
        blocking: true,
      });
      continue;
    }
    seen.add(p.channelId);

    if (!p.evidence?.owner?.trim() || !p.evidence?.expiresAt?.trim()) {
      issues.push({
        channelId: p.channelId,
        code: "missing_field",
        message: "evidence.owner and evidence.expiresAt required",
        blocking: true,
      });
    } else if (evidenceExpired(p.evidence.expiresAt, now)) {
      issues.push({
        channelId: p.channelId,
        code: "evidence_expired",
        message: `evidence expired at ${p.evidence.expiresAt}`,
        blocking: true,
      });
      blockedJsChannels.push(p.channelId);
    }

    if (p.jsTrain?.blockReason === "BLOCKED_PENDING_CHANNEL_RULES") {
      issues.push({
        channelId: p.channelId,
        code: "pending_rules",
        message: "BLOCKED_PENDING_CHANNEL_RULES — do not infer sibling channels",
        blocking: true,
      });
      if (!blockedJsChannels.includes(p.channelId)) {
        blockedJsChannels.push(p.channelId);
      }
    }
    if (p.jsTrain?.blockReason === "POLICY_DENY" || p.jsTrain?.allowed === false) {
      if (p.jsTrain?.blockReason === "POLICY_DENY") {
        issues.push({
          channelId: p.channelId,
          code: "policy_deny",
          message: "POLICY_DENY — JS train forbidden on channel",
          blocking: true,
        });
      }
      if (!blockedJsChannels.includes(p.channelId)) {
        blockedJsChannels.push(p.channelId);
      }
    }
  }

  if (opts?.requireAllFirstClass !== false) {
    for (const id of FIRST_CLASS) {
      if (!seen.has(id)) {
        issues.push({
          channelId: id,
          code: "missing_field",
          message: `missing first-class channel profile: ${id}`,
          blocking: true,
        });
      }
    }
  }

  const ok = !issues.some((i) => i.blocking && i.code !== "pending_rules" && i.code !== "policy_deny");
  // Set is "valid structure" even if some channels block JS — ok means schema/completeness
  // Industrial: completeness of first-class + no unknown/duplicate/expired for allowed channels
  const structuralFail = issues.some((i) =>
    ["unknown_channel", "duplicate", "missing_field", "evidence_expired"].includes(
      i.code,
    ),
  );

  return {
    ok: !structuralFail,
    issues,
    blockedJsChannels,
  };
}

/** True when JS promote to channel must be refused. */
export function isJsBlockedForChannel(
  validation: ChannelProfileValidation,
  channelId: ChannelId,
): boolean {
  return validation.blockedJsChannels.includes(channelId);
}
