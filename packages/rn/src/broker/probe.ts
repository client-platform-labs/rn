/**
 * Metro /status probe stub for Dev Session Broker (#124).
 * Real HTTP probe lands with full Phase B; stub is injectable for tests.
 */
export type MetroProbeResult = { ok: boolean; detail?: string };

export type MetroProbeFn = (usbUrl: string) => Promise<MetroProbeResult>;

/**
 * Default stub: treats any non-empty usbUrl as reachable.
 * Replace with fetch(`${usbUrl}/status`) in production wiring.
 */
export const stubMetroProbe: MetroProbeFn = async (usbUrl) => {
  if (!usbUrl || !/^https?:\/\//i.test(usbUrl)) {
    return { ok: false, detail: "invalid_usb_url" };
  }
  return { ok: true };
};

/** Real-ish probe against Metro /status (best-effort; failures → not ok). */
export const httpMetroProbe: MetroProbeFn = async (usbUrl) => {
  try {
    const base = usbUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/status`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) {
      return { ok: false, detail: `http_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
};
