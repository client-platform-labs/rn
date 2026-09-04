/**
 * Thin Dev Session Broker Push/Pull client (Host-facing).
 *
 * Host Pull URL (after `adb reverse` of Broker port, default 7420):
 *   http://127.0.0.1:<brokerPort>/v1/live
 *
 * Pull is the primary Debug Host path. Push is optional — Broker may push a
 * Live projection into a Host inbox URL when one is configured; without a
 * target this module only offers a documented stub for tests / wiring.
 */
import type { LivePutBody, LiveRecord } from "./live-types.js";

export const DEFAULT_BROKER_PORT = 7420;
export const BROKER_LIVE_PATH = "/v1/live";

export type LiveListResponse = {
  live: LiveRecord[];
  bindable: string[];
};

export type PullLiveResult =
  | {
      ok: true;
      status: number;
      live: LiveRecord[];
      bindable: string[];
      pullUrl: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
      pullUrl: string;
    };

export type PushLiveStubResult = {
  ok: boolean;
  mode: "stub" | "http";
  status: number;
  error?: string;
  target?: string;
};

/** Build `http://127.0.0.1:<port>/v1/live` (or custom host). */
export function brokerLivePullUrl(options?: {
  host?: string;
  port?: number;
  baseUrl?: string;
}): string {
  if (options?.baseUrl) {
    return `${options.baseUrl.replace(/\/$/, "")}${BROKER_LIVE_PATH}`;
  }
  const host = options?.host ?? "127.0.0.1";
  const port = options?.port ?? DEFAULT_BROKER_PORT;
  return `http://${host}:${port}${BROKER_LIVE_PATH}`;
}

/**
 * Host Pull: GET live list from Broker.
 * Documented contract for Debug panels / `rn session status`.
 */
export async function pullLiveList(options?: {
  baseUrl?: string;
  host?: string;
  port?: number;
  fetchImpl?: typeof fetch;
}): Promise<PullLiveResult> {
  const pullUrl = brokerLivePullUrl(options);
  const fetchFn = options?.fetchImpl ?? fetch;
  try {
    const res = await fetchFn(pullUrl);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `http_${res.status}`,
        pullUrl,
      };
    }
    const body = (await res.json()) as LiveListResponse;
    return {
      ok: true,
      status: res.status,
      live: Array.isArray(body.live) ? body.live : [],
      bindable: Array.isArray(body.bindable) ? body.bindable : [],
      pullUrl,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
      pullUrl,
    };
  }
}

/**
 * Optional Push stub.
 *
 * - No `targetUrl` → returns `{ mode: "stub", ok: true }` (documents intent only).
 * - With `targetUrl` → POST the Live list JSON (thin HTTP push for tests / future Host inbox).
 */
export async function pushLiveProjectionStub(options: {
  payload: LiveListResponse;
  /** Host inbox / debug receive URL. Omit → stub-only. */
  targetUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<PushLiveStubResult> {
  if (!options.targetUrl) {
    return { ok: true, mode: "stub", status: 0 };
  }
  const fetchFn = options.fetchImpl ?? fetch;
  try {
    const res = await fetchFn(options.targetUrl, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        kind: "broker_live_push",
        ...options.payload,
      }),
    });
    if (!res.ok) {
      return {
        ok: false,
        mode: "http",
        status: res.status,
        error: `http_${res.status}`,
        target: options.targetUrl,
      };
    }
    return {
      ok: true,
      mode: "http",
      status: res.status,
      target: options.targetUrl,
    };
  } catch (err) {
    return {
      ok: false,
      mode: "http",
      status: 0,
      error: err instanceof Error ? err.message : String(err),
      target: options.targetUrl,
    };
  }
}

/** PUT convenience for module-dev / tests (registers Live on Broker). */
export async function putLiveRecord(options: {
  baseUrl: string;
  moduleId: string;
  body: LivePutBody;
  fetchImpl?: typeof fetch;
}): Promise<
  | { ok: true; status: number; record: LiveRecord; bindable: boolean }
  | { ok: false; status: number; error: string }
> {
  const fetchFn = options.fetchImpl ?? fetch;
  const url = `${options.baseUrl.replace(/\/$/, "")}${BROKER_LIVE_PATH}/${encodeURIComponent(options.moduleId)}`;
  try {
    const res = await fetchFn(url, {
      method: "PUT",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(options.body),
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `http_${res.status}` };
    }
    const json = (await res.json()) as {
      record: LiveRecord;
      bindable: boolean;
    };
    return {
      ok: true,
      status: res.status,
      record: json.record,
      bindable: json.bindable,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
