/**
 * Formal `dev-session` plugin ABI (map-a/#17 / ADR-006).
 * Host discovers `kind: "dev-session"` plugins; they contribute Dev Menu items
 * and share the same env controller used by GF + BF.
 */
import {
  DEV_SESSION_PROTOCOL_VERSION,
  resolveEnv,
  type DevSessionConfig,
  type EnvDimensions,
  type ResolvedEnv,
} from "./env.js";

/** Plugin register() contract version (independent of wire protocol). */
export const DEV_SESSION_PLUGIN_API_VERSION = 1;

export type DevSessionMenuAction =
  | "show-effective"
  | "set-override"
  | "reset-overrides"
  | "custom";

/** Serializable menu contribution — safe to ship into debug-only JS surfaces. */
export interface DevSessionMenuContribution {
  id: string;
  pluginId: string;
  label: string;
  /** When set, action is scoped to this business_module. */
  moduleId?: string;
  action: DevSessionMenuAction;
  payload?: Readonly<Record<string, unknown>>;
}

export interface DevSessionPluginContext {
  protocolVersion: number;
  pluginApiVersion: number;
  contributeMenuItem: (
    item: Omit<DevSessionMenuContribution, "pluginId"> & { pluginId?: string },
  ) => void;
}

export type DevSessionPluginRegister = (ctx: DevSessionPluginContext) => void;

export interface DevSessionContributionsFile {
  schemaVersion: 1;
  protocolVersion: number;
  pluginApiVersion: number;
  menuItems: DevSessionMenuContribution[];
}

export function createContributionRegistry(pluginId: string): {
  ctx: DevSessionPluginContext;
  menuItems: DevSessionMenuContribution[];
} {
  const menuItems: DevSessionMenuContribution[] = [];
  const ctx: DevSessionPluginContext = {
    protocolVersion: DEV_SESSION_PROTOCOL_VERSION,
    pluginApiVersion: DEV_SESSION_PLUGIN_API_VERSION,
    contributeMenuItem: (item) => {
      if (!item.id || !item.label || !item.action) {
        throw new Error(`dev-session plugin ${pluginId}: menu item needs id/label/action`);
      }
      menuItems.push({
        ...item,
        pluginId: item.pluginId ?? pluginId,
      });
    },
  };
  return { ctx, menuItems };
}

/**
 * In-memory Dev Session controller — shared GF/BF contract surface.
 * C5 UI may call these later; ABI must not be a dead stub.
 */
export function createDevSessionController(config: DevSessionConfig) {
  const runtimeOverrides = new Map<string, EnvDimensions>();

  return {
    getConfig(): DevSessionConfig {
      return config;
    },

    listModules(): string[] {
      return Object.keys(config.modules);
    },

    getEffective(businessModule: string): ResolvedEnv {
      return resolveEnv({
        config,
        businessModule,
        runtimeOverride: runtimeOverrides.get(businessModule),
      });
    },

    setRuntimeOverride(businessModule: string, overlay: EnvDimensions): void {
      if (!config.modules[businessModule]) {
        throw new Error(`unknown business_module "${businessModule}"`);
      }
      const prev = runtimeOverrides.get(businessModule) ?? {};
      runtimeOverrides.set(businessModule, { ...prev, ...overlay });
    },

    resetOverrides(businessModule?: string): void {
      if (businessModule) {
        runtimeOverrides.delete(businessModule);
        return;
      }
      runtimeOverrides.clear();
    },

    /** Snapshot for debug surfaces / contributions file consumers. */
    snapshotOverrides(): Readonly<Record<string, EnvDimensions>> {
      const out: Record<string, EnvDimensions> = {};
      for (const [k, v] of runtimeOverrides) {
        out[k] = v;
      }
      return out;
    },
  };
}

export type DevSessionController = ReturnType<typeof createDevSessionController>;

export function buildContributionsFile(
  menuItems: DevSessionMenuContribution[],
): DevSessionContributionsFile {
  return {
    schemaVersion: 1,
    protocolVersion: DEV_SESSION_PROTOCOL_VERSION,
    pluginApiVersion: DEV_SESSION_PLUGIN_API_VERSION,
    menuItems: [...menuItems],
  };
}
