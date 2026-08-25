/**
 * npm policy for Community CLI / npx children.
 *
 * Precedence (highest first):
 *   CLI flags → CLIENT_PLATFORM_NPM_* env → ~/.client-platform/rn/config.json → defaults
 *
 * Default aligns with mainstream scaffold CLIs: inherit ~/.npmrc / npm_config_*.
 * Opt into isolated for CI / clean public-registry fetches.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defaultInstallHome } from "./install-home.js";

export type NpmPolicyKind = "isolated" | "inherit";

export type PolicySource = "flag" | "env" | "host-config" | "default";
export type RegistrySource = "flag" | "env" | "host-config" | "default" | "none";

export interface HostRnConfig {
  npm?: {
    policy?: string;
    registry?: string;
  };
}

export interface ResolvedNpmPolicy {
  policy: NpmPolicyKind;
  policySource: PolicySource;
  /** Registry forced into the child when set (isolated always has one). */
  registry: string | undefined;
  registrySource: RegistrySource;
  hostConfigPath: string;
  hostConfigLoaded: boolean;
}

export const DEFAULT_PUBLIC_NPM_REGISTRY = "https://registry.npmjs.org/";
export const DEFAULT_NPM_POLICY: NpmPolicyKind = "inherit";

export function hostRnConfigPath(home = defaultInstallHome()): string {
  return path.join(home, "config.json");
}

export function parseNpmPolicyKind(raw: string | undefined): NpmPolicyKind | undefined {
  if (!raw) {
    return undefined;
  }
  const v = raw.trim().toLowerCase();
  if (v === "isolated" || v === "inherit") {
    return v;
  }
  return undefined;
}

export function loadHostRnConfig(configPath: string): HostRnConfig | undefined {
  if (!existsSync(configPath)) {
    return undefined;
  }
  try {
    const text = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as HostRnConfig;
  } catch {
    return undefined;
  }
}

export function resolveNpmPolicy(input: {
  flagPolicy?: string;
  /** Shorthand for --npm-policy isolated */
  isolatedNpmrc?: boolean;
  flagRegistry?: string;
  env?: NodeJS.ProcessEnv;
  hostConfigPath?: string;
}): ResolvedNpmPolicy {
  const env = input.env ?? process.env;
  const hostConfigPath = input.hostConfigPath ?? hostRnConfigPath();
  const host = loadHostRnConfig(hostConfigPath);
  const hostConfigLoaded = Boolean(host);

  let policy: NpmPolicyKind = DEFAULT_NPM_POLICY;
  let policySource: PolicySource = "default";

  if (input.isolatedNpmrc) {
    policy = "isolated";
    policySource = "flag";
  } else {
    const fromFlag = parseNpmPolicyKind(input.flagPolicy);
    if (fromFlag) {
      policy = fromFlag;
      policySource = "flag";
    } else {
      const fromEnv = parseNpmPolicyKind(env.CLIENT_PLATFORM_NPM_POLICY);
      if (fromEnv) {
        policy = fromEnv;
        policySource = "env";
      } else {
        const fromHost = parseNpmPolicyKind(host?.npm?.policy);
        if (fromHost) {
          policy = fromHost;
          policySource = "host-config";
        }
      }
    }
  }

  const flagRegistry = input.flagRegistry?.trim();
  const envRegistry = env.CLIENT_PLATFORM_NPM_REGISTRY?.trim();
  const hostRegistry = host?.npm?.registry?.trim();

  let registry: string | undefined;
  let registrySource: RegistrySource = "none";

  if (flagRegistry) {
    registry = flagRegistry;
    registrySource = "flag";
  } else if (envRegistry) {
    registry = envRegistry;
    registrySource = "env";
  } else if (hostRegistry) {
    registry = hostRegistry;
    registrySource = "host-config";
  } else if (policy === "isolated") {
    registry = DEFAULT_PUBLIC_NPM_REGISTRY;
    registrySource = "default";
  }

  return {
    policy,
    policySource,
    registry,
    registrySource,
    hostConfigPath,
    hostConfigLoaded,
  };
}

/** Count npm_config_* keys present in the shell (diagnostics). */
export function countNpmConfigKeys(env: NodeJS.ProcessEnv = process.env): number {
  let n = 0;
  for (const key of Object.keys(env)) {
    if (/^npm_config_/i.test(key)) {
      n += 1;
    }
  }
  return n;
}

/**
 * Build child env for npx/npm under the resolved policy.
 * - inherit: merge process.env; optional registry override only (mainstream default)
 * - isolated: replace env; ignore ~/.npmrc; temp userconfig + registry
 */
export function buildNpmChildEnv(
  resolved: ResolvedNpmPolicy,
  overrides: NodeJS.ProcessEnv = {},
  baseEnv: NodeJS.ProcessEnv = process.env,
): { env: NodeJS.ProcessEnv; replaceEnv: boolean } {
  if (resolved.policy === "inherit") {
    const env: NodeJS.ProcessEnv = { ...baseEnv, ...overrides };
    env.npm_config_yes = "true";
    env.NPM_CONFIG_YES = "true";
    if (resolved.registry) {
      env.npm_config_registry = resolved.registry;
      env.NPM_CONFIG_REGISTRY = resolved.registry;
    }
    return { env, replaceEnv: false };
  }

  return {
    env: envForIsolatedNpm(overrides, {
      registry: resolved.registry ?? DEFAULT_PUBLIC_NPM_REGISTRY,
      baseEnv,
    }),
    replaceEnv: true,
  };
}

export function envForIsolatedNpm(
  overrides: NodeJS.ProcessEnv = {},
  options: {
    registry?: string;
    baseEnv?: NodeJS.ProcessEnv;
  } = {},
): NodeJS.ProcessEnv {
  const baseEnv = options.baseEnv ?? process.env;
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (value === undefined) {
      continue;
    }
    if (/^npm_config_/i.test(key)) {
      continue;
    }
    if (key === "NPM_CONFIG_USERCONFIG" || key === "npm_config_userconfig") {
      continue;
    }
    env[key] = value;
  }

  const dir = mkdtempSync(path.join(tmpdir(), "rn-npmrc-"));
  const userconfig = path.join(dir, ".npmrc");
  const registry = options.registry ?? DEFAULT_PUBLIC_NPM_REGISTRY;
  writeFileSync(
    userconfig,
    [
      `; generated by @client-platform/rn — isolated npm policy`,
      `registry=${registry}`,
      `yes=true`,
      "",
    ].join("\n"),
    "utf8",
  );

  env.NPM_CONFIG_USERCONFIG = userconfig;
  env.npm_config_userconfig = userconfig;
  env.npm_config_yes = "true";
  env.NPM_CONFIG_YES = "true";
  env.npm_config_registry = registry;
  env.NPM_CONFIG_REGISTRY = registry;

  return { ...env, ...overrides };
}

export function formatNpmPolicyLine(resolved: ResolvedNpmPolicy): string {
  const reg =
    resolved.registry != null
      ? ` registry=${resolved.registry} (${resolved.registrySource})`
      : " registry=(user npmrc)";
  return `npm policy=${resolved.policy} (${resolved.policySource})${reg}`;
}
