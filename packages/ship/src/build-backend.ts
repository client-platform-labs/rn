/**
 * BuildBackend seam (ADR-022 / D6).
 *
 * `ship` orchestrates engine-agnostically (validate → gate → sign → promote →
 * rollout). A BuildBackend produces artifacts for one engine. Today the single
 * backend is React Native (gradlew / xcodebuild / `react-native cli.js bundle`
 * / HBC ingest); a future engine adds another backend, not a fork of ship.
 *
 * The physical RN implementation currently lives in `ship/src/{build,update,
 * ingest-pack}.ts`. Sinking it into `rn-engine` is a follow-up that first
 * extracts the shared utilities (DeliveryError / sha256File / manifest load)
 * into `core` — tracked in T9 (contract).
 */
import { runBuild } from "./build.js";
import { runUpdate } from "./update.js";
import { runIngestPack } from "./ingest-pack.js";
import type { DeliveryProfile } from "./types.js";

export interface BuildOptions {
  cwd: string;
  platform?: "android" | "ios" | "all";
  profile?: DeliveryProfile;
}

export interface BundleOptions {
  cwd: string;
  module: string;
  profile?: DeliveryProfile;
}

export interface IngestOptions {
  cwd: string;
  module: string;
  hbcPath?: string;
  profile?: DeliveryProfile;
}

export interface BuildBackend {
  build(options: BuildOptions): Promise<void>;
  bundle(options: BundleOptions): Promise<void>;
  ingest(options: IngestOptions): Promise<void>;
}

/** The single React Native backend (default). */
export const rnBuildBackend: BuildBackend = {
  build: runBuild,
  bundle: runUpdate,
  ingest: runIngestPack,
};
