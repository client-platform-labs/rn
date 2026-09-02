/**
 * `rn module dev` orchestration — Broker + Live register + Metro hooks (#124).
 * Metro start is injectable so tests do not spawn a real bundler.
 */
import { networkInterfaces } from "node:os";

import type { LivePutBody, LiveRecord } from "@client-platform/rn-core";

import { ensureAdbReversePorts } from "../broker/reverse.js";
import {
  DEFAULT_BROKER_PORT,
  fetchLiveStatus,
  startDevSessionBroker,
  type BrokerHandle,
} from "../broker/server.js";
import { CliError, EXIT_FAIL } from "../errors.js";
import type { CliLogger } from "../logger.js";
import {
  loadModuleSelfDescriptor,
  MODULE_SELF_DESCRIPTOR_FILENAME,
  type ModuleSelfDescriptor,
} from "./self-descriptor.js";

export type MetroRunnerResult = {
  port: number;
  reused: boolean;
  usbUrl: string;
  lanUrl?: string;
};

export type MetroRunner = (input: {
  cwd: string;
  moduleId: string;
  preferredPort: number;
}) => Promise<MetroRunnerResult>;

export type CatalogMembership =
  | "in_catalog"
  | "not_in_catalog"
  | "skipped"
  | "unreachable";

export type ModuleDevPorts = {
  /** Start or reuse Metro (inject stub in tests). */
  ensureMetro: MetroRunner;
  /** Optional Catalog membership check (warn-only when not_in_catalog). */
  checkCatalogMembership?: (input: {
    moduleId: string;
    productApp: string;
  }) => Promise<CatalogMembership>;
  /** Optional adb reverse (inject mock). Default: best-effort ensureAdbReversePorts. */
  reversePorts?: (input: {
    metroPort: number;
    brokerPort: number;
    brokerBaseUrl: string;
  }) => Promise<{ ok: boolean; messages: string[]; hostPullUrl: string }>;
};

export type ModuleDevResult = {
  moduleId: string;
  productApp?: string;
  brokerBaseUrl: string;
  brokerPort: number;
  brokerStartedByUs: boolean;
  metro: MetroRunnerResult;
  live: LiveRecord;
  catalogMembership: CatalogMembership;
  hostPullUrl: string;
  reverseMessages: string[];
  /** Close in-process Broker if we started it (tests). */
  close?: () => Promise<void>;
};

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

