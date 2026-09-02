/**
 * Path routing table — YES/PARTIAL (ticket 02 / map #126).
 * Path-routing modules require unique normalized routePrefix;
 * pathRouting:false modules are excluded from ShellRouter matching.
 */

export type RoutePrefixEntry = {
  moduleId: string;
  routePrefix: string;
};

export type RoutePrefixHit = {
  moduleId: string;
  remainder: string;
  routePrefix: string;
};

const ROUTE_PREFIX_RE = /^\/[A-Za-z0-9._~/-]*$/;

/**
 * Collapse duplicate slashes and strip a trailing slash (except root `/`).
 */
export function normalizeRoutePath(path: string): string {
  if (!path || path.trim() === "") return "/";
  let p = path.trim();
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/+/g, "/");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

/**
 * Longest-prefix match among path-routing table entries only.
 */
export function findByRoutePrefix(
  path: string,
  table: ReadonlyArray<RoutePrefixEntry>,
): RoutePrefixHit | null {
  const normalized = normalizeRoutePath(path);
  let best: RoutePrefixHit | null = null;
  for (const entry of table) {
    const prefix = normalizeRoutePath(entry.routePrefix);
    const matches =
      normalized === prefix || normalized.startsWith(`${prefix}/`);
    if (!matches) continue;
    if (!best || prefix.length > best.routePrefix.length) {
      const rest = normalized.slice(prefix.length);
      best = {
        moduleId: entry.moduleId,
        routePrefix: prefix,
        remainder: rest === "" ? "/" : rest,
      };
    }
  }
  return best;
}

export type BuildRoutePrefixTableResult =
  | { ok: true; table: RoutePrefixEntry[] }
  | { ok: false; reason: string };

/**
 * Build the ShellRouter path table. Skips pathRouting:false.
 * Fails closed on missing/invalid/duplicate prefixes for path-routing modules.
 */
export function buildRoutePrefixTable(
  modules: ReadonlyArray<{
    moduleId: string;
    pathRouting: boolean;
    routePrefix?: string;
  }>,
): BuildRoutePrefixTableResult {
  const table: RoutePrefixEntry[] = [];
  const owners = new Map<string, string>();

  for (const mod of modules) {
    if (!mod.pathRouting) continue;

    if (
      typeof mod.routePrefix !== "string" ||
      mod.routePrefix.trim().length === 0
    ) {
      return {
        ok: false,
        reason: `pathRouting:true module "${mod.moduleId}" requires routePrefix`,
      };
    }

    const normalized = normalizeRoutePath(mod.routePrefix);
    if (normalized !== "/" && !ROUTE_PREFIX_RE.test(normalized)) {
      return {
        ok: false,
        reason: `invalid routePrefix "${mod.routePrefix}" for "${mod.moduleId}"`,
      };
    }

    const owner = owners.get(normalized);
    if (owner) {
      return {
        ok: false,
        reason: `routePrefix ${normalized} already used by ${owner}`,
      };
    }
    owners.set(normalized, mod.moduleId);
    table.push({ moduleId: mod.moduleId, routePrefix: normalized });
  }

  return { ok: true, table };
}
