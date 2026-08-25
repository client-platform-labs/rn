export const packageName = "@client-platform/rn-delivery" as const;
export { run } from "./cli.js";

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
  supplyChainTrainForKind,
  validateCandidateMetadata,
} from "./candidate.js";

export {
  candidateMetadataSchema,
  deliveryStagesSchema,
} from "./schema.js";
