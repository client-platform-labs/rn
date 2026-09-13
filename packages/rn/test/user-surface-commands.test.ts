import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

/**
 * #265 — user-surface contract for command hints.
 *
 * The platform spent months telling operators to run `apply-ota`, a name that is
 * neither a bin nor a registered command anywhere in this repo: three
 * user-visible surfaces (`ship keygen` output, `ship keygen --cert` next-steps,
 * the doctor's remediation) printed it, so copying the advice could only fail
 * with "command not found". #265 replaced it with a real entry point and this
 * probe is the guard, in two halves:
 *
 *   1. no user surface may name an invocable command that is not prefixed by a
 *      real bin (`rn …` / `ship …` / a path) — i.e. no bare phantom verbs;
 *   2. every command the hints DO name must resolve in the real command table.
 *
 * (2) is what makes (1) more than a ban on one historic string: the resolution
 * check is executed against the built CLI, so a rename on either side fails.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../..");
const SHELL_SRC_DIRS = [
  path.join(REPO_ROOT, "packages/rn/src"),
  path.join(REPO_ROOT, "packages/ship/src"),
];
const RN_BIN = path.join(REPO_ROOT, "packages/rn/bin/rn.mjs");

/**
 * Files owned by another in-flight lane that still print the phantom name. The
 * invariant is repo-wide; this list exists only so this lane does not have to
 * edit files it does not own, and it must be EMPTY once that lane lands (it
 * replaces the same hint text in enterprise-doctor.ts). Kept as a subset check
 * on purpose: an emptied list must not fail the probe.
 */
const PENDING_OTHER_LANES: readonly string[] = [
  "packages/rn/src/enterprise-doctor.ts",
];

/** The form that could be copy-pasted: a bare verb immediately taking a flag. */
/* eslint-disable-next-line no-control-regex */
const BARE_PHANTOM_RE = /\bapply-ota(?:-to-project\.mjs)?\s+--/;

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

/** Source files a user's output is generated from, plus the copied templates. */
function userSurfaceSources(): string[] {
  const files = SHELL_SRC_DIRS.flatMap((d) =>
    walkFiles(d).filter((f) => f.endsWith(".ts")),
  );
  const templateDir = path.join(REPO_ROOT, "packages/rn/templates/ota-android");
  return [
    ...files,
    ...walkFiles(templateDir).filter((f) => !f.endsWith(".md")),
  ];
}

/**
 * Every `rn <verb> [<verb>]` a user is told to run, taken from the hint strings
 * themselves so the check tracks the text rather than a hardcoded list.
 */
function namedRnCommands(): string[] {
  const hintSources = [
    path.join(REPO_ROOT, "packages/ship/src/cli.ts"),
    path.join(REPO_ROOT, "packages/ship/src/keygen.ts"),
    path.join(REPO_ROOT, "packages/rn/src/commands/ota.ts"),
  ];
  const found = new Set<string>();
  for (const file of hintSources) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/\brn ([a-z][a-z-]*)(?: ([a-z][a-z-]*))?/g)) {
      found.add(["rn", m[1], m[2]].filter(Boolean).join(" ").trim());
    }
  }
  return [...found].sort();
}

/**
 * The command table a user would actually read: `<parent> --help`.
 *
 * Resolution is checked against this text rather than against an exit code,
 * because `--help` ALWAYS exits 0 (commander reports `helpDisplayed`, which the
 * CLI maps to success) — so an exit-code check would pass for any name and
 * prove nothing. The same trap is why the phantom `apply-ota` survived: nothing
 * ever asked whether the named thing existed.
 */
function commandTable(...parent: string[]): string {
  const r = spawnSync(process.execPath, [RN_BIN, ...parent, "--help"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return `${r.stdout ?? ""}${r.stderr ?? ""}`;
}

/**
 * A command is listed when it appears as its own row. `^ {2}` (exactly two
 * leading spaces) keeps wrapped description prose from matching, and the
 * `\s|$` tail keeps `dev` from matching `dev-support`.
 */
function listsCommand(table: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^ {2}${escaped}(?:\\s|$)`, "m").test(table);
}

/** `rn <noun> [<verb>]` resolves when every segment is listed by its parent. */
function resolves(cmd: string): boolean {
  const [, noun, verb] = cmd.split(" ");
  if (!noun || !listsCommand(commandTable(), noun)) return false;
  if (!verb) return true;
  return listsCommand(commandTable(noun), verb);
}

describe("#265 — user surfaces name only real commands", () => {
  it("no source names a bare phantom command (the `apply-ota` class)", () => {
    const offenders = userSurfaceSources()
      .filter((f) => BARE_PHANTOM_RE.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(REPO_ROOT, f))
      .sort();

    assert.deepEqual(
      offenders.filter((f) => !PENDING_OTHER_LANES.includes(f)),
      [],
      "a user-visible hint names a command that is not prefixed by a real bin",
    );
  });

  it("the historical phantom name is gone from the surfaces #265 owns", () => {
    const owned = [
      "packages/ship/src/cli.ts",
      "packages/ship/src/keygen.ts",
      "packages/rn/templates/ota-android/OtaModule.kt.template",
      "packages/rn/templates/ota-android/README.md",
    ];
    for (const rel of owned) {
      const src = readFileSync(path.join(REPO_ROOT, rel), "utf8");
      assert.doesNotMatch(
        src,
        /\bapply-ota\s+--/,
        `${rel} must not print the phantom command`,
      );
    }
  });

  it("every command the hints name resolves in the real command table", () => {
    const named = namedRnCommands();
    assert.ok(
      named.includes("rn ota install"),
      `the hints must name the new entry point; found: ${named.join(", ")}`,
    );
    for (const cmd of named) {
      assert.ok(resolves(cmd), `"${cmd}" is named in user-facing output but is not a real command`);
    }
  });

  it("NEGATIVE CONTROL: the resolution check can fail", () => {
    // Proves the assertion above is not vacuous. Both a fabricated noun and a
    // fabricated verb under a real noun must be reported unresolved — this is
    // the check that would have caught the original `apply-ota` hints.
    assert.equal(resolves("rn definitely-not-a-real-noun"), false);
    assert.equal(resolves("rn ota definitely-not-a-real-verb"), false);
    // ...and a real one still resolves, so the check is not simply "false".
    assert.equal(resolves("rn ota install"), true);
  });
});
