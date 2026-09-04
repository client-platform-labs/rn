/**
 * Metro port allocation for multi-pack dev (#158 / map #149).
 *
 * Policy (#157): reuse only when X-RN-Business-Module matches moduleId;
 * otherwise scan preferred, preferred+1, … until a free port.
 */
import { MODULE_BUNDLE_HEADER } from "@client-platform/rn-core";

import { CliError, EXIT_FAIL } from "./errors.js";

export const DEFAULT_METRO_PORT_SCAN_MAX = 20;

export type MetroPortProbe = {
  running: boolean;
  /** null when Metro is up but header missing or unknown occupant (e.g. shell). */
  moduleId: string | null;
};

export type AllocateMetroPortInput = {
  moduleId: string;
  preferredPort: number;
  maxScan?: number;
  probe?: (port: number) => Promise<MetroPortProbe>;
};

export type AllocateMetroPortResult = {
  port: number;
  reused: boolean;
  /** preferred was taken by another module / unknown Metro */
  bumped: boolean;
};

/** Probe Metro /status and read business-module identity header. */
export async function probeMetroOnPort(
  port: number,
  fetchImpl: typeof fetch = fetch,
): Promise<MetroPortProbe> {
  try {
    const res = await fetchImpl(`http://127.0.0.1:${port}/status`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) {
      return { running: false, moduleId: null };
    }
    const text = await res.text();
    if (!text.includes("packager-status:running")) {
      return { running: false, moduleId: null };
    }
    const raw =
      res.headers.get(MODULE_BUNDLE_HEADER) ??
      res.headers.get(MODULE_BUNDLE_HEADER.toLowerCase());
    const moduleId = raw?.trim() || null;
    return { running: true, moduleId };
  } catch {
    return { running: false, moduleId: null };
  }
}

/**
 * Pick a port for moduleId starting at preferredPort.
 * Never blind-reuse a foreign Metro on the preferred port.
 */
export async function allocateMetroPort(
  input: AllocateMetroPortInput,
): Promise<AllocateMetroPortResult> {
  const maxScan = input.maxScan ?? DEFAULT_METRO_PORT_SCAN_MAX;
  const probe = input.probe ?? probeMetroOnPort;

  for (let i = 0; i <= maxScan; i++) {
    const port = input.preferredPort + i;
    const state = await probe(port);
    if (!state.running) {
      return {
        port,
        reused: false,
        bumped: port !== input.preferredPort,
      };
    }
    if (state.moduleId === input.moduleId) {
      return {
        port,
        reused: true,
        bumped: port !== input.preferredPort,
      };
    }
    // Foreign Metro (wrong header or shell without header) — try next port.
  }

  throw new CliError(
    `No free Metro port for module=${input.moduleId} in range ${input.preferredPort}–${input.preferredPort + maxScan}`,
    EXIT_FAIL,
  );
}

/**
 * Host/shell Metro without a business moduleId: find first free port;
 * never reuse an existing packager (unknown identity).
 */
export async function allocateAnonymousMetroPort(options: {
  preferredPort: number;
  maxScan?: number;
  probe?: (port: number) => Promise<MetroPortProbe>;
}): Promise<AllocateMetroPortResult> {
  const maxScan = options.maxScan ?? DEFAULT_METRO_PORT_SCAN_MAX;
  const probe = options.probe ?? probeMetroOnPort;

  for (let i = 0; i <= maxScan; i++) {
    const port = options.preferredPort + i;
    const state = await probe(port);
    if (!state.running) {
      return {
        port,
        reused: false,
        bumped: port !== options.preferredPort,
      };
    }
  }

  throw new CliError(
    `No free Metro port in range ${options.preferredPort}–${options.preferredPort + maxScan}`,
    EXIT_FAIL,
  );
}
