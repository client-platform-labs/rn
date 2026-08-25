/**
 * Sample L-C probe — mirrors `.rn/dev-session.jsonc` dual-module overlays.
 * Removable with `rn demo remove` (lives under src/sample/).
 *
 * True multi-Metro HMR isolation is orchestrated by `rn dev --modules`;
 * this screen proves env cascade + isolation in-process for the sample shell.
 */
export const SAMPLE_DEV_SESSION = {
  schemaVersion: 1,
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

export function probeModuleEnv(moduleId: "main" | "support") {
  const profile =
    SAMPLE_DEV_SESSION.envProfiles[
      SAMPLE_DEV_SESSION.activeEnvProfileId as "local"
    ];
  const { id: _id, ...shell } = profile;
  const binding = SAMPLE_DEV_SESSION.modules[moduleId];
  return merge(merge({}, shell as Record<string, unknown>), binding.envOverlay as Record<string, unknown>);
}
