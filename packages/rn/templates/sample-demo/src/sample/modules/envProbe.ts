/**
 * Sample L-C probe — mirrors `.rn/dev-session.jsonc` dual-module overlays.
 * Removable with `rn demo remove` (lives under src/sample/).
 *
 * Cascade: shell profile ← module overlay ← runtime override (C2/C5).
 * True multi-Metro HMR isolation is orchestrated by `rn dev --modules`.
 */

export type SampleModuleId = "main" | "support";

export type SampleEnvDims = {
  apiBaseUrl?: string;
  tenantId?: string;
  environment?: string;
  featureFlags?: Record<string, boolean>;
  [key: string]: unknown;
};

export const SAMPLE_DEV_SESSION = {
  schemaVersion: 1,
  activeEnvProfileId: "local" as string,
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
    main: {
      metroPort: 8081,
      entry: "index",
      envOverlay: { featureFlags: { tickets: true } },
    },
    support: {
      metroPort: 8082,
      entry: "index.support",
      envOverlay: {
        apiBaseUrl: "http://127.0.0.1:3001",
        featureFlags: { tickets: false, supportChat: true },
      },
    },
  },
} as const;

type RuntimeBag = {
  activeEnvProfileId: string;
  overrides: Partial<Record<SampleModuleId, SampleEnvDims>>;
};

type GlobalLc = typeof globalThis & {
  __RN_SAMPLE_LC__?: RuntimeBag;
  __RN_SAMPLE_LC_LISTENERS__?: Set<() => void>;
};

function store(): RuntimeBag {
  const g = globalThis as GlobalLc;
  if (!g.__RN_SAMPLE_LC__) {
    g.__RN_SAMPLE_LC__ = {
      activeEnvProfileId: SAMPLE_DEV_SESSION.activeEnvProfileId,
      overrides: {},
    };
  }
  return g.__RN_SAMPLE_LC__;
}

function listeners(): Set<() => void> {
  const g = globalThis as GlobalLc;
  if (!g.__RN_SAMPLE_LC_LISTENERS__) {
    g.__RN_SAMPLE_LC_LISTENERS__ = new Set();
  }
  return g.__RN_SAMPLE_LC_LISTENERS__;
}

let cachedEnvSnapshot: RuntimeBag | null = null;

function emit(): void {
  cachedEnvSnapshot = null;
  for (const cb of listeners()) {
    cb();
  }
}

export function subscribeSampleEnv(onStoreChange: () => void): () => void {
  listeners().add(onStoreChange);
  return () => {
    listeners().delete(onStoreChange);
  };
}

export function getSampleEnvSnapshot(): RuntimeBag {
  if (cachedEnvSnapshot) {
    return cachedEnvSnapshot;
  }
  const s = store();
  cachedEnvSnapshot = {
    activeEnvProfileId: s.activeEnvProfileId,
    overrides: { ...s.overrides },
  };
  return cachedEnvSnapshot;
}

export function listSampleProfiles(): string[] {
  return Object.keys(SAMPLE_DEV_SESSION.envProfiles);
}

export function getActiveProfileId(): string {
  return store().activeEnvProfileId;
}

export function setActiveProfile(profileId: string): void {
  if (!(profileId in SAMPLE_DEV_SESSION.envProfiles)) {
    throw new Error(`unknown env profile "${profileId}"`);
  }
  store().activeEnvProfileId = profileId;
  emit();
}

export function setModuleOverride(
  moduleId: SampleModuleId,
  overlay: SampleEnvDims,
): void {
  const s = store();
  s.overrides[moduleId] = { ...(s.overrides[moduleId] ?? {}), ...overlay };
  emit();
}

export function resetModuleOverrides(moduleId?: SampleModuleId): void {
  const s = store();
  if (moduleId) {
    delete s.overrides[moduleId];
  } else {
    s.overrides = {};
  }
  emit();
}

function merge(
  base: Record<string, unknown>,
  overlay?: Record<string, unknown>,
): Record<string, unknown> {
  if (!overlay) return { ...base };
  const out = { ...base, ...overlay };
  if (base.featureFlags || overlay.featureFlags) {
    out.featureFlags = {
      ...((base.featureFlags as object) ?? {}),
      ...((overlay.featureFlags as object) ?? {}),
    };
  }
  return out;
}

export function probeModuleEnv(moduleId: SampleModuleId): SampleEnvDims {
  const s = store();
  const profileKey = s.activeEnvProfileId as keyof typeof SAMPLE_DEV_SESSION.envProfiles;
  const profile =
    SAMPLE_DEV_SESSION.envProfiles[profileKey] ??
    SAMPLE_DEV_SESSION.envProfiles.local;
  const { id: _id, ...shell } = profile;
  const binding = SAMPLE_DEV_SESSION.modules[moduleId];
  const withOverlay = merge(
    merge({}, shell as Record<string, unknown>),
    binding.envOverlay as Record<string, unknown>,
  );
  return merge(
    withOverlay,
    s.overrides[moduleId] as Record<string, unknown> | undefined,
  ) as SampleEnvDims;
}
