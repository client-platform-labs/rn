export const packageName = "@client-platform/rn-core" as const;

export {
  DEFAULT_JS_ARTIFACT_MAX_PROFILES,
  HOST_SUPPORTED_API_VERSIONS,
  MANIFEST_FILENAME,
  MANIFEST_SCHEMA_VERSION,
  RN_GREENFIELD_INIT_VERSION,
  RN_GREENFIELD_MAJOR_MINOR,
} from "./types.js";
export type {
  ArtifactKind,
  ComputedFingerprint,
  ExpoInteropConfig,
  GateJsCandidateResult,
  HostSelectorContext,
  IdentitySpine,
  InteropConfig,
  JsArtifactMatrix,
  JsReleaseGate,
  JsUpdateCandidate,
  LoadManifestResult,
  Logger,
  ManifestValidationResult,
  ModuleSlots,
  NewArchFlags,
  PluginKind,
  PluginRecord,
  PluginRegisterContext,
  ProjectManifest,
  RuntimeFingerprint,
  RuntimeFingerprintRequired,
  SelectFallbackSlotResult,
  SelectorBlockReason,
  SkippedSlot,
  SupportWindowValidationResult,
  TargetOs,
  UpdateSlotKind,
} from "./types.js";

export { discoverPlugins } from "./discover.js";
export type { DiscoverPluginsOptions } from "./discover.js";

export {
  computeFingerprint,
  digestRuntimeFingerprint,
  fingerprintsEqual,
  RUNTIME_FINGERPRINT_REQUIRED_KEYS,
  toCanonicalFingerprintPayload,
  validateSupportWindow,
} from "./fingerprint.js";

export {
  buildRnExactTuple,
  defaultCompatibilityProfileId,
  defaultGreenfieldFingerprint,
  defaultReleaseId,
  isGreenfieldRnTrain,
  RN_EXACT_TUPLE_SUFFIX,
} from "./greenfield.js";

export {
  findManifestRoot,
  loadProjectManifest,
  renderDefaultManifestJsonc,
  validateManifestText,
} from "./manifest.js";
export type { RenderManifestOptions } from "./manifest.js";

export {
  jsSelectorHostSchema,
  jsUpdateCandidateSchema,
  moduleSlotsSchema,
  projectManifestSchema,
  runtimeFingerprintSchema,
} from "./schema.js";

export {
  capabilitiesSatisfied,
  FALLBACK_SLOT_ORDER,
  gateJsCandidate,
  selectFallbackSlot,
} from "./selector.js";
export type { SelectFallbackSlotOptions } from "./selector.js";

export {
  MODULE_SLOTS_DIR,
  loadModuleSlots,
  moduleSlotsPath,
  saveModuleSlots,
} from "./module-slots-store.js";
export type { LoadModuleSlotsResult } from "./module-slots-store.js";

export {
  canRetryDownload,
  createDownloadRetryBudget,
  excludeSlotsByBlockedUpdates,
  excludeSlotsFromHealth,
  mergeExcludeSlots,
  presentFallbackUi,
  recordDownloadAttempt,
  verifyArtifactDigest,
} from "./fallback-runtime.js";
export type {
  DownloadRetryBudget,
  FallbackUiModel,
  HealthFailureKind,
  SlotHealthFailure,
} from "./fallback-runtime.js";

export {
  assertCanPause,
  assertCanResume,
  collectBlockedUpdateIds,
  KillPauseError,
  normalizeKillInput,
} from "./release-kill.js";
export type {
  KillPauseErrorCode,
  KillRecord,
  PauseRecord,
} from "./release-kill.js";

export {
  advanceRolloutState,
  canAdvanceStep,
  defaultJsStandardSteps,
  evaluateSliOk,
  missingSliKeys,
  pauseRolloutState,
  phaseForStep,
  requireHumanForFull,
  resumeRolloutState,
  RolloutError,
  startRolloutState,
  tickRolloutState,
} from "./release-rollout.js";
export type {
  ReleaseRolloutState,
  RolloutErrorCode,
  RolloutPhase,
  RolloutStep,
  SliSnapshot,
  TickRolloutAction,
  TickRolloutResult,
} from "./release-rollout.js";

