/**
 * SEAM-5 / F16 — runtime identity check for the control plane.
 *
 * Before binding the CP HTTP port, verify nothing already listening there
 * belongs to ANOTHER project. A second `ship serve` in a different project
 * would otherwise crash on EADDRINUSE with an opaque error — or, worse, the
 * team silently talks to the wrong project's control plane. The Metro path
 * uses the same core primitive (parseLsofListeners/parseLsofCwd).
 */
import { spawnSync } from "node:child_process";

import {
  assessListenerIdentity,
  foreignListenerMessage,
  parseLsofCwd,
  parseLsofListeners,
} from "@client-platform/core";

function capture(cmd: string, args: string[]): { status: number; stdout: string } {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return { status: r.status ?? 1, stdout: r.stdout ?? "" };
}

/** Working directory of the process listening on `port`, or null if unknown. */
export function listenerProjectRoot(port: number): string | null {
  const lsof = capture("lsof", [
    "-nP",
    `-iTCP:${String(port)}`,
    "-sTCP:LISTEN",
    "-Fc",
  ]);
  if (lsof.status !== 0) return null;
  const listener = parseLsofListeners(lsof.stdout);
  if (!listener) return null;
  const cwd = capture("lsof", [
    "-a",
    "-p",
    listener.pid,
    "-d",
    "cwd",
    "-Fn",
  ]);
  if (cwd.status !== 0) return null;
  return parseLsofCwd(cwd.stdout);
}

/**
 * Fail-closed pre-bind check. Throws when the port serves a different project.
 * Unknown identity (nothing listening / lsof unavailable) → safe to proceed.
 */
export function assertPortServesProject(
  service: string,
  port: number,
  expectedRoot: string,
): void {
  const serving = listenerProjectRoot(port);
  const identity = assessListenerIdentity(serving, expectedRoot);
  if (!identity.unknown && !identity.ok) {
    throw new Error(
      foreignListenerMessage({
        service,
        port,
        servingRoot: identity.servingRoot ?? serving ?? "unknown",
        expectedRoot,
      }),
    );
  }
}
