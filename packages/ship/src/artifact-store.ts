/**
 * ADR-020 — artifact store seam (single-node local directory adapter).
 * Artifacts are keyed by digest under `.rn/delivery/artifacts/<digest>`
 * (backed by the deployment data volume). A future OSS/S3 adapter implements
 * the same `ArtifactStore` interface; callers only ever see put/get/exists/list.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

import type { CandidateMetadata } from "./types.js";

export const ARTIFACTS_DIR = ".rn/delivery/artifacts";

export interface ArtifactStore {
  /** Persist artifact bytes by digest; returns the canonical local path. */
  put(digest: string, srcPath: string): string;
  /** Resolve the stored path by digest, or null when absent. */
  get(digest: string): string | null;
  exists(digest: string): boolean;
  list(): string[];
}

export function artifactsDir(projectRoot: string): string {
  return path.join(projectRoot, ARTIFACTS_DIR);
}

export function createLocalDirectoryArtifactStore(
  projectRoot: string,
): ArtifactStore {
  const resolve = (digest: string) =>
    path.join(artifactsDir(projectRoot), digest);
  return {
    put(digest, srcPath) {
      const dest = resolve(digest);
      if (path.resolve(srcPath) !== path.resolve(dest)) {
        mkdirSync(path.dirname(dest), { recursive: true });
        copyFileSync(srcPath, dest);
      }
      return dest;
    },
    get(digest) {
      const dest = resolve(digest);
      return existsSync(dest) ? dest : null;
    },
    exists(digest) {
      return existsSync(resolve(digest));
    },
    list() {
      const dir = artifactsDir(projectRoot);
      return existsSync(dir) ? readdirSync(dir) : [];
    },
  };
}

/**
 * Best-effort archive of a produced candidate into the artifact store dir.
 * Missing / pending artifacts are skipped; a failed copy must not break release.
 */
export function archiveArtifactIfPresent(
  projectRoot: string,
  meta: CandidateMetadata,
): void {
  const src = meta.path?.trim();
  const digest = meta.digest?.trim();
  if (!src || !digest || digest.startsWith("pending") || !existsSync(src)) {
    return;
  }
  try {
    createLocalDirectoryArtifactStore(projectRoot).put(digest, src);
  } catch {
    /* archive is best-effort */
  }
}