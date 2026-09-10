import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  assertCanPause,
  assertCanResume,
  collectBlockedUpdateIds,
  normalizeKillInput,
  pauseRolloutState,
  resumeRolloutState,
  startRolloutState,
  advanceRolloutState,
  tickRolloutState,
  type KillRecord,
  type PauseRecord,
  type ReleaseRolloutState,
  type JsReleaseGate,
  type SliSnapshot,
  type TickRolloutResult,
} from "@client-platform/core";

import type { CandidateMetadata } from "./types.js";
import {
  loadRegistrySqlite,
  saveRegistrySqlite,
  useSqliteRegistry,
} from "./registry-sqlite.js";
import { signCanonicalPayload } from "./signature.js";

export const DELIVERY_STATE_DIR = ".rn/delivery";
export const LAST_BUILD_FILE = "last-build.json";
export const LAST_CANDIDATE_FILE = "last-candidate.json";
export const REGISTRY_FILE = "registry.json";

/** Distribution lane for host / js-update candidates and per-device slicing. */
export type Lane = "staging" | "production" | "gray";

/** Device → lane assignment (C6.3 grey slicing). Key is device serial. */
export type DeviceLaneRecord = Record<
  string,
  { lane: Lane; assigned_at: string }
>;

export const LANES: readonly Lane[] = ["staging", "production", "gray"];

export function isValidLane(value: unknown): value is Lane {
  return (
    typeof value === "string" && (LANES as readonly string[]).includes(value)
  );
}

export type DeliveryRegistry = {
  schemaVersion: 1;
  /** Staging lane — promote-same-artifact source of truth (file CP stub). */
  staging: CandidateMetadata[];
  production: CandidateMetadata[];
  /** Grey lane — manual / flag-driven device slice (sits beside staging/production). */
  gray: CandidateMetadata[];
  /** device → lane routing table (C6.3). */
  devices: DeviceLaneRecord;
  blocked: Array<{
    release_id: string;
    digest: string;
    platform: string;
    reason: string;
    blocked_at: string;
    update_id?: string;
    business_module?: string;
  }>;
  /** Map B B9 — module-scoped kill (update_id → A5 exclude). */
  kills: KillRecord[];
  /** Map B B9 — module pause (blocks promote narrative; resume admin-only). */
  pauses: PauseRecord[];
  /** Map B B11 — thin P10 rollout_steps per digest/module. */
  rollouts: ReleaseRolloutState[];
  /** ADR-024 (D3): revoked signing keys (pubkey hex) served via /v1/crl — device fail-closed. */
  revocations: Array<{
    public_key_hex: string;
    reason?: string;
    revoked_at: string;
  }>;
};

export function deliveryDir(projectRoot: string): string {
  return path.join(projectRoot, DELIVERY_STATE_DIR);
}

export function ensureDeliveryDir(projectRoot: string): string {
  const dir = deliveryDir(projectRoot);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * ADR-013 — atomic write for file-mode delivery state (tmp + rename in same dir).
 * A crash mid-write must never leave a truncated registry.json / last-build.json.
 */
export function writeFileAtomicSync(filePath: string, data: string): void {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, filePath);
  } catch (err) {
    try {
      if (existsSync(tmp)) rmSync(tmp, { force: true });
    } catch {
      /* best-effort cleanup */
    }
    throw err;
  }
}

export type LastBuildRecord = {
  schemaVersion: 1;
  built_at: string;
  candidates: CandidateMetadata[];
};

export function writeBuildResults(
  projectRoot: string,
  candidates: CandidateMetadata[],
): LastBuildRecord {
  ensureDeliveryDir(projectRoot);
  const record: LastBuildRecord = {
    schemaVersion: 1,
    built_at: new Date().toISOString(),
    candidates,
  };
  writeFileAtomicSync(
    path.join(deliveryDir(projectRoot), LAST_BUILD_FILE),
    `${JSON.stringify(record, null, 2)}\n`,
  );
  const primary =
    candidates.find((c) => c.platform === "android") ?? candidates[0];
  if (primary) {
    writeFileAtomicSync(
      path.join(deliveryDir(projectRoot), LAST_CANDIDATE_FILE),
      `${JSON.stringify(primary, null, 2)}\n`,
    );
  }
  return record;
}

