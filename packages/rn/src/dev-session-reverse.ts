/**
 * Unified adb reverse for Dev Session ports (shell + broker + business Metros).
 */
import { ensureAdbReversePorts, type AdbReverseRunner } from "./broker/reverse.js";
import type { CliLogger } from "./logger.js";

export function ensureDevSessionReverse(input: {
  ports: number[];
  brokerBaseUrl: string;
  logger?: CliLogger;
  runner?: AdbReverseRunner;
}): { ok: boolean; hostPullUrl: string; messages: string[] } {
  const unique = [...new Set(input.ports.filter((p) => p > 0))].sort(
    (a, b) => a - b,
  );
  const r = ensureAdbReversePorts({
    ports: unique,
    brokerBaseUrl: input.brokerBaseUrl,
    runner: input.runner,
  });
  const messages = r.results.map((x) => `${x.ok ? "ok" : "fail"}:${x.message}`);
  for (const m of messages) {
    input.logger?.writeHuman(`  reverse: ${m}`);
  }
  return { ok: r.ok, hostPullUrl: r.hostPullUrl, messages };
}
