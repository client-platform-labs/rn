/**
 * #263 — the "declaration → derived" pipeline has exactly ONE regeneration
 * primitive, and each derived artifact's definition exists once across the seam.
 *
 * Probes (the ticket's 验收探针, machine-checked):
 *  1. the three artifact writers are called from declaration-derived.ts only;
 *  2. `rn module register` writes byte-identical artifacts to the primitive
 *     alone, is idempotent, and re-derives from the declaration;
 *  3. `readHostContextFromSidecar` has exactly one definition across the seam.
 */
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { regenerateDerivedArtifacts } from "../dist/declaration-derived.js";
import { runModuleRegister } from "../dist/commands/module.js";
import { applyIndustrialShell } from "../dist/industrial-shell.js";
import {
  applyTopologyBAfterInit,
  GENERATED_REGISTRY_RELATIVE,
  linkModuleToDevSession,
  scaffoldModuleWorkspace,
} from "../dist/module-workspace.js";
import { HOST_METRO_RESOLVER_RELATIVE } from "../dist/host-metro-config.js";
import { GENERATED_RUNTIME_RELATIVE } from "../dist/runtime-config.js";
import type { CliLogger } from "../dist/logger.js";

/** packages/rn — same anchor the other template-reading tests use. */
const RN_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const PACKAGES_ROOT = path.resolve(RN_ROOT, "..");
const DERIVED_ARTIFACT_RELATIVES = [
  GENERATED_REGISTRY_RELATIVE,
  HOST_METRO_RESOLVER_RELATIVE,
  GENERATED_RUNTIME_RELATIVE,
] as const;
const WRITE_ENTRY_POINTS = [
  { name: "writeModuleRegistry", call: /\bwriteModuleRegistry\(/ },
  { name: "writeHostMetroResolver", call: /\bwriteHostMetroResolver\(/ },
  { name: "writeGeneratedRuntime", call: /\bwriteGeneratedRuntime\(/ },
] as const;

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      out.push(...walkTs(path.join(dir, entry.name)));
    } else if (entry.name.endsWith(".ts")) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function seedProject(root: string): void {
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "app", dependencies: { "react-native": "0.87.0" } }),
  );
  writeFileSync(
    path.join(root, "App.tsx"),
    "export default function App(){return null}\n",
  );
}

/** A product-shaped project: shell + declared `main` module (topology B). */
function seededTopologyBProject(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(path.join(tmpdir(), "rn-c7-"));
  seedProject(root);
  applyTopologyBAfterInit(root);
  applyIndustrialShell(root);
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function recordingLogger(): { logger: CliLogger; lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    logger: {
      json: false,
      nonInteractive: true,
      info: () => {},
      warn: () => {},
      writeMachine: () => {},
      writeHuman: (message: string) => {
        lines.push(message);
      },
    },
  };
}

function readArtifacts(root: string): Record<string, string> {
  return Object.fromEntries(
    DERIVED_ARTIFACT_RELATIVES.map((rel) => [
      rel,
      // The host-resolver embeds this project's absolute root (watchFolders);
      // normalize it so two identically-declared projects are comparable.
      readFileSync(path.join(root, rel), "utf8").split(root).join("<PROJECT_ROOT>"),
    ]),
  );
}

