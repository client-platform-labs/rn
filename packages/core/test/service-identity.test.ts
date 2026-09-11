import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assessListenerIdentity,
  foreignListenerMessage,
  parseLsofCwd,
  parseLsofListeners,
} from "../dist/service-identity.js";

describe("parseLsofListeners", () => {
  it("extracts pid and command from -F machine output", () => {
    const out = ["p81234", "cnode", "u123"].join("\n");
    assert.deepEqual(parseLsofListeners(out), { pid: "81234", command: "node" });
  });

  it("returns only the first (LISTEN) record", () => {
    const out = ["p111", "cnode", "p222", "cother"].join("\n");
    assert.deepEqual(parseLsofListeners(out), { pid: "111", command: "node" });
  });

  it("returns null when no process is listening", () => {
    assert.equal(parseLsofListeners(""), null);
    assert.equal(parseLsofListeners("COMMAND\n"), null);
  });
});

describe("parseLsofCwd", () => {
  it("reads the n field as the working directory", () => {
    const out = ["p81234", "fcwd", "n/home/dev/app-a"].join("\n");
    assert.equal(parseLsofCwd(out), "/home/dev/app-a");
  });

  it("returns null without an n field", () => {
    assert.equal(parseLsofCwd("p81234\nfcwd"), null);
  });
});

describe("assessListenerIdentity", () => {
  it("accepts same project root (trailing slash tolerant)", () => {
    const r = assessListenerIdentity("/home/dev/app-a/", "/home/dev/app-a");
    assert.equal(r.ok, true);
    assert.equal(r.unknown, false);
  });

  it("rejects a foreign project root", () => {
    const r = assessListenerIdentity("/home/dev/app-b", "/home/dev/app-a");
    assert.equal(r.ok, false);
    assert.equal(r.unknown, false);
    assert.equal(r.servingRoot, "/home/dev/app-b");
  });

  it("flags unknown identity distinctly from a mismatch", () => {
    const r = assessListenerIdentity(null, "/home/dev/app-a");
    assert.equal(r.ok, false);
    assert.equal(r.unknown, true);
  });
});

describe("foreignListenerMessage", () => {
  it("names the service, both roots and the port", () => {
    const msg = foreignListenerMessage({
      service: "Metro",
      port: 8081,
      servingRoot: "/home/dev/app-b",
      expectedRoot: "/home/dev/app-a",
    });
    assert.match(msg, /8081/);
    assert.match(msg, /Metro/);
    assert.match(msg, /app-b/);
    assert.match(msg, /app-a/);
    assert.match(msg, /SEAM-5\/F16/);
  });
});
