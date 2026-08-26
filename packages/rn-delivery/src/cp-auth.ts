/**
 * Map B thin CP auth — bearer token on mutating routes only.
 * When RN_CP_TOKEN is unset, mutating routes stay open (local demo).
 */

export function resolveCpAuthToken(): string | undefined {
  const token = process.env.RN_CP_TOKEN?.trim();
  return token || undefined;
}

export type CpAuthResult =
  | { ok: true }
  | { ok: false; status: 401; error: string };

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
