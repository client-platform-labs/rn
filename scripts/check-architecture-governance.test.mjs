import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  checkImportDirection,
  checkEngineAgnosticPurity,
} from "./check-architecture-governance.mjs";

function makePackage(root, pkg, files) {
  const srcDir = path.join(root, "packages", pkg, "src");
  mkdirSync(srcDir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(path.join(srcDir, name), body, "utf8");
  }
}

test("checkImportDirection allows upward-only deps", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "gov-dir-"));
  try {
    makePackage(root, "core", { "a.ts": "" });
    makePackage(root, "shell-core", {
      "b.ts": 'import { x } from "@client-platform/core";\n',
    });
    makePackage(root, "rn-engine", {
      "c.ts": 'import { x } from "@client-platform/core";\n',
    });
    makePackage(root, "rn", {
      "d.ts":
        'import { x } from "@client-platform/core";\nimport { y } from "@client-platform/rn-engine";\n',
    });
    assert.deepEqual(checkImportDirection(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkImportDirection catches reverse dependency (core → rn)", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "gov-rev-"));
  try {
    makePackage(root, "core", {
      "a.ts": 'import { x } from "@client-platform/rn";\n',
    });
    const errors = checkImportDirection(root);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /import-direction/);
    assert.match(errors[0], /forbidden for core/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkImportDirection restricts plugins to contract packages", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "gov-plugin-"));
  try {
    mkdirSync(path.join(root, "plugins", "p1", "src"), { recursive: true });
    writeFileSync(
      path.join(root, "plugins", "p1", "src", "a.ts"),
      'import { x } from "@client-platform/rn";\n',
      "utf8",
    );
    const errors = checkImportDirection(root);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /forbidden for p1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkEngineAgnosticPurity catches react-native import in shell-core", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "gov-rn-"));
  try {
    makePackage(root, "shell-core", {
      "b.ts": 'import { AppRegistry } from "react-native";\n',
    });
    const errors = checkEngineAgnosticPurity(root);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /engine-agnostic/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

