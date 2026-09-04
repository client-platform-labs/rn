/**
 * Dual business-pack Live verification (map #149 / #155 / #158).
 *
 * Asserts desk + fixture_second Metros are up with correct identity headers,
 * host-surface bundles reachable, and Broker Live rows match actual ports.
 */
import { MODULE_BUNDLE_HEADER } from "@client-platform/rn-core";

import { probeMetroOnPort, type MetroPortProbe } from "./metro-port-allocate.js";

export type DualPackTarget = {
  moduleId: string;
  preferredPort: number;
  hostSurfaceEntry?: string;
};

export type DualPackLiveVerifyResult = {
  ok: boolean;
  details: string[];
};

function hostSurfaceBundleUrl(port: number, entry: string): string {
  return `http://127.0.0.1:${port}/${entry}.bundle?platform=android&dev=true&minify=false`;
}

async function findModuleMetro(
  target: DualPackTarget,
  probe: (port: number) => Promise<MetroPortProbe>,
  maxScan = 20,
): Promise<{ port: number; probe: MetroPortProbe } | null> {
  for (let i = 0; i <= maxScan; i++) {
    const port = target.preferredPort + i;
    const state = await probe(port);
    if (state.running && state.moduleId === target.moduleId) {
      return { port, probe: state };
    }
  }
  return null;
}

export async function verifyDualPackLive(options: {
  targets: DualPackTarget[];
  brokerBaseUrl?: string;
  probe?: (port: number) => Promise<MetroPortProbe>;
  fetchImpl?: typeof fetch;
}): Promise<DualPackLiveVerifyResult> {
  const details: string[] = [];
  const probe = options.probe ?? probeMetroOnPort;
  const fetchFn = options.fetchImpl ?? fetch;
  let ok = true;

  const resolved: Array<{ moduleId: string; port: number }> = [];

  for (const target of options.targets) {
    const found = await findModuleMetro(target, probe);
    if (!found) {
      ok = false;
      details.push(
        `FAIL ${target.moduleId}: no Metro with header ${MODULE_BUNDLE_HEADER}=${target.moduleId} near :${target.preferredPort}`,
      );
      continue;
    }
    resolved.push({ moduleId: target.moduleId, port: found.port });
    const bumped = found.port !== target.preferredPort;
    details.push(
      `OK ${target.moduleId} Metro :${found.port}${bumped ? ` (preferred :${target.preferredPort} bumped)` : ""}`,
    );

    const entry = target.hostSurfaceEntry ?? "entries/host-surface";
    try {
      const bundleUrl = hostSurfaceBundleUrl(found.port, entry);
      const res = await fetchFn(bundleUrl, { signal: AbortSignal.timeout(60_000) });
      const body = await res.text();
      if (!res.ok) {
        ok = false;
        details.push(`FAIL ${target.moduleId} bundle HTTP ${res.status} ${bundleUrl}`);
      } else if (!body.includes("hermesgfapp") && !body.includes("AppRegistry")) {
        ok = false;
        details.push(
          `FAIL ${target.moduleId} bundle missing hermesgfapp/AppRegistry registration`,
        );
      } else {
        details.push(`OK ${target.moduleId} host-surface bundle`);
      }
    } catch (e) {
      ok = false;
      details.push(
        `FAIL ${target.moduleId} bundle fetch: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  if (options.brokerBaseUrl) {
    try {
      const base = options.brokerBaseUrl.replace(/\/$/, "");
      const res = await fetchFn(`${base}/v1/live`);
      if (!res.ok) {
        ok = false;
        details.push(`FAIL Broker live HTTP ${res.status}`);
      } else {
        const body = (await res.json()) as {
          live?: Array<{
            moduleId: string;
            usbUrl?: string;
            lanUrl?: string;
            probeOk?: boolean;
          }>;
        };
        for (const { moduleId, port } of resolved) {
          const row = body.live?.find((r) => r.moduleId === moduleId);
          if (!row) {
            ok = false;
            details.push(`FAIL Broker missing Live row for ${moduleId}`);
            continue;
          }
          const usbPort = row.usbUrl?.match(/:(\d+)/)?.[1];
          if (usbPort !== String(port)) {
            ok = false;
            details.push(
              `FAIL Broker ${moduleId} usbUrl port ${usbPort ?? "?"} != Metro :${port}`,
            );
          } else {
            details.push(`OK Broker ${moduleId} usbUrl :${port}`);
          }
          if (!row.probeOk) {
            ok = false;
            details.push(`FAIL Broker ${moduleId} probeOk=false`);
          }
          if (row.lanUrl && /127\.0\.0\.1|localhost/i.test(row.lanUrl)) {
            details.push(`WARN Broker ${moduleId} lanUrl is loopback`);
          } else if (row.lanUrl) {
            details.push(`OK Broker ${moduleId} lanUrl set`);
          }
        }
      }
    } catch (e) {
      ok = false;
      details.push(
        `FAIL Broker fetch: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  } else {
    details.push("SKIP Broker (no brokerBaseUrl)");
  }

  return { ok, details };
}

export const DEFAULT_DUAL_PACK_TARGETS: DualPackTarget[] = [
  { moduleId: "desk", preferredPort: 8081 },
  {
    moduleId: "fixture_second",
    preferredPort: 8082,
    hostSurfaceEntry: "entries/host-surface",
  },
];
