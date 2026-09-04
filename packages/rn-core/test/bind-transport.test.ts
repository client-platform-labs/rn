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
});
