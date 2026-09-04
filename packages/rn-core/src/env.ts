/**
 * L-C env resolution (ticket #17 / ADR-005): shell profile + per-module overlay.
 * Cascade: platformDefault ← shellProfile ← moduleOverlay ← runtimeOverride
 */

export const DEV_SESSION_SCHEMA_VERSION = 1;
/**
 * Wire protocol between CLI / GF Debug Host / BF embedded DevSessionController.
 * Independent of `schemaVersion` (file shape) so GF↔BF can negotiate without
 * forcing every config-field bump to break hosts.
 */
export const DEV_SESSION_PROTOCOL_VERSION = 1;
export const DEV_SESSION_PROTOCOL_MIN = 1;
export const DEV_SESSION_PROTOCOL_MAX = 1;
export const DEFAULT_MAIN_MODULE_ID = "main";
export const DEFAULT_MAIN_METRO_PORT = 8081;
/** Shell / Host Metro preferred start (#157 / #158). Business modules use 8081+. */
export const DEFAULT_SHELL_METRO_PORT = 8090;
/** Broker Live id for Host shell Metro (not a business_module). */
export const HOST_SHELL_LIVE_MODULE_ID = "__host_shell__";

/** Contract dimensions (C3) — industrial L-C surface. */
export interface EnvDimensions {
  apiBaseUrl?: string;
  tenantId?: string;
  /** e.g. dev | staging | prod */
  environment?: string;
  channelLabel?: string;
  featureFlags?: Readonly<Record<string, boolean>>;
  mockEnabled?: boolean;
  timeoutMs?: number;
  retryCount?: number;
  logLevel?: "debug" | "info" | "warn" | "error";
  sampleRate?: number;
  /** Extension bag — still module-isolated. */
  custom?: Readonly<Record<string, unknown>>;
}

export interface EnvProfile extends EnvDimensions {
  id: string;
}

export interface ModuleDevBinding {
  metroPort: number;
  entry?: string;
  envOverlay?: EnvDimensions;
}

export interface DevSessionConfig {
  schemaVersion: number;
  /** Shared GF/BF Dev Session wire version (ADR-006). */
  devSessionProtocolVersion?: number;
  transport?: "auto" | "usb" | "wifi" | "lan";
  /** Shell-level default env profile id → profiles map. */
  activeEnvProfileId?: string;
  envProfiles?: Readonly<Record<string, EnvProfile>>;
  /** Preferred shell Metro port (auto-bumped when occupied). Override via `rn dev --port`. */
  shellMetroPort?: number;
  modules: Readonly<Record<string, ModuleDevBinding>>;
  /**
   * Last CP intake digest applied to this dev-session. Set by
   * `rn module register --file <intake>` (#172); lets phones prove freshness
   * and host-ops skip re-publishing identical intakes.
   */
  lastIntakeDigest?: string;
}

export type DevSessionProtocolNegotiateResult =
  | { ok: true; version: number }
  | {
      ok: false;
      reason: string;
      peer: number;
      supportedMin: number;
      supportedMax: number;
    };

/**
 * Negotiate `devSessionProtocolVersion` between this binary and a peer
 * (project config, BF host, or Debug Host). Fail-fast outside supported range.
 */
export function negotiateDevSessionProtocol(options: {
  /** Peer's advertised protocol version (from config or handshake). */
  peer: number;
  supportedMin?: number;
  supportedMax?: number;
}): DevSessionProtocolNegotiateResult {
  const supportedMin = options.supportedMin ?? DEV_SESSION_PROTOCOL_MIN;
  const supportedMax = options.supportedMax ?? DEV_SESSION_PROTOCOL_MAX;
  const peer = options.peer;
  if (!Number.isInteger(peer) || peer < 1) {
    return {
      ok: false,
      reason: `invalid peer protocol version ${String(peer)}`,
      peer,
      supportedMin,
      supportedMax,
    };
  }
  if (peer < supportedMin || peer > supportedMax) {
    return {
      ok: false,
      reason: `devSessionProtocolVersion ${peer} unsupported (this binary supports ${supportedMin}–${supportedMax})`,
      peer,
      supportedMin,
      supportedMax,
    };
  }
  return { ok: true, version: peer };
}

