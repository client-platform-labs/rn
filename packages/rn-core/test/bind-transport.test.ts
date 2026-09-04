import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveBindMetroUrl } from "../dist/bind-transport.js";

describe("resolveBindMetroUrl", () => {
  it("usb uses usbUrl", () => {
    const r = resolveBindMetroUrl({
      transport: "usb",
      usbUrl: "http://127.0.0.1:8081",
      lanUrl: "http://192.168.1.8:8081",
    });
    assert.deepEqual(r, {
      ok: true,
      url: "http://127.0.0.1:8081",
      transport: "usb",
    });
  });

  it("wifi requires non-loopback lanUrl", () => {
    assert.equal(
      resolveBindMetroUrl({
        transport: "wifi",
        usbUrl: "http://127.0.0.1:8081",
      }).ok,
      false,
    );
    const bad = resolveBindMetroUrl({
      transport: "wifi",
      lanUrl: "http://127.0.0.1:8081",
    });
    assert.equal(bad.ok, false);
    const good = resolveBindMetroUrl({
      transport: "wifi",
      lanUrl: "http://192.168.1.8:8081",
    });
    assert.deepEqual(good, {
      ok: true,
      url: "http://192.168.1.8:8081",
      transport: "wifi",
    });
  });

  it("usb returns usbUrl shape regardless of lanUrl (#155 shape contract)", () => {
    // Map #155 — usb resolver MUST return the adb-reverse loopback URL,
    // never the LAN URL. Caller picks `transport: "usb"` to opt into USB.
    const r = resolveBindMetroUrl({
      transport: "usb",
      usbUrl: "http://127.0.0.1:8081",
      lanUrl: "http://192.168.1.8:8081",
    });
    assert.ok(r.ok);
    assert.equal(r.url, "http://127.0.0.1:8081");
    assert.equal(r.transport, "usb");
    assert.match(r.url, /^https?:\/\/(127\.0\.0\.1|localhost)/);
  });

  it("wifi returns lanUrl shape and rejects loopback (#155 shape contract)", () => {
    // Map #155 — wifi resolver MUST return the LAN URL and refuse loopback.
    const r = resolveBindMetroUrl({
      transport: "wifi",
      lanUrl: "http://192.168.1.8:8081",
    });
    assert.ok(r.ok);
    assert.equal(r.url, "http://192.168.1.8:8081");
    assert.equal(r.transport, "wifi");
    assert.doesNotMatch(r.url, /^https?:\/\/(127\.0\.0\.1|localhost)/);
  });

  it("usb requires usbUrl; wifi requires lanUrl (mutually exclusive)", () => {
    const noUsbUrl = resolveBindMetroUrl({ transport: "usb" });
    assert.equal(noUsbUrl.ok, false);
    assert.equal(
      noUsbUrl.ok === false ? noUsbUrl.reason : "",
      "usbUrl_required",
    );
    const noLanUrl = resolveBindMetroUrl({ transport: "wifi" });
    assert.equal(noLanUrl.ok, false);
    assert.equal(
      noLanUrl.ok === false ? noLanUrl.reason : "",
      "lanUrl_required_for_wifi",
    );
  });
});