export function readLastBuild(projectRoot: string): LastBuildRecord | null {
  const file = path.join(deliveryDir(projectRoot), LAST_BUILD_FILE);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as LastBuildRecord;
  } catch {
    return null;
  }
}

export function readLastCandidate(
  projectRoot: string,
): CandidateMetadata | null {
  const file = path.join(deliveryDir(projectRoot), LAST_CANDIDATE_FILE);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as CandidateMetadata;
  } catch {
    return null;
  }
}

export function emptyRegistry(): DeliveryRegistry {
  return {
    schemaVersion: 1,
    staging: [],
    production: [],
    gray: [],
    devices: {},
    blocked: [],
    kills: [],
    pauses: [],
    rollouts: [],
    revocations: [],
  };
}

function normalizeRegistry(raw: DeliveryRegistry): DeliveryRegistry {
  return {
    schemaVersion: 1,
    staging: raw.staging ?? [],
    production: raw.production ?? [],
    gray: raw.gray ?? [],
    devices: normalizeDevices(raw.devices),
    blocked: raw.blocked ?? [],
    kills: raw.kills ?? [],
    pauses: raw.pauses ?? [],
    rollouts: raw.rollouts ?? [],
    revocations: raw.revocations ?? [],
  };
}

function normalizeDevices(
  raw: DeliveryRegistry["devices"] | undefined,
): DeviceLaneRecord {
  const out: DeviceLaneRecord = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [serial, rec] of Object.entries(raw)) {
    if (!rec || typeof rec !== "object") continue;
    const lane = rec.lane;
    if (!isValidLane(lane)) continue;
    out[serial] = {
      lane,
      assigned_at:
        typeof rec.assigned_at === "string"
          ? rec.assigned_at
          : new Date().toISOString(),
    };
  }
  return out;
}

export function loadRegistry(projectRoot: string): DeliveryRegistry {
  if (useSqliteRegistry()) {
    return normalizeRegistry(loadRegistrySqlite(projectRoot));
  }
  const file = path.join(deliveryDir(projectRoot), REGISTRY_FILE);
  if (!existsSync(file)) return emptyRegistry();
  try {
    return normalizeRegistry(
      JSON.parse(readFileSync(file, "utf8")) as DeliveryRegistry,
    );
  } catch {
    return emptyRegistry();
  }
}

const INSTALLABLE_KINDS = new Set(["app-host", "app-host-debug"]);

/** Resolve candidate arrays for a lane selector (includes gray). */
function lanesFor(
  registry: DeliveryRegistry,
  lane: Lane | "all",
): CandidateMetadata[] {
  if (lane === "staging") return registry.staging;
  if (lane === "production") return registry.production;
  if (lane === "gray") return registry.gray;
  return [...registry.staging, ...registry.production, ...registry.gray];
}

/** #15 / Map B — installable Android app-host candidates from registry lanes. */
export function listInstallableCandidates(
  registry: DeliveryRegistry,
  lane: Lane | "all" = "all",
): CandidateMetadata[] {
  return lanesFor(registry, lane).filter(
    (c) =>
      c.platform === "android" &&
      INSTALLABLE_KINDS.has(c.artifact_kind) &&
      Boolean(c.path?.trim()),
  );
}

/** Map E #105 — resolve one installable host candidate by digest. */
export function findInstallableByDigest(
  registry: DeliveryRegistry,
  digest: string,
): CandidateMetadata | undefined {
  const needle = digest.trim().toLowerCase();
  if (!needle) return undefined;
  return listInstallableCandidates(registry, "all").find(
    (c) => c.digest.toLowerCase() === needle,
  );
}

/** Map E E-T10 — any staged/production artifact with on-disk path (host or js-update). */
export function findArtifactByDigest(
  registry: DeliveryRegistry,
  digest: string,
): CandidateMetadata | undefined {
  const needle = digest.trim().toLowerCase();
  if (!needle) return undefined;
  return [...registry.staging, ...registry.production, ...registry.gray].find(
    (c) => c.digest.toLowerCase() === needle && Boolean(c.path?.trim()),
  );
}

