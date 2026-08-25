/**
 * Metro lifecycle for platform dev commands.
 *
 * Dev session model (industrial):
 * - Metro is a **long-lived dev server**, not an install-step sidecar.
 * - `rn dev --android` may start Metro, run install, then **keep Metro alive**
 *   (default: foreground until Ctrl+C).
 * - Only `--stop-metro` tears down Metro we started (CI / ephemeral install).
 */
import { spawn, type ChildProcess } from "node:child_process";

import {
  DEFAULT_METRO_PORT,
  isMetroRunning,
} from "./android-dev-bridge.js";
import { CliError, EXIT_FAIL } from "./errors.js";
import type { CliLogger } from "./logger.js";

export interface MetroSession {
  port: number;
  /** Metro was already listening before this command. */
  reused: boolean;
  /** We spawned Metro for this command. */
  startedByUs: boolean;
  child?: ChildProcess;
}

const METRO_START_TIMEOUT_MS = 120_000;
const METRO_POLL_MS = 400;

export async function waitForMetro(
  port: number,
  timeoutMs = METRO_START_TIMEOUT_MS,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isMetroRunning(port)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, METRO_POLL_MS));
  }
  return false;
}

export function waitForChildExit(child: ChildProcess | undefined): Promise<number | null> {
  if (!child) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    if (child.exitCode != null) {
      resolve(child.exitCode);
      return;
    }
    child.once("exit", (code) => resolve(code ?? null));
  });
}

export function spawnMetroProcess(options: {
  npx: string;
  projectRoot: string;
  port: number;
  env?: NodeJS.ProcessEnv;
  /** Detached daemon — survives CLI exit (used with --detach-metro). */
  detached?: boolean;
}): ChildProcess {
  return spawn(
    options.npx,
    ["react-native", "start", "--port", String(options.port)],
    {
      cwd: options.projectRoot,
      env: options.env ?? process.env,
      stdio: options.detached ? "ignore" : "inherit",
      detached: Boolean(options.detached),
      shell: process.platform === "win32",
    },
  );
}

export function killMetroChild(child: ChildProcess | undefined): void {
  if (!child || child.killed) {
    return;
  }
  try {
    child.kill("SIGTERM");
  } catch {
    // process may already be gone
  }
}

/** Ensure Metro is reachable; start when allowed. */
export async function ensureMetroSession(options: {
  npx: string;
  projectRoot: string;
  logger: CliLogger;
  port?: number;
  env?: NodeJS.ProcessEnv;
  noMetro?: boolean;
  detached?: boolean;
}): Promise<MetroSession> {
  const port = options.port ?? DEFAULT_METRO_PORT;

  if (isMetroRunning(port)) {
    options.logger.writeHuman(`Metro already running on :${port}`);
    return { port, reused: true, startedByUs: false };
  }

  if (options.noMetro) {
    throw new CliError(
      `Metro not running on :${port} — run \`rn dev\` first, or omit --no-metro`,
      EXIT_FAIL,
    );
  }

  options.logger.writeHuman(
    `Starting Metro on :${port} (same terminal, no launchPackager popup)…`,
  );
  const child = spawnMetroProcess({
    npx: options.npx,
    projectRoot: options.projectRoot,
    port,
    env: options.env,
    detached: options.detached,
  });

  if (options.detached) {
    child.unref();
  }

  let spawnFailed = false;
  child.once("error", () => {
    spawnFailed = true;
  });
  child.once("exit", (code) => {
    if (code != null && code !== 0) {
      spawnFailed = true;
    }
  });

  const ready = await waitForMetro(port);
  if (!ready || spawnFailed) {
    killMetroChild(child);
    throw new CliError(
      `Metro failed to start on :${port} — check port conflicts or run \`rn dev\` manually`,
      EXIT_FAIL,
    );
  }

  options.logger.writeHuman(`Metro ready on :${port}`);
  return { port, reused: false, startedByUs: true, child };
}

export type MetroAfterPlatform = "foreground" | "detach" | "stop";

/**
 * Start/reuse Metro, run platform install (run-android / run-ios), then apply
 * the correct Metro post-install policy.
 */
export async function runPlatformWithMetro(
  options: {
    npx: string;
    projectRoot: string;
    logger: CliLogger;
    port?: number;
    env?: NodeJS.ProcessEnv;
    noMetro?: boolean;
    after: MetroAfterPlatform;
  },
  runPlatform: () => Promise<void>,
): Promise<void> {
  const session = await ensureMetroSession({
    npx: options.npx,
    projectRoot: options.projectRoot,
    logger: options.logger,
    port: options.port,
    env: options.env,
    noMetro: options.noMetro,
    detached: options.after === "detach",
  });

  try {
    await runPlatform();
  } catch (err) {
    if (session.startedByUs) {
      killMetroChild(session.child);
    }
    throw err;
  }

  if (!session.startedByUs) {
    options.logger.writeHuman("Install complete (Metro was already running).");
    return;
  }

  switch (options.after) {
    case "stop":
      killMetroChild(session.child);
      options.logger.writeHuman("Install complete — Metro stopped.");
      return;
    case "detach":
      session.child?.unref?.();
      options.logger.writeHuman(
        `Install complete — Metro left running on :${session.port} (background).`,
      );
      return;
    case "foreground":
      options.logger.writeHuman(
        `Install complete — Metro on :${session.port}. Press Ctrl+C to stop.`,
      );
      await waitForChildExit(session.child);
      return;
  }
}

/** @deprecated use runPlatformWithMetro */
export async function releaseMetroSession(session: MetroSession): Promise<void> {
  if (session.startedByUs) {
    killMetroChild(session.child);
  }
}
