export const packageName = "@client-platform/ship" as const;
export { run } from "./cli.js";
export type { ShipDeps } from "./cli.js";

export { createRnBuildBackend, rnBuildBackend } from "./build-backend.js";
export type {
  BuildBackend,
  BuildOptions,
  BundleOptions,
  IngestOptions,
} from "./build-backend.js";
export type { BuildCommandRunner, BuildEnv } from "./build.js";

export {
  CANDIDATE_METADATA_SCHEMA_VERSION,
  DELIVERY_STAGES,
} from "./types.js";
export type {
  AttestEvidence,
  CandidateMetadata,
  CandidateValidationResult,
  DeliveryPlatform,
  DeliveryProfile,
  DeliveryStage,
  DualSupplyChainInterfaces,
  GateTrack,
  PromoteCheckResult,
  SbomEvidence,
  SbomFormat,
  StageRunState,
} from "./types.js";

export {
  advanceStage,
  assertProfileAllowsStage,
  canTransition,
  createStageRun,
  defaultGateTracks,
  nextStage,
  stageIndex,
  stagesRequiringSupplyChain,
} from "./stages.js";

export {
  assertSameArtifactPromote,
  attachAttestSlot,
  attachSbomSlot,
  buildCandidateMetadata,
  emptyDualSupplyChain,
  hostArtifactKindForProfile,
  supplyChainTrainForKind,
  validateCandidateMetadata,
} from "./candidate.js";

export {
  createFileRegistryBackend,
  createSqliteRegistryBackend,
  resolveRegistryBackend,
} from "./registry-backend.js";
export type {
  RegistryBackend,
  RegistryBackendCapabilities,
} from "./registry-backend.js";

export {
  candidateMetadataSchema,
  deliveryStagesSchema,
} from "./schema.js";

export {
  assertDependencyAllowsPromote,
  assertDependencyAllowsPublish,
  assertDependencyAllowsRuntimeComposition,
} from "./dependency-gate.js";

export {
  DEPENDENCY_MANIFEST_SCHEMA_VERSION,
  dependencyManifestPath,
  emptyDependencyManifest,
  loadDependencyManifest,
  saveDependencyManifest,
} from "./dependency-store.js";
export type { DependencyManifestStore } from "./dependency-store.js";
