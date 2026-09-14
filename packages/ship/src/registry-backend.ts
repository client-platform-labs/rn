/**
 * RegistryBackend — the delivery registry storage seam (map-j/T3, #292).
 *
 * file + sqlite are the two production adapters (ADR-013). An enterprise that
 * must use its own database implements this interface behind the same
 * `DeliveryRegistry` contract (Postgres seed: `registry-postgres.ts`, ADR-013
 * G9 — not wired into production selection until a real enterprise DB needs
 * it, per the no-abstract-before-second-real-adapter rule).
 *
 * A backend **declares capabilities** (pi-ai style) so a configuration that
 * demands more than the backend guarantees can fail closed rather than corrupt
 * silently. The dispatch — "which backend is active" — lives in exactly one
 * place: {@link resolveRegistryBackend}.
 */
import {
  loadFileRegistry,
  loadSqliteRegistry,
  saveFileRegistry,
  saveSqliteRegistry,
  type DeliveryRegistry,
} from "./candidate-store.js";
import { useSqliteRegistry } from "./registry-sqlite.js";

/** What a registry backend guarantees (declared, not assumed). */
export interface RegistryBackendCapabilities {
  /** save is atomic / transactional — a crash mid-write never truncates. */
  transactional: boolean;
  /** safe under multiple CP instances sharing the same registry. */
  multiInstanceSafe: boolean;
  /** a consistent snapshot can be taken for backup. */
  consistentSnapshot: boolean;
}

/** The storage seam enterprises implement to use their own database. */
export interface RegistryBackend {
  readonly id: "file" | "sqlite" | (string & {});
  readonly capabilities: RegistryBackendCapabilities;
  /** The backing file this backend persists (for ops / backup / readiness). */
  registryFile(): string;
  load(): DeliveryRegistry;
  save(registry: DeliveryRegistry): void;
}

export const FILE_REGISTRY_CAPABILITIES: RegistryBackendCapabilities = {
  transactional: true, // writeFileAtomicSync
  multiInstanceSafe: false, // last-write-wins, no lock
  consistentSnapshot: true, // atomic file copy is a consistent snapshot
};

export const SQLITE_REGISTRY_CAPABILITIES: RegistryBackendCapabilities = {
  transactional: true, // WAL + BEGIN/COMMIT
  multiInstanceSafe: true, // SQLite WAL: concurrent readers, single writer
  consistentSnapshot: true, // VACUUM INTO
};

export function createFileRegistryBackend(projectRoot: string): RegistryBackend {
  return {
    id: "file",
    capabilities: { ...FILE_REGISTRY_CAPABILITIES },
    registryFile: () => `${projectRoot}/.rn/delivery/registry.json`,
    load: () => loadFileRegistry(projectRoot),
    save: (registry) => saveFileRegistry(projectRoot, registry),
  };
}

export function createSqliteRegistryBackend(
  projectRoot: string,
): RegistryBackend {
  return {
    id: "sqlite",
    capabilities: { ...SQLITE_REGISTRY_CAPABILITIES },
    registryFile: () => `${projectRoot}/.rn/delivery/registry.sqlite`,
    load: () => loadSqliteRegistry(projectRoot),
    save: (registry) => saveSqliteRegistry(projectRoot, registry),
  };
}

/**
 * The single dispatch: "which backend is active" is answered here, replacing the
 * scattered `if (useSqliteRegistry())` forks (candidate-store / serve / ready).
 */
export function resolveRegistryBackend(projectRoot: string): RegistryBackend {
  return useSqliteRegistry()
    ? createSqliteRegistryBackend(projectRoot)
    : createFileRegistryBackend(projectRoot);
}
