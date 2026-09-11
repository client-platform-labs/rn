/**
 * Runtime service-identity primitive (SEAM-5 / F16).
 *
 * Zero-trust rule for shared dev/control-plane infrastructure: before reusing
 * a long-lived process listening on a local port (Metro, a control plane, …),
 * verify it serves THIS engineering project. A stale server from another
 * project silently answers requests — HMR lands in the wrong app, OTA/check
 * calls hit the wrong lane. Identify the listener via its process working
 * directory and compare it to the expected project root.
 *
 * The pure parsers in this module are platform-portable and unit-tested; the
 * `lsof` invocation lives in the caller (rn/ship CLIs) so core stays free of
 * subprocess policy.
 */

/** One entry from `lsof -nP -iTCP:<port> -sTCP:LISTEN -F` machine output. */
export interface ListenerRecord {
  /** Process id of the listening process. */
  pid: string;
  /** Command name (field `c`), best effort. */
  command?: string;
}

/**
 * Parse the machine-readable output of
 *   lsof -nP -iTCP:<port> -sTCP:LISTEN -F c
 * into the first listening record. `lsof -F` emits one field per line:
 *   p1234   (process id)
 *   cnode   (command)
 * Records start with a new `p` line; we only need the first listener.
 */
export function parseLsofListeners(output: string): ListenerRecord | null {
  let pid: string | null = null;
  let command: string | undefined;
  for (const line of output.split("\n")) {
    if (line.startsWith("p")) {
      if (pid) {
        // A second record starts; the first one is what a LISTEN query yields.
        break;
      }
      pid = line.slice(1).trim();
    } else if (line.startsWith("c")) {
      command = line.slice(1);
    }
  }
  if (!pid) return null;
  return { pid, command };
}

/**
 * Parse the working directory from
 *   lsof -a -p <pid> -d cwd -Fn
 * output. The `n` field carries the path for a cwd descriptor.
 */
export function parseLsofCwd(output: string): string | null {
  for (const line of output.split("\n")) {
    if (line.startsWith("n")) {
      const cwd = line.slice(1);
      return cwd.length > 0 ? cwd : null;
    }
  }
  return null;
}

/**
 * Decide whether an already-listening service may be reused.
 *
 * - `servingRoot === null` → identity unknown (lsof absent/denied). Returning
 *   null lets the caller choose its own permissive/fail-closed policy instead
 *   of hiding the difference behind a boolean.
 * - roots equal → safe to reuse.
 * - roots differ → never reuse; the mismatch carries the foreign root so the
 *   error can name the occupying project.
 */
export function assessListenerIdentity(
  servingRoot: string | null,
  expectedRoot: string,
): { ok: boolean; unknown: boolean; servingRoot: string | null } {
  if (servingRoot === null) {
    return { ok: false, unknown: true, servingRoot: null };
  }
  const normalize = (p: string): string =>
    p.trim().replace(/\/+$/, "") || p;
  return {
    ok: normalize(servingRoot) === normalize(expectedRoot),
    unknown: false,
    servingRoot,
  };
}

/** Build the fail-closed error message for a foreign-project listener. */
export function foreignListenerMessage(input: {
  service: string;
  port: number;
  servingRoot: string;
  expectedRoot: string;
}): string {
  return (
    `port :${input.port} is already serving a different ${input.service} project: ` +
    `${input.servingRoot} (this project is ${input.expectedRoot}). ` +
    `Stop that ${input.service} or use another port — refusing to silently reuse ` +
    `another project's service (SEAM-5/F16).`
  );
}
