import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import type { CandidateMetadata } from "./types.js";
import {
  loadRegistrySqlite,
  saveRegistrySqlite,
  useSqliteRegistry,
} from "./registry-sqlite.js";

export const DELIVERY_STATE_DIR = ".rn/delivery";
export const LAST_BUILD_FILE = "last-build.json";
export const LAST_CANDIDATE_FILE = "last-candidate.json";
export const REGISTRY_FILE = "registry.json";

export type DeliveryRegistry = {
  schemaVersion: 1;
  /** Staging lane — promote-same-artifact source of truth (file CP stub). */
  staging: CandidateMetadata[];
  production: CandidateMetadata[];
  blocked: Array<{
    release_id: string;
    digest: string;
    platform: string;
    reason: string;
    blocked_at: string;
    update_id?: string;
    business_module?: string;
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
  writeFileSync(
    path.join(deliveryDir(projectRoot), LAST_BUILD_FILE),
    `${JSON.stringify(record, null, 2)}\n`,
  );
  const primary =
    candidates.find((c) => c.platform === "android") ?? candidates[0];
  if (primary) {
    writeFileSync(
      path.join(deliveryDir(projectRoot), LAST_CANDIDATE_FILE),
      `${JSON.stringify(primary, null, 2)}\n`,
    );
  }
  return record;
}

export function readLastBuild(projectRoot: string): LastBuildRecord | null {
  const file = path.join(deliveryDir(projectRoot), LAST_BUILD_FILE);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as LastBuildRecord;
}

export function readLastCandidate(
  projectRoot: string,
): CandidateMetadata | null {
  const file = path.join(deliveryDir(projectRoot), LAST_CANDIDATE_FILE);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as CandidateMetadata;
}

export function emptyRegistry(): DeliveryRegistry {
  return { schemaVersion: 1, staging: [], production: [], blocked: [] };
}

export function loadRegistry(projectRoot: string): DeliveryRegistry {
  if (useSqliteRegistry()) {
    return loadRegistrySqlite(projectRoot);
  }
  const file = path.join(deliveryDir(projectRoot), REGISTRY_FILE);
  if (!existsSync(file)) return emptyRegistry();
  return JSON.parse(readFileSync(file, "utf8")) as DeliveryRegistry;
}

const INSTALLABLE_KINDS = new Set(["app-host", "app-host-debug"]);

/** #15 / Map B — installable Android app-host candidates from registry lanes. */
export function listInstallableCandidates(
  registry: DeliveryRegistry,
  lane: "staging" | "production" | "all" = "all",
): CandidateMetadata[] {
  const lanes: CandidateMetadata[] =
    lane === "staging"
      ? registry.staging
      : lane === "production"
        ? registry.production
        : [...registry.staging, ...registry.production];
  return lanes.filter(
    (c) =>
      c.platform === "android" &&
      INSTALLABLE_KINDS.has(c.artifact_kind) &&
      Boolean(c.path?.trim()),
  );
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
  writeFileSync(
    path.join(deliveryDir(projectRoot), REGISTRY_FILE),
    `${JSON.stringify(registry, null, 2)}\n`,
  );
}

export function promoteCandidateToStaging(
  projectRoot: string,
  candidate: CandidateMetadata,
): DeliveryRegistry {
  const registry = loadRegistry(projectRoot);
  const promoted: CandidateMetadata = { ...candidate, stage: "promote" };
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
  registry.staging = registry.staging.filter((c) => c.digest !== candidate.digest);
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
  writeFileSync(
    path.join(deliveryDir(projectRoot), LAST_CANDIDATE_FILE),
    `${JSON.stringify(candidate, null, 2)}\n`,
  );
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
  const production: CandidateMetadata = { ...staging, stage: "promote" };
  registry.staging = registry.staging.filter((c) => c.digest !== digest);
  registry.production = [
    ...registry.production.filter((c) => c.digest !== digest),
    production,
  ];
  saveRegistry(projectRoot, registry);
  return { registry, production };
}