/** Map E #106 — js-update candidates for offline-package train console. */
export function listJsUpdateCandidates(
  registry: DeliveryRegistry,
  lane: Lane | "all" = "all",
  businessModule?: string,
): CandidateMetadata[] {
  const mod = businessModule?.trim();
  return lanesFor(registry, lane).filter((c) => {
    if (c.artifact_kind !== "js-update") return false;
    if (mod && c.business_module !== mod) return false;
    return true;
  });
}

export function saveRegistry(
  projectRoot: string,
  registry: DeliveryRegistry,
): void {
  ensureDeliveryDir(projectRoot);
  if (useSqliteRegistry()) {
    saveRegistrySqlite(projectRoot, registry);
    return;
  }
  writeFileAtomicSync(
    path.join(deliveryDir(projectRoot), REGISTRY_FILE),
    `${JSON.stringify(registry, null, 2)}\n`,
  );
}

export function promoteCandidateToStaging(
  projectRoot: string,
  candidate: CandidateMetadata,
): DeliveryRegistry {
  const registry = loadRegistry(projectRoot);
  const promoted: CandidateMetadata = {
    ...candidate,
    stage: "promote",
    lane: "staging",
  };
  registry.staging = [
    ...registry.staging.filter((c) => c.digest !== promoted.digest),
    promoted,
  ];
  saveRegistry(projectRoot, registry);
  return registry;
}

export function blockCandidateInRegistry(
  projectRoot: string,
  candidate: CandidateMetadata,
  reason: string,
): DeliveryRegistry {
  const registry = loadRegistry(projectRoot);
  registry.staging = registry.staging.filter(
    (c) => c.digest !== candidate.digest,
  );
  registry.production = registry.production.filter(
    (c) => c.digest !== candidate.digest,
  );
  registry.blocked.push({
    release_id: candidate.release_id,
    digest: candidate.digest,
    platform: candidate.platform,
    reason,
    blocked_at: new Date().toISOString(),
    update_id: candidate.update_id,
    business_module: candidate.business_module,
  });
  saveRegistry(projectRoot, registry);
  return registry;
}

export function writeLastCandidate(
  projectRoot: string,
  candidate: CandidateMetadata,
): void {
  ensureDeliveryDir(projectRoot);
  const candidateFile = path.join(
    deliveryDir(projectRoot),
    LAST_CANDIDATE_FILE,
  );
  writeFileAtomicSync(candidateFile, `${JSON.stringify(candidate, null, 2)}\n`);

  const buildFile = path.join(deliveryDir(projectRoot), LAST_BUILD_FILE);
  if (!existsSync(buildFile)) return;
  let record: LastBuildRecord;
  try {
    record = JSON.parse(readFileSync(buildFile, "utf8")) as LastBuildRecord;
  } catch {
    return;
  }
  const idx = record.candidates.findIndex((c) => c.digest === candidate.digest);
  if (idx < 0) return;
  record.candidates[idx] = candidate;
  writeFileAtomicSync(buildFile, `${JSON.stringify(record, null, 2)}\n`);
}

export function promoteStagingToProduction(
  projectRoot: string,
  digest: string,
): { registry: DeliveryRegistry; production: CandidateMetadata } {
  const registry = loadRegistry(projectRoot);
  const staging = registry.staging.find((c) => c.digest === digest);
  if (!staging) {
    throw new Error(`no staging candidate for digest ${digest}`);
  }
  const production: CandidateMetadata = {
    ...staging,
    stage: "promote",
    lane: "production",
  };
  registry.staging = registry.staging.filter((c) => c.digest !== digest);
  registry.production = [
    ...registry.production.filter((c) => c.digest !== digest),
    production,
  ];
  saveRegistry(projectRoot, registry);
  return { registry, production };
}

export function killModuleUpdates(
  projectRoot: string,
  input: {
    business_module: string;
    update_ids: string[];
    reason?: string;
    actor?: string;
  },
): { registry: DeliveryRegistry; kill: KillRecord } {
  const registry = loadRegistry(projectRoot);
  const kill = normalizeKillInput(input);
  registry.kills = [
    ...registry.kills.filter((k) => k.business_module !== kill.business_module),
    kill,
  ];
  saveRegistry(projectRoot, registry);
  return { registry, kill };
}