async function ensureBrokerReachable(options: {
  host: string;
  port: number;
  startIfMissing: boolean;
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
  if (!options.startIfMissing) {
    throw new CliError(
      `Dev Session Broker not reachable at ${baseUrl} — start with rn module dev or pass --broker-port`,
      EXIT_FAIL,
    );
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

async function putLive(
  baseUrl: string,
  moduleId: string,
  body: LivePutBody,
): Promise<LiveRecord> {
  const res = await fetch(
    `${baseUrl.replace(/\/$/, "")}/v1/live/${encodeURIComponent(moduleId)}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new CliError(
      `Broker PUT live failed: HTTP ${res.status}`,
      EXIT_FAIL,
    );
  }
  const json = (await res.json()) as { record: LiveRecord };
  return json.record;
}

/** Pure orchestration used by CLI and tests. */
export async function orchestrateModuleDev(options: {
  cwd: string;
  logger: CliLogger;
  descriptor: ModuleSelfDescriptor;
  ports: ModuleDevPorts;
  brokerHost?: string;
  brokerPort?: number;
  /** Start in-process Broker when remote is down (default true). */
  startBrokerIfMissing?: boolean;
}): Promise<ModuleDevResult> {
  const moduleId = options.descriptor.business_module;
  const productApp = options.descriptor.productApp;
  const preferredPort = options.descriptor.preferredMetroPort ?? 8081;
  const brokerHost = options.brokerHost ?? "127.0.0.1";
  const brokerPort = options.brokerPort ?? DEFAULT_BROKER_PORT;

  let catalogMembership: CatalogMembership = "skipped";
  if (productApp && options.ports.checkCatalogMembership) {
    catalogMembership = await options.ports.checkCatalogMembership({
      moduleId,
      productApp,
    });
    if (catalogMembership === "not_in_catalog") {
      options.logger.writeHuman(
        `warn: ${moduleId} not in Catalog for productApp=${productApp} — Host will refuse bind (D5)`,
      );
    } else if (catalogMembership === "unreachable") {
      options.logger.writeHuman(
        `warn: Catalog check unreachable — continuing Live register (Host may use embedded)`,
      );
    }
  }

  const broker = await ensureBrokerReachable({
    host: brokerHost,
    port: brokerPort,
    startIfMissing: options.startBrokerIfMissing !== false,
  });
  options.logger.writeHuman(
    `Broker ${broker.baseUrl}` +
      (broker.startedByUs ? " (started)" : " (reused)"),
  );

  const metro = await options.ports.ensureMetro({
    cwd: options.cwd,
    moduleId,
    preferredPort,
  });
  options.logger.writeHuman(
    `Metro ${metro.usbUrl}` + (metro.reused ? " (reused)" : " (started)"),
  );

  const lanHost = guessLanHost();
  const lanUrl =
    metro.lanUrl ??
    (lanHost ? `http://${lanHost}:${metro.port}` : undefined);

  const live = await putLive(broker.baseUrl, moduleId, {
    usbUrl: metro.usbUrl,
    lanUrl,
    hostname: process.env.HOSTNAME ?? undefined,
    sessionId: `mod-dev-${moduleId}-${Date.now()}`,
  });

  const reverse =
    options.ports.reversePorts ??
    (async (input) => {
      const r = ensureAdbReversePorts({
        ports: [input.metroPort, input.brokerPort],
        brokerBaseUrl: input.brokerBaseUrl,
      });
      return {
        ok: r.ok,
        messages: r.results.map((x) => `${x.ok ? "ok" : "fail"}:${x.message}`),
        hostPullUrl: r.hostPullUrl,
      };
    });

  const rev = await reverse({
    metroPort: metro.port,
    brokerPort: broker.port,
    brokerBaseUrl: broker.baseUrl,
  });
  for (const m of rev.messages) {
    options.logger.writeHuman(`  reverse: ${m}`);
  }

  options.logger.writeHuman(`Live registered: ${moduleId}`);
  options.logger.writeHuman(`  usbUrl=${live.usbUrl}`);
  if (lanUrl) options.logger.writeHuman(`  lanUrl=${lanUrl}`);
  options.logger.writeHuman(
    `  Host Pull URL (via adb reverse): ${rev.hostPullUrl}`,
  );
  options.logger.writeHuman(
    `  probeOk=${live.probeOk} stale=${live.stale ?? false}`,
  );

  return {
    moduleId,
    productApp,
    brokerBaseUrl: broker.baseUrl,
    brokerPort: broker.port,
    brokerStartedByUs: broker.startedByUs,
    metro,
    live,
    catalogMembership,
    hostPullUrl: rev.hostPullUrl,
    reverseMessages: rev.messages,
    close: broker.handle
      ? async () => {
          await broker.handle!.close();
        }
      : undefined,
  };
}

export async function runModuleDev(options: {
  cwd: string;
  logger: CliLogger;
  brokerHost?: string;
  brokerPort?: number;
  catalogBaseUrl?: string;
  /** Inject for tests; default starts/reuses Metro via ensureMetroSession. */
  ports?: Partial<ModuleDevPorts>;
}): Promise<ModuleDevResult> {
  const cwd = options.cwd;
  const descriptor = loadModuleSelfDescriptor(cwd);
  if (!descriptor) {
    throw new CliError(
      `missing ${MODULE_SELF_DESCRIPTOR_FILENAME} in ${cwd} — see module-first joint-debug handbook §2.2`,
      EXIT_FAIL,
    );
  }

  const defaultMetro: MetroRunner = async ({ preferredPort, moduleId }) => {
    const { ensureMetroSession } = await import("../metro-orchestrator.js");
    const { commandExists } = await import("../process.js");
    const npx = commandExists("npx") ? "npx" : "npx";
    try {
      const session = await ensureMetroSession({
        npx,
        projectRoot: cwd,
        logger: options.logger,
        port: preferredPort,
        detached: true,
      });
      return {
        port: session.port,
        reused: session.reused,
        usbUrl: `http://127.0.0.1:${session.port}`,
      };
    } catch (err) {
      options.logger.writeHuman(
        `warn: Metro ensure failed for ${moduleId} — registering Live with preferred port anyway`,
      );
      options.logger.writeHuman(
        `  ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        port: preferredPort,
        reused: false,
        usbUrl: `http://127.0.0.1:${preferredPort}`,
      };
    }
  };

  const checkCatalog: ModuleDevPorts["checkCatalogMembership"] = async ({
    moduleId,
    productApp,
  }) => {
    const base = options.catalogBaseUrl;
    if (!base) return "skipped";
    try {
      const { fetchCatalogModules } = await import("../catalog/service.js");
      const res = await fetchCatalogModules({ baseUrl: base, productApp });
      if (!res.ok) return "unreachable";
      const doc = (await res.json()) as {
        modules?: Array<{ business_module: string }>;
      };
      const ids = new Set((doc.modules ?? []).map((m) => m.business_module));
      return ids.has(moduleId) ? "in_catalog" : "not_in_catalog";
    } catch {
      return "unreachable";
    }
  };

  return orchestrateModuleDev({
    cwd,
    logger: options.logger,
    descriptor,
    brokerHost: options.brokerHost,
    brokerPort: options.brokerPort,
    ports: {
      ensureMetro: options.ports?.ensureMetro ?? defaultMetro,
      checkCatalogMembership:
        options.ports?.checkCatalogMembership ?? checkCatalog,
      reversePorts: options.ports?.reversePorts,
    },
  });
}

export {
  loadModuleSelfDescriptor,
  MODULE_SELF_DESCRIPTOR_FILENAME,
};
export type { ModuleSelfDescriptor };
