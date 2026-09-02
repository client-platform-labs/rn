/**
 * Map B thin CP auth — bearer token on mutating routes only.
 * Optional role matrix via RN_CP_ROLE=admin|viewer (default admin).
 * When RN_CP_TOKEN is unset, mutating routes stay open (local demo).
 */

export type CpRole = "admin" | "viewer";

export function resolveCpAuthToken(): string | undefined {
  const token = process.env.RN_CP_TOKEN?.trim();
  return token || undefined;
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
  | { ok: true }
  | { ok: false; status: 401 | 403; error: string };

/** Validate Authorization header against RN_CP_TOKEN (if configured). */
export function checkCpBearerAuth(
  authHeader: string | undefined,
  expectedToken: string | undefined,
): CpAuthResult {
  if (!expectedToken) {
    return { ok: true };
  }
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      status: 401,
      error: "missing Bearer token (RN_CP_TOKEN is set on server)",
    };
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (token !== expectedToken) {
    return { ok: false, status: 401, error: "invalid CP token" };
  }
  return { ok: true };
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
  return { ok: true };
}
