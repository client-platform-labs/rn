/**
 * `rn session status` — list Live records from Dev Session Broker (#124).
 */
import { CliError, EXIT_FAIL } from "../errors.js";
import type { CliLogger } from "../logger.js";
import {
  DEFAULT_BROKER_PORT,
  fetchLiveStatus,
} from "../broker/server.js";

export async function runSessionStatus(options: {
  logger: CliLogger;
  baseUrl?: string;
  host?: string;
  port?: number;
}): Promise<void> {
  const baseUrl =
    options.baseUrl ??
    `http://${options.host ?? "127.0.0.1"}:${options.port ?? DEFAULT_BROKER_PORT}`;

  const res = await fetchLiveStatus({ baseUrl });
  if (!res.ok) {
    throw new CliError(
      `Dev Session Broker unreachable at ${baseUrl}` +
        (res.error ? `: ${res.error}` : ` (HTTP ${res.status})`),
      EXIT_FAIL,
    );
  }

  const live = res.live ?? [];
  const bindable = new Set(res.bindable ?? []);
  options.logger.writeHuman(`Broker ${baseUrl} — ${live.length} live record(s)`);
  if (live.length === 0) {
    options.logger.writeHuman("  (empty — run rn module dev to register)");
    return;
  }
  for (const r of live) {
    const flags = [
      r.probeOk ? "probe_ok" : "probe_fail",
      r.stale ? "stale" : "fresh",
      bindable.has(r.moduleId) ? "bindable" : "not_bindable",
    ].join(",");
    options.logger.writeHuman(
      `  ${r.moduleId}  ${r.usbUrl}  [${flags}]  hb=${r.heartbeatAt}`,
    );
  }
}
