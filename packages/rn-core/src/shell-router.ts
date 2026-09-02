/**
 * ShellRouter — path-first navigation (ticket 02 / acceptance R-T5–R-T8).
 *
 * push → normalize → findByRoutePrefix → ensureBundleReady → openSurface → navigator
 * replace → same open pipeline but replaces top stack entry (no extra back frame)
 * back → pop; empty stack → no-op
 */
import { findByRoutePrefix, normalizeRoutePath } from "./route-prefix.js";
import type { RoutePrefixEntry } from "./route-prefix.js";
import type { DegradeDecision, EnsureBundleReadyResult } from "./degrade-types.js";

export type ShellOpenOptions = {
  /** Remainder after stripping routePrefix (consumable by bundle navigator). */
  path?: string;
  params?: Record<string, unknown>;
};

export type BundleNavigatorRegistration = {
  moduleId: string;
  navigate(remainder: string, params?: Record<string, unknown>): void;
};

export type ShellRouter = {
  push(path: string, params?: Record<string, unknown>): Promise<void>;
  replace(path: string, params?: Record<string, unknown>): Promise<void>;
  back(): Promise<void>;
};

export type ShellStackEntry = {
  moduleId: string;
  remainder: string;
  params?: Record<string, unknown>;
  fullPath: string;
};

export type CreateShellRouterDeps = {
  findTable: () => ReadonlyArray<RoutePrefixEntry>;
  ensureBundleReady: (moduleId: string) => Promise<EnsureBundleReadyResult>;
  openSurface: (moduleId: string, opts: ShellOpenOptions) => Promise<void>;
  onUnmatched: (path: string) => Promise<DegradeDecision>;
};

export function createShellRouter(deps: CreateShellRouterDeps): ShellRouter & {
  registerBundleNavigator(reg: BundleNavigatorRegistration): () => void;
  /** Test / host inspection */
  getStack(): ReadonlyArray<ShellStackEntry>;
} {
  const navigators = new Map<string, BundleNavigatorRegistration["navigate"]>();
  const stack: ShellStackEntry[] = [];

  const openEntry = async (entry: ShellStackEntry): Promise<boolean> => {
    const ensured = await deps.ensureBundleReady(entry.moduleId);
    if (!ensured.ok) return false;
    const opts: ShellOpenOptions = {
      path: entry.remainder,
      params: entry.params,
    };
    await deps.openSurface(entry.moduleId, opts);
    navigators.get(entry.moduleId)?.(entry.remainder, entry.params);
    return true;
  };

  const resolve = async (
    path: string,
    params?: Record<string, unknown>,
  ): Promise<ShellStackEntry | null> => {
    const normalized = normalizeRoutePath(path);
    const hit = findByRoutePrefix(normalized, deps.findTable());
    if (!hit) {
      await deps.onUnmatched(normalized);
      return null;
    }
    return {
      moduleId: hit.moduleId,
      remainder: hit.remainder,
      params,
      fullPath: normalized,
    };
  };

  return {
    registerBundleNavigator(reg) {
      navigators.set(reg.moduleId, reg.navigate);
      return () => {
        navigators.delete(reg.moduleId);
      };
    },

    getStack() {
      return [...stack];
    },

    async push(path, params) {
      const entry = await resolve(path, params);
      if (!entry) return;
      const ok = await openEntry(entry);
      if (ok) stack.push(entry);
    },

    async replace(path, params) {
      const entry = await resolve(path, params);
      if (!entry) return;
      const ok = await openEntry(entry);
      if (!ok) return;
      if (stack.length === 0) {
        stack.push(entry);
      } else {
        stack[stack.length - 1] = entry;
      }
    },

    async back() {
      if (stack.length === 0) return;
      stack.pop();
      const prev = stack[stack.length - 1];
      if (!prev) return;
      await openEntry(prev);
    },
  };
}