/** Resolve protocol version from config; default to current when omitted (legacy files). */
export function resolveDevSessionProtocolVersion(
  config: Pick<DevSessionConfig, "devSessionProtocolVersion" | "schemaVersion">,
): number {
  return config.devSessionProtocolVersion ?? DEV_SESSION_PROTOCOL_VERSION;
}

export type EnvResolveLayer =
  | "platformDefault"
  | "shellProfile"
  | "moduleOverlay"
  | "runtimeOverride";

export interface ResolveEnvInput {
  config: DevSessionConfig;
  businessModule: string;
  platformDefault?: EnvDimensions;
  /** Dev Menu / CLI one-shot overrides (C5/C6). */
  runtimeOverride?: EnvDimensions;
}

export interface ResolvedEnv {
  businessModule: string;
  effective: EnvDimensions;
  /** Which layer last set each top-level key (observability C8). */
  provenance: Readonly<Record<string, EnvResolveLayer>>;
}

const PLATFORM_DEFAULT: EnvDimensions = {
  apiBaseUrl: "http://localhost:3000",
  environment: "dev",
  mockEnabled: false,
  timeoutMs: 15_000,
  retryCount: 2,
  logLevel: "info",
  sampleRate: 1,
  featureFlags: {},
  custom: {},
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function mergeDims(
  base: EnvDimensions,
  overlay: EnvDimensions | undefined,
  layer: EnvResolveLayer,
  provenance: Record<string, EnvResolveLayer>,
): EnvDimensions {
  if (!overlay) {
    return { ...base };
  }
  const out: EnvDimensions = { ...base };
  const assign = <K extends keyof EnvDimensions>(key: K, value: EnvDimensions[K]) => {
    if (value !== undefined) {
      out[key] = value as never;
      provenance[key] = layer;
    }
  };

  assign("apiBaseUrl", overlay.apiBaseUrl);
  assign("tenantId", overlay.tenantId);
  assign("environment", overlay.environment);
  assign("channelLabel", overlay.channelLabel);
  assign("mockEnabled", overlay.mockEnabled);
  assign("timeoutMs", overlay.timeoutMs);
  assign("retryCount", overlay.retryCount);
  assign("logLevel", overlay.logLevel);
  assign("sampleRate", overlay.sampleRate);

  if (overlay.featureFlags) {
    out.featureFlags = { ...(base.featureFlags ?? {}), ...overlay.featureFlags };
    provenance.featureFlags = layer;
  }
  if (overlay.custom) {
    out.custom = { ...(base.custom ?? {}), ...overlay.custom };
    provenance.custom = layer;
  }
  return out;
}

/**
 * Resolve effective env for one business_module (C2/C4).
 * Module overlays never leak across modules — caller must invoke per module.
 */
export function resolveEnv(input: ResolveEnvInput): ResolvedEnv {
  const provenance: Record<string, EnvResolveLayer> = {};
  let effective = mergeDims(
    {},
    input.platformDefault ?? PLATFORM_DEFAULT,
    "platformDefault",
    provenance,
  );

  const profileId = input.config.activeEnvProfileId;
  const profile =
    profileId && input.config.envProfiles
      ? input.config.envProfiles[profileId]
      : undefined;
  if (profile) {
    const { id: _id, ...dims } = profile;
    effective = mergeDims(effective, dims, "shellProfile", provenance);
  }

  const moduleBinding = input.config.modules[input.businessModule];
  if (!moduleBinding) {
    throw new Error(
      `unknown business_module "${input.businessModule}" — not in dev-session modules table`,
    );
  }
  effective = mergeDims(
    effective,
    moduleBinding.envOverlay,
    "moduleOverlay",
    provenance,
  );
  effective = mergeDims(
    effective,
    input.runtimeOverride,
    "runtimeOverride",
    provenance,
  );

  return {
    businessModule: input.businessModule,
    effective,
    provenance,
  };
}

export function defaultModulePort(moduleId: string, index: number): number {
  if (moduleId === DEFAULT_MAIN_MODULE_ID || index === 0) {
    return DEFAULT_MAIN_METRO_PORT;
  }
  return DEFAULT_MAIN_METRO_PORT + index;
}

/** Parse Metro usbUrl / lanUrl → TCP port (http default 80 when omitted). */
export function extractPortFromMetroUrl(url: string): number | null {
  try {
    const u = new URL(url.trim());
    if (u.port) {
      const p = Number.parseInt(u.port, 10);
      return Number.isFinite(p) ? p : null;
    }
    if (u.protocol === "https:") return 443;
    if (u.protocol === "http:") return 80;
    return null;
  } catch {
    return null;
  }
}

/**
 * Shell Metro preferred port before occupancy scan.
 * Custom `--port` wins; then dev-session `shellMetroPort`; else max(module)+8 floor 8090.
 */
export function resolveShellMetroPreferredPort(
  config?: Pick<DevSessionConfig, "shellMetroPort" | "modules"> | null,
  explicitPort?: number,
): number {
  if (explicitPort != null && Number.isFinite(explicitPort) && explicitPort > 0) {
    return explicitPort;
  }
  if (config?.shellMetroPort != null && config.shellMetroPort > 0) {
    return config.shellMetroPort;
  }
  const modulePorts = config?.modules
    ? Object.values(config.modules).map((m) => m.metroPort)
    : [];
  const maxModule =
    modulePorts.length > 0 ? Math.max(...modulePorts) : DEFAULT_MAIN_METRO_PORT;
  return Math.max(DEFAULT_SHELL_METRO_PORT, maxModule + 8);
}

/** Build a starter dual-module session config (sample-demo / docs). */
export function defaultDualModuleDevSession(options?: {
  secondModuleId?: string;
}): DevSessionConfig {
  const second = options?.secondModuleId ?? "support";
  return {
    schemaVersion: DEV_SESSION_SCHEMA_VERSION,
    devSessionProtocolVersion: DEV_SESSION_PROTOCOL_VERSION,
    transport: "auto",
    activeEnvProfileId: "local",
    envProfiles: {
      local: {
        id: "local",
        apiBaseUrl: "http://192.168.2.2:3000",
        environment: "dev",
        tenantId: "local-tenant",
      },
      staging: {
        id: "staging",
        apiBaseUrl: "https://staging.example.com",
        environment: "staging",
        tenantId: "staging-tenant",
      },
    },
    modules: {
      [DEFAULT_MAIN_MODULE_ID]: {
        metroPort: DEFAULT_MAIN_METRO_PORT,
        entry: "index",
        envOverlay: {
          featureFlags: { tickets: true },
        },
      },
      [second]: {
        metroPort: DEFAULT_MAIN_METRO_PORT + 1,
        entry: "index.support",
        envOverlay: {
          apiBaseUrl: "http://127.0.0.1:3001",
          featureFlags: { tickets: false, supportChat: true },
        },
      },
    },
  };
}

export function assertModulesIsolated(
  config: DevSessionConfig,
  moduleA: string,
  moduleB: string,
): { ok: true } | { ok: false; detail: string } {
  const oa = config.modules[moduleA]?.envOverlay?.apiBaseUrl;
  const ob = config.modules[moduleB]?.envOverlay?.apiBaseUrl;
  if (!oa || !ob || oa === ob) {
    return { ok: true };
  }
  const a = resolveEnv({ config, businessModule: moduleA });
  const b = resolveEnv({ config, businessModule: moduleB });
  if (a.effective.apiBaseUrl !== oa || b.effective.apiBaseUrl !== ob) {
    return {
      ok: false,
      detail: `expected ${oa} vs ${ob}, got ${a.effective.apiBaseUrl} vs ${b.effective.apiBaseUrl}`,
    };
  }
  return { ok: true };
}

export function isEnvDimensions(v: unknown): v is EnvDimensions {
  return v === undefined || isPlainObject(v);
}
