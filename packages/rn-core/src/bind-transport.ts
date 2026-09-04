/**
 * Dev Bind transport: USB (adb reverse → usbUrl) vs Wi‑Fi/LAN (lanUrl).
 * Map #149 / #153 / #154 — both paths are Destination Done.
 */
export type BindTransport = "usb" | "wifi";

export type ResolveBindMetroUrlInput = {
  transport: BindTransport;
  usbUrl?: string | null;
  lanUrl?: string | null;
};

export type ResolveBindMetroUrlResult =
  | { ok: true; url: string; transport: BindTransport }
  | { ok: false; reason: string };

/**
 * Pick Metro base URL for true Bind execute.
 * Wi‑Fi must not silently fall back to 127.0.0.1 / usbUrl.
 */
export function resolveBindMetroUrl(
  input: ResolveBindMetroUrlInput,
): ResolveBindMetroUrlResult {
  if (input.transport === "usb") {
    const url = input.usbUrl?.trim();
    if (!url) {
      return { ok: false, reason: "usbUrl_required" };
    }
    return { ok: true, url, transport: "usb" };
  }
  const lan = input.lanUrl?.trim();
  if (!lan) {
    return { ok: false, reason: "lanUrl_required_for_wifi" };
  }
  // Guard: Wi‑Fi must not use loopback (that is USB-after-reverse).
  if (/^https?:\/\/(127\.0\.0\.1|localhost)\b/i.test(lan)) {
    return { ok: false, reason: "lanUrl_must_not_be_loopback" };
  }
  return { ok: true, url: lan, transport: "wifi" };
}