export function pauseModule(
  projectRoot: string,
  input: { business_module: string; reason?: string; actor?: string },
): { registry: DeliveryRegistry; pause: PauseRecord } {
  const registry = loadRegistry(projectRoot);
  assertCanPause(registry.pauses, input.business_module);
  const pause: PauseRecord = {
    business_module: input.business_module.trim(),
    reason: input.reason?.trim() || "cp pause",
    paused_at: new Date().toISOString(),
    actor: input.actor?.trim() || "admin",
  };
  registry.pauses = [...registry.pauses, pause];
  saveRegistry(projectRoot, registry);
  return { registry, pause };
}

export function resumeModule(
  projectRoot: string,
  business_module: string,
): DeliveryRegistry {
  const registry = loadRegistry(projectRoot);
  assertCanResume(registry.pauses, business_module);
  const mod = business_module.trim();
  registry.pauses = registry.pauses.filter((p) => p.business_module !== mod);
  saveRegistry(projectRoot, registry);
  return registry;
}

/** C6.3 grey slicing — read a device's current lane (fallback: "production"). */
export function getDeviceLane(
  registry: DeliveryRegistry,
  serial: string,
): Lane {
  const rec = registry.devices[serial];
  return rec?.lane ?? "production";
}

/** C6.3 grey slicing — assign a device to a lane (persisted, idempotent). */
export function setDeviceLane(
  projectRoot: string,
  serial: string,
  lane: Lane,
): { registry: DeliveryRegistry; lane: Lane } {
  if (!serial?.trim()) {
    throw new Error("setDeviceLane: serial required");
  }
  if (!isValidLane(lane)) {
    throw new Error(`setDeviceLane: invalid lane "${lane}"`);
  }
  const registry = loadRegistry(projectRoot);
  registry.devices = {
    ...registry.devices,
    [serial.trim()]: { lane, assigned_at: new Date().toISOString() },
  };
  saveRegistry(projectRoot, registry);
  return { registry, lane };
}

/** C6.3 grey slicing — list device→lane assignments. */
export function listDeviceLanes(registry: DeliveryRegistry): DeviceLaneRecord {
  return registry.devices;
}

/** update_ids CP kill (+ digest-block) → feed A5 excludeSlotsByBlockedUpdates */
export function blockedUpdateIdsForRuntime(
  registry: DeliveryRegistry,
): string[] {
  return collectBlockedUpdateIds({
    kills: registry.kills,
    blocked: registry.blocked,
  });
}

function upsertRollout(
  registry: DeliveryRegistry,
  rollout: ReleaseRolloutState,
): void {
  registry.rollouts = [
    ...registry.rollouts.filter((r) => r.digest !== rollout.digest),
    rollout,
  ];
}

export function startRollout(
  projectRoot: string,
  input: {
    business_module: string;
    digest: string;
    update_id?: string;
    gate?: JsReleaseGate;
    actor?: string;
    /** Override soak for AFK tests (ms). */
    min_soak_ms?: number;
    /** Optional SLI upper bounds applied to non-full steps. */
    sli_thresholds?: Record<string, number>;
  },
): { registry: DeliveryRegistry; rollout: ReleaseRolloutState } {
  const registry = loadRegistry(projectRoot);
  const rollout = startRolloutState({
    business_module: input.business_module,
    digest: input.digest,
    update_id: input.update_id,
    gate: input.gate,
    actor: input.actor,
    steps:
      input.min_soak_ms == null
        ? undefined
        : [
            {
              cohort: "canary",
              percent: 1,
              min_soak_ms: input.min_soak_ms,
              sli_thresholds: input.sli_thresholds,
            },
            {
              cohort: "rolling-10",
              percent: 10,
              min_soak_ms: input.min_soak_ms,
              sli_thresholds: input.sli_thresholds,
            },
            {
              cohort: "full",
              percent: 100,
              min_soak_ms: 0,
            },
          ],
  });
  upsertRollout(registry, rollout);
  saveRegistry(projectRoot, registry);
  return { registry, rollout };
}