export {
  CHANNEL_IDS,
  defaultChinaChannelProfiles,
  isJsBlockedForChannel,
  validateChannelProfileSet,
} from "./channel-profile.js";
export type {
  ChannelId,
  ChannelJsBlockReason,
  ChannelProfile,
  ChannelProfileIssue,
  ChannelProfileValidation,
  ChannelSupportTier,
} from "./channel-profile.js";

export { evaluateConsistencyGate } from "./consistency-gate.js";
export type {
  ConsistencyGateInput,
  ConsistencyGateResult,
  ConsistencyPlatform,
  JourneyProbeResult,
} from "./consistency-gate.js";

export { planJsRollback } from "./js-rollback-plan.js";
export type {
  JsRollbackPlan,
  RollbackPlanAction,
} from "./js-rollback-plan.js";

export {
  defaultFinanceComplianceProfile,
  evaluateExceptionLedger,
  validateComplianceProfile,
} from "./compliance-profile.js";
export type {
  ComplianceBindingPlane,
  ComplianceIssue,
  ComplianceProfile,
  ComplianceRule,
  ComplianceValidation,
  ExceptionLedgerEntry,
  ExceptionLedgerEvaluation,
} from "./compliance-profile.js";

export {
  formatReleaseUnitKey,
  parseReleaseUnitKey,
  releaseUnitFromCandidate,
  validateModuleProductIsolation,
  validateReleaseUnit,
} from "./release-unit.js";
export type { ReleaseUnit, ReleaseUnitValidation } from "./release-unit.js";

export {
  buildBareBrownfieldAdvisorStub,
  validateMigrationDryRunReport,
} from "./migration-dry-run.js";
export type {
  MigrationDryRunIssue,
  MigrationDryRunReport,
  MigrationDryRunValidation,
  MigrationSource,
  MigrationTrack,
} from "./migration-dry-run.js";

export { evaluateGovernancePromoteGate } from "./governance-promote-gate.js";
export type {
  GovernancePromoteCandidate,
  GovernancePromoteGateResult,
} from "./governance-promote-gate.js";

export { evaluateSbomPromoteGate } from "./sbom-promote-gate.js";
export type {
  DualSupplyChainRef,
  SbomEvidenceRef,
  SbomFormat,
  SbomPromoteCandidate,
  SbomPromoteGateResult,
} from "./sbom-promote-gate.js";

export {
  defaultRnSloProfile,
  evaluateRnSloBudget,
  evaluateRnSloForRollout,
  missingRnSloKeys,
  rnSloUpperBoundThresholds,
} from "./rn-slo-budget.js";
export type {
  RnSliSnapshot,
  RnSloBudgetResult,
  RnSloMetric,
  RnSloProfile,
} from "./rn-slo-budget.js";

export { validateAttributionRecord } from "./attribution-contract.js";
export type {
  AttributionIssue,
  AttributionIssueCode,
  AttributionRecord,
  AttributionStackKind,
  AttributionValidation,
} from "./attribution-contract.js";

export {
  assertModulesIsolated,
  DEFAULT_MAIN_METRO_PORT,
  DEFAULT_MAIN_MODULE_ID,
  DEV_SESSION_PROTOCOL_MAX,
  DEV_SESSION_PROTOCOL_MIN,
  DEV_SESSION_PROTOCOL_VERSION,
  DEV_SESSION_SCHEMA_VERSION,
  defaultDualModuleDevSession,
  defaultModulePort,
  negotiateDevSessionProtocol,
  resolveDevSessionProtocolVersion,
  resolveEnv,
} from "./env.js";
export type {
  DevSessionConfig,
  DevSessionProtocolNegotiateResult,
  EnvDimensions,
  EnvProfile,
  EnvResolveLayer,
  ModuleDevBinding,
  ResolveEnvInput,
  ResolvedEnv,
} from "./env.js";

