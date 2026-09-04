/**
 * Dev Session Broker — Live SoT (#124 / Phase B Task B1).
 * PUT /v1/live/:moduleId · GET /v1/live · heartbeat / stale · metro probe stub
 */
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import {
  DEFAULT_BROKER_PORT,
  isLiveBindable,
  isLiveHeartbeatStale,
  pullLiveList,
  type LivePutBody,
  type LiveRecord,
} from "@client-platform/rn-core";

import { httpMetroProbe, type MetroProbeFn } from "./probe.js";

export { DEFAULT_BROKER_PORT };
export const DEFAULT_STALE_AFTER_MS = 15_000;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(body)}\n`);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export type LiveStore = {
  upsert(moduleId: string, body: LivePutBody, probeOk: boolean): LiveRecord;
  list(nowMs?: number): LiveRecord[];
  get(moduleId: string, nowMs?: number): LiveRecord | undefined;
  touchHeartbeat(moduleId: string, nowMs?: number): LiveRecord | undefined;
  clear(): void;
};

export function createLiveStore(options?: {
  staleAfterMs?: number;
  now?: () => number;
  brokerPullBaseUrl?: string;
  /** Mutable pull base (set after listen when port=0). */
  getBrokerPullBaseUrl?: () => string | undefined;
}): LiveStore {
  const staleAfterMs = options?.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const now = options?.now ?? (() => Date.now());
  const records = new Map<string, LiveRecord>();

  const pullBase = (): string | undefined =>
    options?.getBrokerPullBaseUrl?.() ?? options?.brokerPullBaseUrl;

  const decorate = (rec: LiveRecord, nowMs: number): LiveRecord => {
    const stale =
      !rec.probeOk ||
      isLiveHeartbeatStale(rec.heartbeatAt, nowMs, staleAfterMs);
    const base = pullBase();
    return {
      ...rec,
      stale,
      brokerPullUrl: base ? `${base.replace(/\/$/, "")}/v1/live` : rec.brokerPullUrl,
    };
  };

  return {
    upsert(moduleId, body, probeOk) {
      const nowMs = now();
      const prev = records.get(moduleId);
      const base = pullBase();
      const rec: LiveRecord = {
        moduleId,
        usbUrl: body.usbUrl,
        lanUrl: body.lanUrl ?? prev?.lanUrl,
        brokerPullUrl: base
          ? `${base.replace(/\/$/, "")}/v1/live`
          : prev?.brokerPullUrl,
        pid: body.pid ?? prev?.pid,
        heartbeatAt: new Date(nowMs).toISOString(),
        probeOk,
        hostname: body.hostname ?? prev?.hostname,
        sessionId: body.sessionId ?? prev?.sessionId,
      };
      records.set(moduleId, rec);
      return decorate(rec, nowMs);
    },

    list(nowMs = now()) {
      return [...records.values()].map((r) => decorate(r, nowMs));
    },

    get(moduleId, nowMs = now()) {
      const r = records.get(moduleId);
      return r ? decorate(r, nowMs) : undefined;
    },

    touchHeartbeat(moduleId, nowMs = now()) {
      const r = records.get(moduleId);
      if (!r) return undefined;
      const next = { ...r, heartbeatAt: new Date(nowMs).toISOString() };
      records.set(moduleId, next);
      return decorate(next, nowMs);
    },

    clear() {
      records.clear();
    },
  };
}

export type BrokerHandle = {
  server: Server;
  store: LiveStore;
  port: number;
  baseUrl: string;
  close: () => Promise<void>;
};

export async function startDevSessionBroker(options?: {
  store?: LiveStore;
  host?: string;
  port?: number;
  staleAfterMs?: number;
  probe?: MetroProbeFn;
  /** When true, run probe on PUT (default true). */
  runProbeOnPut?: boolean;
}): Promise<BrokerHandle> {
  const host = options?.host ?? "127.0.0.1";
  const port = options?.port ?? 0;
  const probe = options?.probe ?? httpMetroProbe;
  const runProbeOnPut = options?.runProbeOnPut !== false;

  const pullBaseRef: { url?: string } = {};
  const store =
    options?.store ??
    createLiveStore({
      staleAfterMs: options?.staleAfterMs,
      getBrokerPullBaseUrl: () => pullBaseRef.url,
    });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${host}`);
      const parts = url.pathname.split("/").filter(Boolean);

      // GET /v1/live
      if (
        parts.length === 2 &&
        parts[0] === "v1" &&
        parts[1] === "live" &&
        req.method === "GET"
      ) {
        const list = store.list();
        sendJson(res, 200, {
          live: list,
          bindable: list.filter(isLiveBindable).map((r) => r.moduleId),
        });
        return;
      }

      // PUT /v1/live/:moduleId  (also POST for convenience)
      if (
        parts.length === 3 &&
        parts[0] === "v1" &&
        parts[1] === "live" &&
        (req.method === "PUT" || req.method === "POST")
      ) {
        const moduleId = decodeURIComponent(parts[2]!);
        const raw = await readBody(req);
        let body: LivePutBody;
        try {
          body = JSON.parse(raw) as LivePutBody;
        } catch {
          sendJson(res, 400, { error: "invalid_json" });
          return;
        }
        if (!body.usbUrl || typeof body.usbUrl !== "string") {
          sendJson(res, 400, { error: "usbUrl_required" });
          return;
        }

        let probeOk = body.probeOk ?? true;
        if (runProbeOnPut) {
          const result = await probe(body.usbUrl);
          probeOk = result.ok;
        }

        const record = store.upsert(moduleId, body, probeOk);
        sendJson(res, 200, {
          record,
          bindable: isLiveBindable(record),
        });
        return;
      }

      // POST /v1/live/:moduleId/heartbeat
      if (
        parts.length === 4 &&
        parts[0] === "v1" &&
        parts[1] === "live" &&
        parts[3] === "heartbeat" &&
        req.method === "POST"
      ) {
        const moduleId = decodeURIComponent(parts[2]!);
        const record = store.touchHeartbeat(moduleId);
        if (!record) {
          sendJson(res, 404, { error: "not_found", moduleId });
          return;
        }
        sendJson(res, 200, { record, bindable: isLiveBindable(record) });
        return;
      }

      sendJson(res, 404, { error: "not_found" });
    } catch (err) {
      sendJson(res, 500, {
        error: "internal",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  const address = server.address();
  const boundPort =
    typeof address === "object" && address ? address.port : Number(port);
  const baseUrl = `http://${host}:${boundPort}`;
  pullBaseRef.url = baseUrl;

  return {
    server,
    store,
    port: boundPort,
    baseUrl,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

/** @deprecated Prefer `pullLiveList` from `@client-platform/rn-core`. */
export async function fetchLiveStatus(options: {
  baseUrl: string;
}): Promise<{
  ok: boolean;
  status: number;
  live?: LiveRecord[];
  bindable?: string[];
  error?: string;
}> {
  const res = await pullLiveList({ baseUrl: options.baseUrl });
  if (!res.ok) {
    return { ok: false, status: res.status, error: res.error };
  }
  return {
    ok: true,
    status: res.status,
    live: res.live,
    bindable: res.bindable,
  };
}
