import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import {
  resolveDefaultEmbedOut,
  resolveProductApp,
} from "../dist/commands/catalog.js";

const fixtures: string[] = [];

after(() => {
  for (const dir of fixtures) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolveProductApp", () => {
  it("strips -host suffix from cwd basename", () => {
    const root = mkdtempSync(path.join(tmpdir(), "tiangong-host-"));
    fixtures.push(root);
    const hostCwd = path.join(root, "tiangong-host");
    mkdirSync(hostCwd);
    assert.equal(resolveProductApp(hostCwd), "tiangong");
  });

  it("reads productApp from host-profile.jsonc", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-pa-"));
    fixtures.push(root);
    mkdirSync(path.join(root, ".rn"));
    writeFileSync(
      path.join(root, ".rn", "host-profile.jsonc"),
      `{\n  "profile": "greenfield",\n  "productApp": "tiangong"\n}\n`,
      "utf8",
    );
    assert.equal(resolveProductApp(root), "tiangong");
  });

  it("explicit flag wins", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-pa-"));
    fixtures.push(root);
    assert.equal(resolveProductApp(root, "explicit-app"), "explicit-app");
  });
});

describe("resolveDefaultEmbedOut", () => {
  it("prefers assets/catalog-embed.json when assets/ exists", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-embed-"));
    fixtures.push(root);
    mkdirSync(path.join(root, "assets"));
    mkdirSync(path.join(root, ".rn"));
    assert.equal(
      resolveDefaultEmbedOut(root),
      path.join(root, "assets", "catalog-embed.json"),
    );
  });

  it("honors --no-embed", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-embed-"));
    fixtures.push(root);
    mkdirSync(path.join(root, "assets"));
    assert.equal(resolveDefaultEmbedOut(root, { noEmbed: true }), undefined);
  });
});