export {
  buildContributionsFile,
  createContributionRegistry,
  createDevSessionController,
  DEV_SESSION_PLUGIN_API_VERSION,
} from "./dev-session-plugin.js";
export type {
  DevSessionContributionsFile,
  DevSessionController,
  DevSessionMenuAction,
  DevSessionMenuContribution,
  DevSessionPluginContext,
  DevSessionPluginRegister,
} from "./dev-session-plugin.js";

export {
  assertSharedDevSessionProtocol,
  createBrownfieldReferenceHost,
  createBundlerResolver,
  createGreenfieldReferenceHost,
  createReferenceRuntimeHost,
} from "./runtime-host.js";
export type {
  BundlerBinding,
  BundlerOverrideValue,
  BundlerResolver,
  HostSurfaceKind,
  OpenSurfaceFn,
  RuntimeHost,
  SurfaceHost,
  SurfaceOpenOptions,
} from "./runtime-host.js";

export {
  createModuleDisposeRegistry,
  createSurfaceLifecycleController,
  triageJsFault,
} from "./surface-lifecycle.js";
export type {
  DisposeFn,
  JsFaultKind,
  ModuleDisposeRegistry,
  SurfaceLifecycleController,
  SurfacePhase,
} from "./surface-lifecycle.js";

export { createModuleEventBus } from "./module-event-bus.js";
export type {
  ModuleBusEnvelope,
  ModuleBusHandler,
  ModuleEventBus,
} from "./module-event-bus.js";

export {
  bindDisposeProbe,
  createDisposeProbe,
} from "./dispose-probe.js";
export type { DisposeProbe, DisposeProbeHandle } from "./dispose-probe.js";

export {
  MODULE_BUNDLE_HEADER,
  MODULE_BUNDLE_KIND_HEADER,
  validateBundleArtifact,
} from "./bundle-artifact.js";
export type { ModuleBundleArtifact, ModuleBundleKind } from "./bundle-artifact.js";

export {
  MODULE_ID_MAP_VERSION,
  assertPeeledContract,
  assignModuleIds,
  basePathSetFromMap,
  buildPeelSidecarDraft,
  cloneModuleIdMap,
  createEmptyModuleIdMap,
  createPersistentModuleIdFactory,
  digestModuleIdMap,
  filterModulesAlreadyInBase,
  filterModulesAlreadyInBasePaths,
  mergeModuleIdMap,
  normalizeModulePath,
  peelBusinessModules,
} from "./metro-peel.js";
export type { ModuleIdMap, PeelSidecarDraft } from "./metro-peel.js";

export { gateBundleLoad } from "./bundle-load-gate.js";
export type {
  BundleLoadArtifact,
  BundleLoadGateResult,
  BundleSignatureStatus,
} from "./bundle-load-gate.js";

export {
  evaluatePromoteDependencyGate,
  evaluatePublishDependencyGate,
  evaluateRuntimeCompositionGate,
  versionGte,
} from "./dependency-manifest.js";
export type {
  BundleDependencyEdge,
  BundleDependencyKind,
  DependencyGateCheck,
  DependencyGateResult,
  DependencyRegistryEntry,
  DependencyStrength,
} from "./dependency-manifest.js";

export {
  createQualitySignal,
  formatQualitySignalLine,
} from "./observability.js";
export type {
  QualitySignalAttribution,
  QualitySignalKind,
} from "./observability.js";

export {
  evaluateQualityPromoteGate,
  isPromoteBlockingSignalKind,
  PROMOTE_BLOCKING_SIGNAL_KINDS,
  qualitySignalMatchesCandidate,
} from "./quality-promote-gate.js";
export type {
  PromoteGateCandidate,
  QualityPromoteGateResult,
} from "./quality-promote-gate.js";

