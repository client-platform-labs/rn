/**
 * Host shell Metro + Broker Live + multi-port adb reverse (#158 system fix).
 */
import { networkInterfaces } from "node:os";

import {
  HOST_SHELL_LIVE_MODULE_ID,
  pullLiveList,
  putLiveRecord,
} from "@client-platform/rn-core";

import {
  DEFAULT_BROKER_PORT,
  fetchLiveStatus,
  startDevSessionBroker,
  type BrokerHandle,
} from "./broker/server.js";
import { ensureDevSessionReverse } from "./dev-session-reverse.js";
import { loadDevSessionConfig } from "./dev-session-config.js";
import type { CliLogger } from "./logger.js";
import { writeHostMetroResolver } from "./metro-host-config.js";
import {
  type MetroSession,
  ensureMetroSession,
  waitForChildExit,
} from "./metro-orchestrator.js";
import {
  collectDevSessionReversePorts,
  resolveHostShellPreferredPort,
  writeShellMetroSession,
} from "./shell-dev-session.js";

function guessLanHost(): string | undefined {
  const nets = networkInterfaces();
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const e of entries) {
      if (e.family === "IPv4" && !e.internal) {
        return e.address;
      }
    }
  }
  return undefined;
}

async function ensureBroker(options: {
  host: string;
  port: number;
}): Promise<{
  baseUrl: string;
  port: number;
  startedByUs: boolean;
  handle?: BrokerHandle;
}> {
  const baseUrl = `http://${options.host}:${options.port}`;
  const status = await fetchLiveStatus({ baseUrl });
  if (status.ok) {
    return { baseUrl, port: options.port, startedByUs: false };
  }
  const handle = await startDevSessionBroker({
    host: options.host,
    port: options.port,
  });
  return {
    baseUrl: handle.baseUrl,
    port: handle.port,
    startedByUs: true,
    handle,
  };
}

export type HostShellDevSession = {
  session: MetroSession;
  brokerBaseUrl: string;
  brokerPort: number;
  brokerStartedByUs: boolean;
  hostPullUrl: string;
  reverseMessages: string[];
  closeBroker?: () => Promise<void>;
};

/**
 * Start/reuse shell Metro, register `__host_shell__` Live, reverse all Dev Session ports.
 */
export async function ensureHostShellDevSession(options: {
  npx: string;
  projectRoot: string;
  logger: CliLogger;
  port?: number;
  brokerHost?: string;
  brokerPort?: number;
  noMetro?: boolean;
  detached?: boolean;
}): Promise<HostShellDevSession> {
  const brokerHost = options.brokerHost ?? "127.0.0.1";
  const brokerPort = options.brokerPort ?? DEFAULT_BROKER_PORT;
  const preferredPort = resolveHostShellPreferredPort(
    options.projectRoot,
    options.port,
  );

  try {
    const resolverFile = writeHostMetroResolver(options.projectRoot);
    options.logger.writeHuman(`Host Metro resolver: ${resolverFile}`);
  } catch (err) {
    options.logger.warn(
      `Host Metro resolver sync skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const broker = await ensureBroker({ host: brokerHost, port: brokerPort });
  options.logger.writeHuman(
    `Broker ${broker.baseUrl}` + (broker.startedByUs ? " (started)" : " (reused)"),
  );

  const session = await ensureMetroSession({
    npx: options.npx,
    projectRoot: options.projectRoot,
    logger: options.logger,
    port: preferredPort,
    noMetro: options.noMetro,
    detached: options.detached,
  });

  writeShellMetroSession(options.projectRoot, session.port);
  options.logger.writeHuman(`Shell Metro session :${session.port} (persisted)`);

  const lanHost = guessLanHost();
  const usbUrl = `http://127.0.0.1:${session.port}`;
  const lanUrl = lanHost ? `http://${lanHost}:${session.port}` : undefined;
  const put = await putLiveRecord({
    baseUrl: broker.baseUrl,
    moduleId: HOST_SHELL_LIVE_MODULE_ID,
    body: {
      usbUrl,
      lanUrl,
      pid: process.pid,
      hostname: process.env.HOSTNAME,
      sessionId: `host-shell-${Date.now()}`,
      probeOk: true,
    },
  });
  if (!put.ok) {
    options.logger.warn(`Shell Live register failed: ${put.error}`);
  } else {
    options.logger.writeHuman(
      `Shell Live registered (${HOST_SHELL_LIVE_MODULE_ID}) usbUrl=${usbUrl}`,
    );
  }

  const devSession = loadDevSessionConfig(options.projectRoot);
  let liveRecords: Array<{ usbUrl: string; lanUrl?: string }> = [];
  const list = await pullLiveList({ baseUrl: broker.baseUrl });
  if (list.ok) {
    liveRecords = list.live;
  }

  const reversePorts = collectDevSessionReversePorts({
    shellPort: session.port,
    brokerPort: broker.port,
    devSession,
    liveRecords,
  });
  const rev = ensureDevSessionReverse({
    ports: reversePorts,
    brokerBaseUrl: broker.baseUrl,
    logger: options.logger,
  });

  return {
    session,
    brokerBaseUrl: broker.baseUrl,
    brokerPort: broker.port,
    brokerStartedByUs: broker.startedByUs,
    hostPullUrl: rev.hostPullUrl,
    reverseMessages: rev.messages,
    closeBroker: broker.handle
      ? async () => {
          await broker.handle!.close();
        }
      : undefined,
  };
}

/** Keep shell Metro in foreground until Ctrl+C (metro-only workflow). */
export async function runHostShellMetroForeground(
  host: HostShellDevSession,
): Promise<void> {
  if (!host.session.startedByUs) {
    return;
  }
  await waitForChildExit(host.session.child);
  await host.closeBroker?.();
}
