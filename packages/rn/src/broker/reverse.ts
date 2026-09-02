/**
 * Best-effort `adb reverse` for Metro + Broker ports (#124).
 * Injectable runner for unit tests — never throws; reports per-port results.
 */
import { spawnSyncCapture } from "../process.js";

export type AdbReverseRunner = (
  args: string[],
) => { status: number; stdout: string; stderr: string };

export type ReversePortResult = {
  port: number;
  ok: boolean;
  message: string;
};

export type EnsureBrokerReverseResult = {
  ok: boolean;
  results: ReversePortResult[];
  /** Host Pull URL after reverse (device → host broker). */
  hostPullUrl: string;
};

/**
 * Reverse each tcp:<port> → tcp:<port> on the connected device.
 * Failures are best-effort (USB missing / unauthorized → ok:false, continue).
 */
export function ensureAdbReversePorts(options: {
  ports: number[];
  /** Broker base URL on the host (for Pull documentation). */
  brokerBaseUrl: string;
  runner?: AdbReverseRunner;
}): EnsureBrokerReverseResult {
  const runner =
    options.runner ??
    ((args: string[]) => spawnSyncCapture("adb", args));
  const results: ReversePortResult[] = [];

  for (const port of options.ports) {
    try {
      const r = runner(["reverse", `tcp:${port}`, `tcp:${port}`]);
      if (r.status === 0) {
        results.push({
          port,
          ok: true,
          message: `adb reverse tcp:${port} tcp:${port}`,
        });
      } else {
        results.push({
          port,
          ok: false,
          message: (
            r.stderr ||
            r.stdout ||
            `adb reverse failed status=${r.status}`
          ).trim(),
        });
      }
    } catch (err) {
      results.push({
        port,
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const hostPullUrl = `${options.brokerBaseUrl.replace(/\/$/, "")}/v1/live`;
  return {
    ok: results.length > 0 && results.every((r) => r.ok),
    results,
    hostPullUrl,
  };
}
