/**
 * Map B thin CP auth — bearer token on mutating routes only.
 * Optional role matrix via RN_CP_ROLE=admin|viewer (default admin).
 * When RN_CP_TOKEN / RN_CP_TENANTS unset, mutating routes stay open (local demo).
 *
 * Multi-tenant (thin): RN_CP_TENANTS='{"acme":"tok-a","beta":"tok-b"}'
 * Clients send Authorization: Bearer <tok> + X-RN-Tenant: <id>.
 * Single-token RN_CP_TOKEN still works (tenant defaults to "default").
 */

export type CpRole = "admin" | "viewer";

export type CpAuthConfig = {
  /** Legacy single-token mode (RN_CP_TOKEN). */
  token?: string;
  /** tenantId → bearer token (RN_CP_TENANTS JSON object). */
  tenants?: Record<string, string>;
};

export function resolveCpAuthToken(): string | undefined {
  const token = process.env.RN_CP_TOKEN?.trim();
  return token || undefined;
}

/** Parse RN_CP_TENANTS JSON map; invalid JSON → undefined (fail open to single-token). */
export function resolveCpTenants(): Record<string, string> | undefined {
  const raw = process.env.RN_CP_TENANTS?.trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k === "string" && k.trim() && typeof v === "string" && v.trim()) {
        out[k.trim()] = v.trim();
      }
    }
    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

export function resolveCpAuthConfig(): CpAuthConfig {
  const tenants = resolveCpTenants();
  const token = resolveCpAuthToken();
  return {
    ...(tenants ? { tenants } : {}),
    ...(token ? { token } : {}),
  };
}

export function resolveCpRole(): CpRole {
  const role = process.env.RN_CP_ROLE?.trim().toLowerCase();
  return role === "viewer" ? "viewer" : "admin";
}

/** Optional rollout soak override for lab/AFK (ms). Unset → default 60s ladder in rn-core. */
export function resolveCpMinSoakMs(): number | undefined {
  const raw = process.env.RN_CP_MIN_SOAK_MS?.trim();
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export type CpAuthResult =
  | { ok: true; tenant: string }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Validate Authorization (+ optional X-RN-Tenant) against auth config.
 * - No config → open (local demo)
 * - tenants map → require X-RN-Tenant + matching bearer for that tenant
 * - single token → bearer must match; tenant = "default" (or X-RN-Tenant if provided)
 */
export function checkCpBearerAuth(
  authHeader: string | undefined,
  expectedTokenOrConfig: string | CpAuthConfig | undefined,
  tenantHeader?: string,
): CpAuthResult {
  const config: CpAuthConfig =
    typeof expectedTokenOrConfig === "string"
      ? { token: expectedTokenOrConfig }
      : (expectedTokenOrConfig ?? {});

  const hasTenants = Boolean(config.tenants && Object.keys(config.tenants).length > 0);
  const hasToken = Boolean(config.token);

  if (!hasTenants && !hasToken) {
    return { ok: true, tenant: "default" };
  }

  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      status: 401,
      error: hasTenants
        ? "missing Bearer token (RN_CP_TENANTS is set on server)"
        : "missing Bearer token (RN_CP_TOKEN is set on server)",
    };
  }
  const token = authHeader.slice("Bearer ".length).trim();
  const tenantHint = tenantHeader?.trim();

  if (hasTenants && config.tenants) {
    if (!tenantHint) {
      return {
        ok: false,
        status: 401,
        error: "missing X-RN-Tenant header (multi-tenant mode)",
      };
    }
    const expected = config.tenants[tenantHint];
    if (!expected) {
      return {
        ok: false,
        status: 401,
        error: `unknown tenant "${tenantHint}"`,
      };
    }
    if (token !== expected) {
      return { ok: false, status: 401, error: "invalid CP token for tenant" };
    }
    return { ok: true, tenant: tenantHint };
  }

  // Single-token mode
  if (token !== config.token) {
    return { ok: false, status: 401, error: "invalid CP token" };
  }
  return { ok: true, tenant: tenantHint || "default" };
}

/** Role gate for POST promote/block (viewer = read-only). */
export function checkCpMutatingRole(role: CpRole): CpAuthResult {
  if (role === "viewer") {
    return {
      ok: false,
      status: 403,
      error: "RN_CP_ROLE=viewer is read-only (GET allowed; POST promote/block forbidden)",
    };
  }
  return { ok: true, tenant: "default" };
}