export {
  DEFAULT_SHELL_CHANGE_MATRIX,
  resolveShellChangeAction,
  shouldBlockPromotion,
} from "./shell-change-matrix.js";
export type {
  JsRevalidateAction,
  ShellChangeKind,
  ShellChangeRule,
} from "./shell-change-matrix.js";

export {
  findWorkspaceRoot,
  listWorkspacePackageJsonFiles,
} from "./workspace.js";

export {
  evaluateReleaseSourceHygiene,
  releaseSourceHygieneOk,
  scanApkReleaseHygiene,
  RELEASE_DEV_SUPPORT_MARKER,
  RELEASE_DEV_SUPPORT_MODULE_DIR,
  RELEASE_DEV_SUPPORT_STATE_FILE,
} from "./release-hygiene.js";
export type { ReleaseHygieneCheck } from "./release-hygiene.js";

export {
  EXPO_SDK_TO_RN_TRAIN,
  evaluateRuntimeVersionFingerprintNote,
  evaluateSdkRnDrift,
  parseExpoSdkMajor,
  parseRnMajorMinor,
  snapshotExpoPackageJson,
  validateExpoInteropConfig,
} from "./expo-interop.js";
export type {
  ExpoPackageSnapshot,
  RuntimeVersionFingerprintNote,
  SdkRnDriftResult,
} from "./expo-interop.js";

export {
  CATALOG_DOCUMENT_SCHEMA_VERSION,
  catalogModuleInPathTable,
  validateCatalogDocument,
} from "./catalog-types.js";
export type {
  CatalogDocument,
  CatalogIssue,
  CatalogIssueCode,
  CatalogModuleEntry,
  CatalogModuleIdOnlyModule,
  CatalogPathRoutingModule,
  CatalogValidation,
} from "./catalog-types.js";

export { resolveCatalogForHost } from "./catalog-resolve.js";
export type { CatalogResolveResult } from "./catalog-resolve.js";

export {
  buildRoutePrefixTable,
  findByRoutePrefix,
  normalizeRoutePath,
} from "./route-prefix.js";
export type {
  BuildRoutePrefixTableResult,
  RoutePrefixEntry,
  RoutePrefixHit,
} from "./route-prefix.js";

export { createShellRouter } from "./shell-router.js";
export type {
  BundleNavigatorRegistration,
  CreateShellRouterDeps,
  ShellOpenOptions,
  ShellRouter,
  ShellStackEntry,
} from "./shell-router.js";

export type {
  DegradeDecision,
  EnsureBundleReadyResult,
} from "./degrade-types.js";

export {
  decideDegrade,
  presentDegradeUi,
} from "./degrade-matrix.js";
export type {
  DecideDegradeInput,
  DegradeFailure,
  DegradeUiModel,
} from "./degrade-matrix.js";

export { createBundleManager } from "./bundle-manager.js";
export type {
  BundleLifecycleState,
  BundleManager,
  BundleManagerPorts,
  BundleUnitKind,
  PreloadScheduleOptions,
  RegisteredBundle,
} from "./bundle-manager.js";

export { createGlobalStateStore } from "./global-state.js";
export type { GlobalStateAcl, GlobalStateStore } from "./global-state.js";

export {
  isLiveBindable,
  isLiveHeartbeatStale,
} from "./live-types.js";
export type { LivePutBody, LiveRecord } from "./live-types.js";

export {
  buildDevSessionPanelRows,
  resolveDevSessionPanelRow,
} from "./dev-session-panel.js";
export type {
  DevSessionPanelRow,
  DevSessionPanelRowInput,
  DevSessionPanelState,
} from "./dev-session-panel.js";

export {
  BROKER_LIVE_PATH,
  DEFAULT_BROKER_PORT,
  brokerLivePullUrl,
  pullLiveList,
  pushLiveProjectionStub,
  putLiveRecord,
} from "./broker-client.js";
export type {
  LiveListResponse,
  PullLiveResult,
  PushLiveStubResult,
} from "./broker-client.js";