describe("#263 declaration → derived: one regeneration primitive", () => {
  it("probe 1 — the three artifact writers are called only from declaration-derived.ts", () => {
    const srcDir = path.join(RN_ROOT, "src");
    const files = walkTs(srcDir);
    for (const { name, call } of WRITE_ENTRY_POINTS) {
      const declaring = files.filter((file) =>
        readFileSync(file, "utf8").includes(`export function ${name}(`),
      );
      assert.equal(
        declaring.length,
        1,
        `${name} must be declared exactly once, found: ${declaring.join(", ")}`,
      );
      const callers = files
        .filter((file) => !declaring.includes(file))
        .filter((file) => call.test(readFileSync(file, "utf8")))
        .map((file) => path.relative(srcDir, file))
        .sort();
      assert.deepEqual(
        callers,
        ["declaration-derived.ts"],
        `${name} may only be called from the primitive — a second write entry point lets declaration and derived artifacts drift (F13)`,
      );
    }
  });

  it("probe 2a — rn module register writes byte-identical artifacts to the primitive alone", async () => {
    const viaCommand = seededTopologyBProject();
    const viaPrimitive = seededTopologyBProject();
    try {
      // Baseline = the primitive alone, on an identically declared project.
      regenerateDerivedArtifacts(viaPrimitive.root);
      const expected = readArtifacts(viaPrimitive.root);

      await runModuleRegister({
        cwd: viaCommand.root,
        logger: recordingLogger().logger,
      });

      assert.deepEqual(
        readArtifacts(viaCommand.root),
        expected,
        "rn module register must produce exactly what the primitive produces",
      );
      // Non-trivial: the declared module really is in the registry.
      assert.match(expected[GENERATED_REGISTRY_RELATIVE], /moduleId: "main"/);
    } finally {
      viaCommand.cleanup();
      viaPrimitive.cleanup();
    }
  });

  it("probe 2b — the command renders the paths the primitive reported, in order", async () => {
    const project = seededTopologyBProject();
    try {
      const { logger, lines } = recordingLogger();
      await runModuleRegister({ cwd: project.root, logger });
      assert.deepEqual(lines, [
        `Wrote generated registry: ${GENERATED_REGISTRY_RELATIVE}`,
        `Wrote host Metro resolver: ${HOST_METRO_RESOLVER_RELATIVE}`,
        `Wrote generated runtime: ${GENERATED_RUNTIME_RELATIVE}`,
      ]);
    } finally {
      project.cleanup();
    }
  });

  it("probe 2c — register is idempotent and re-derives from the declaration", async () => {
    const project = seededTopologyBProject();
    try {
      const first = recordingLogger();
      await runModuleRegister({ cwd: project.root, logger: first.logger });
      const afterFirst = readArtifacts(project.root);

      const second = recordingLogger();
      await runModuleRegister({ cwd: project.root, logger: second.logger });
      assert.deepEqual(readArtifacts(project.root), afterFirst, "second run must be byte-identical");
      assert.deepEqual(second.lines, first.lines, "second run must report identically");

      // Change the DECLARATION only → the derived registry follows it.
      scaffoldModuleWorkspace({ projectRoot: project.root, moduleId: "checkout" });
      linkModuleToDevSession({ projectRoot: project.root, moduleId: "checkout" });
      await runModuleRegister({ cwd: project.root, logger: recordingLogger().logger });
      const registry = readFileSync(
        path.join(project.root, GENERATED_REGISTRY_RELATIVE),
        "utf8",
      );
      assert.match(registry, /moduleId: "main"/);
      assert.match(registry, /moduleId: "checkout"/);
    } finally {
      project.cleanup();
    }
  });

  it("probe 3 — readHostContextFromSidecar has exactly one definition across the seam", () => {
    const definition = "export function readHostContextFromSidecar";
    const searchRoots = [
      ...["core", "rn-engine", "shell-core", "ship", "rn"].map((pkg) =>
        path.join(PACKAGES_ROOT, pkg, "src"),
      ),
      path.join(RN_ROOT, "templates"),
    ];
    const definers = searchRoots
      .filter((dir) => {
        try {
          return readdirSync(dir).length > 0;
        } catch {
          return false;
        }
      })
      .flatMap((dir) => walkTs(dir))
      .filter((file) => readFileSync(file, "utf8").includes(definition))
      .map((file) => path.relative(PACKAGES_ROOT, file));

    assert.deepEqual(
      definers,
      [path.join("shell-core", "src", "host-context.ts")],
      "the seam must define host-context once (shell-core); a second copy drifts",
    );

    const template = readFileSync(
      path.join(RN_ROOT, "templates/industrial-shell/shell/hostContext.ts.template"),
      "utf8",
    );
    assert.doesNotMatch(template, /function readHostContextFromSidecar/);
    assert.match(template, /from "@client-platform\/shell-core"/);
  });

  it("probe 3b — the generated shell re-exports the shell-core definition (no local body)", () => {
    const project = seededTopologyBProject();
    try {
      const generated = readFileSync(
        path.join(project.root, "shell", "hostContext.ts"),
        "utf8",
      );
      assert.doesNotMatch(generated, /function readHostContextFromSidecar/);
      assert.match(generated, /from "@client-platform\/shell-core"/);
      assert.doesNotMatch(generated, /\{\{/, "no unrendered template placeholders");
    } finally {
      project.cleanup();
    }
  });
});
