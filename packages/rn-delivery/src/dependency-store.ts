/**
 * Map E — dependency manifest store (`.rn/delivery/dependency-manifest.json`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { BundleDependencyEdge } from "@client-platform/rn-core";

import { ensureDeliveryDir } from "./candidate-store.js";

export const DEPENDENCY_MANIFEST_SCHEMA_VERSION = 1 as const;

export type DependencyManifestStore = {
  schemaVersion: typeof DEPENDENCY_MANIFEST_SCHEMA_VERSION;
  dependencies: BundleDependencyEdge[];
  /** update_id → semver label for peer range checks */
  version_labels: Record<string, string>;
  /**
   * Host capability_set used when sidecar lacks capabilities (promote gate).
   * Empty → rely on sidecar / permissive [] for host-only promotes.
   */
  host_capability_set?: string[];
  /** If true, js-update promote with zero edges still records a soft check (default false). */
  require_declared?: boolean;
};

export function dependencyManifestPath(projectRoot: string): string {
  return path.join(
    ensureDeliveryDir(projectRoot),
    "dependency-manifest.json",
  );
}

export function emptyDependencyManifest(): DependencyManifestStore {
  return {
    schemaVersion: DEPENDENCY_MANIFEST_SCHEMA_VERSION,
    dependencies: [],
    version_labels: {},
  };
}

export function loadDependencyManifest(
  projectRoot: string,
): DependencyManifestStore {
  const file = dependencyManifestPath(projectRoot);
  if (!existsSync(file)) {
    return emptyDependencyManifest();
  }
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<DependencyManifestStore>;
    return {
      schemaVersion: DEPENDENCY_MANIFEST_SCHEMA_VERSION,
      dependencies: Array.isArray(raw.dependencies) ? raw.dependencies : [],
      version_labels:
        raw.version_labels && typeof raw.version_labels === "object"
          ? raw.version_labels
          : {},
      host_capability_set: raw.host_capability_set,
      require_declared: raw.require_declared === true,
    };
  } catch {
    return emptyDependencyManifest();
  }
}

export function saveDependencyManifest(
  projectRoot: string,
  store: DependencyManifestStore,
): string {
  const dir = ensureDeliveryDir(projectRoot);
  mkdirSync(dir, { recursive: true });
  const file = dependencyManifestPath(projectRoot);
  const payload: DependencyManifestStore = {
    schemaVersion: DEPENDENCY_MANIFEST_SCHEMA_VERSION,
    dependencies: store.dependencies,
    version_labels: store.version_labels ?? {},
    host_capability_set: store.host_capability_set,
    require_declared: store.require_declared,
  };
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return file;
}