export function advanceRollout(
  projectRoot: string,
  digest: string,
  opts?: { human_full_approved?: boolean; forceSoak?: boolean },
): { registry: DeliveryRegistry; rollout: ReleaseRolloutState } {
  const registry = loadRegistry(projectRoot);
  const cur = registry.rollouts.find((r) => r.digest === digest);
  if (!cur) {
    throw new Error(`no rollout for digest ${digest}`);
  }
  const rollout = advanceRolloutState(cur, opts);
  upsertRollout(registry, rollout);
  saveRegistry(projectRoot, registry);
  return { registry, rollout };
}

export function pauseRollout(
  projectRoot: string,
  digest: string,
): { registry: DeliveryRegistry; rollout: ReleaseRolloutState } {
  const registry = loadRegistry(projectRoot);
  const cur = registry.rollouts.find((r) => r.digest === digest);
  if (!cur) {
    throw new Error(`no rollout for digest ${digest}`);
  }
  const rollout = pauseRolloutState(cur);
  upsertRollout(registry, rollout);
  saveRegistry(projectRoot, registry);
  return { registry, rollout };
}

export function resumeRollout(
  projectRoot: string,
  digest: string,
): { registry: DeliveryRegistry; rollout: ReleaseRolloutState } {
  const registry = loadRegistry(projectRoot);
  const cur = registry.rollouts.find((r) => r.digest === digest);
  if (!cur) {
    throw new Error(`no rollout for digest ${digest}`);
  }
  const rollout = resumeRolloutState(cur);
  upsertRollout(registry, rollout);
  saveRegistry(projectRoot, registry);
  return { registry, rollout };
}

/** Map C C5 — scheduler tick with optional SLI snapshot. */
export function tickRollout(
  projectRoot: string,
  digest: string,
  opts?: {
    sli?: SliSnapshot;
    human_full_approved?: boolean;
    now?: Date;
  },
): { registry: DeliveryRegistry; result: TickRolloutResult } {
  const registry = loadRegistry(projectRoot);
  const cur = registry.rollouts.find((r) => r.digest === digest);
  if (!cur) {
    throw new Error(`no rollout for digest ${digest}`);
  }
  const result = tickRolloutState(cur, opts);
  upsertRollout(registry, result.state);
  saveRegistry(projectRoot, registry);
  return { registry, result };
}

/** ADR-024 (D3): record a revoked signing key (pubkey hex) served via /v1/crl. */
export function addRevocation(
  projectRoot: string,
  input: { public_key_hex: string; reason?: string },
): DeliveryRegistry {
  const registry = loadRegistry(projectRoot);
  const hex = input.public_key_hex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error(`invalid public_key_hex: ${input.public_key_hex}`);
  }
  if (!registry.revocations.some((r) => r.public_key_hex === hex)) {
    registry.revocations.push({
      public_key_hex: hex,
      reason: input.reason,
      revoked_at: new Date().toISOString(),
    });
    saveRegistry(projectRoot, registry);
  }
  return registry;
}

/** ADR-024: revoked signing keys (hex) for /v1/crl + device fail-closed checks. */
export function listRevocations(projectRoot: string): string[] {
  return loadRegistry(projectRoot).revocations.map((r) => r.public_key_hex);
}

/**
 * G3 (ADR-024): build the signed CRL document served at `/v1/crl`.
 *
 * `payload` is the canonical string the seal signs; a device verifies
 * `seal` against its baked public keys (root CA in cert mode) with
 * `verifyRevocationSealAny` before trusting `revoked`. When no signing key is
 * configured `seal` is null — serve callers must fail-closed (device rejects
 * an unsigned CRL), so this is never a silent plaintext trust root.
 */
export function buildCrlDoc(projectRoot: string): {
  schemaVersion: 1;
  revoked: string[];
  payload: string;
  seal: string | null;
} {
  const revoked = [...listRevocations(projectRoot)].sort();
  const payload = `v1|schemaVersion=1|revoked=${JSON.stringify(revoked)}`;
  let seal: string | null = null;
  try {
    seal = signCanonicalPayload(payload).signature;
  } catch {
    seal = null; // no signing key configured — serve must decide fail-closed
  }
  return { schemaVersion: 1, revoked, payload, seal };
}
