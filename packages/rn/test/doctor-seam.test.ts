import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import type { ReleaseHygieneCheck } from "@client-platform/core";

import type { DoctorCheck } from "../dist/brownfield-doctor.js";
import {
  collectDoctorIssues,
  createDoctorReaders,
  DOCTOR_CHECK_FAMILIES,
  doctorCheckTag,
  doctorIssueVerdict,
  printDoctorCheckSections,
  runDoctor,
  shellTemplateDriftCheck,
} from "../dist/commands/doctor.js";
import { collectPreflightIssues } from "../dist/preflight-layers.js";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  // test -> rn -> packages -> repo root
  "../../..",
);

// Guard against the wrong-depth mistake (a too-short root makes the scans below
// pass vacuously instead of failing). Note: the sibling
// `architecture-governance.test.ts` uses "../..", which resolves to `packages/`
// and quietly empties its own scan — reported on #260, not fixed here.
assert.ok(
  existsSync(path.join(REPO_ROOT, "pnpm-workspace.yaml")),
  `REPO_ROOT must be the repo root, got ${REPO_ROOT}`,
);

const check = (over: Partial<DoctorCheck> = {}): DoctorCheck => ({
  id: "probe",
  ok: true,
  summary: "probe",
  blocking: false,
  ...over,
});

/** Capturing CliLogger — `rn doctor` writes its payload through writeMachine. */
function captureLogger(): { logger: never; payloads: unknown[]; human: string[] } {
  const payloads: unknown[] = [];
  const human: string[] = [];
  const logger = {
    json: true,
    nonInteractive: true,
    info() {},
    warn() {},
    writeMachine(payload: unknown) {
      payloads.push(payload);
    },
    writeHuman(message: string) {
      human.push(message);
    },
  };
  return { logger: logger as never, payloads, human };
}

/* ───────────────────────── probe 1: one record ───────────────────────── */

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** Index of the `}` closing the `{` at `open`, or -1. */
function matchingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Declarations of the contract-check shape `{ id, ok, summary, blocking }`.
 * Deliberately keyed on the field set, so a renamed copy still counts as a twin.
 */
function findCheckShapeDeclarations(): Array<{ file: string; name: string }> {
  const found: Array<{ file: string; name: string }> = [];
  const packagesDir = path.join(REPO_ROOT, "packages");
  for (const pkg of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue;
    const srcDir = path.join(packagesDir, pkg.name, "src");
    if (!existsSync(srcDir)) continue;
    for (const file of listTsFiles(srcDir)) {
      const text = readFileSync(file, "utf8");
      const re = /(?:export\s+)?(?:type|interface)\s+([A-Za-z0-9_]+)\s*(?:=\s*)?\{/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(text)) !== null) {
        const open = match.index + match[0].length - 1;
        const close = matchingBrace(text, open);
        if (close < 0) break;
        const body = text.slice(open + 1, close);
        const hasAll =
          /\bid\s*[?]?\s*:/.test(body) &&
          /\bok\s*[?]?\s*:/.test(body) &&
          /\bsummary\s*[?]?\s*:/.test(body) &&
          /\bblocking\s*[?]?\s*:/.test(body);
        if (hasAll) {
          found.push({ file: path.relative(REPO_ROOT, file), name: match[1] });
        }
        re.lastIndex = close;
      }
    }
  }
  return found;
}

/**
 * The only declarations of the check shape allowed in the repo.
 *
 * `DoctorCheck` is the record the doctor plane uses. The other two are
 * byte-identical twins in packages this ticket's file scope excluded; they are
 * structurally the same interface to TypeScript, so no consumer needs a cast,
 * but they must be folded into one home by a follow-up (#260 report). Listing
 * them here means a *new* twin fails this probe instead of accumulating.
 */
const ALLOWED_CHECK_SHAPE_TWINS = [
  "packages/rn/src/brownfield-doctor.ts:DoctorCheck",
  "packages/core/src/release-hygiene.ts:ReleaseHygieneCheck",
  "packages/ship/src/validate.ts:DeliveryValidateCheck",
];

describe("doctor check seam (#260) · record", () => {
  it("declares the check shape exactly once in the doctor plane", () => {
    const decls = findCheckShapeDeclarations().map((d) => `${d.file}:${d.name}`);
    const inDoctorPlane = decls.filter((d) => d.startsWith("packages/rn/src/"));
    assert.deepEqual(
      inDoctorPlane,
      ["packages/rn/src/brownfield-doctor.ts:DoctorCheck"],
      "the rn doctor plane must declare the check record exactly once",
    );
  });

  it("allows no check-shape twin beyond the documented allowlist", () => {
    const decls = findCheckShapeDeclarations().map((d) => `${d.file}:${d.name}`);
    assert.deepEqual(
      [...decls].sort(),
      [...ALLOWED_CHECK_SHAPE_TWINS].sort(),
      "a new {id, ok, summary, blocking} twin appeared — unify it or update the allowlist with a reason",
    );
  });

  it("core's ReleaseHygieneCheck stays assignable to the doctor record", () => {
    // Compile-time guard: if core's record drifts, this stops compiling.
    const crossPackage: DoctorCheck[] = [] as ReleaseHygieneCheck[];
    assert.deepEqual(crossPackage, []);
  });
});

/* ────────────── probe 2: one collect, one render, one verdict ────────────── */

/**
 * Remove comments so source assertions count real code, not prose about it.
 * Handles line/block comments and skips over quoted strings.
 */
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const ch = source[i];
    if (quote !== null) {
      if (ch === "\\") {
        out += source.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

describe("doctor check seam (#260) · collapsed loops", () => {
  const source = stripComments(
    readFileSync(path.join(REPO_ROOT, "packages/rn/src/commands/doctor.ts"), "utf8"),
  );

  it("has no per-family issue-push loop left (was 4)", () => {
    const perFamilyLoops =
      source.match(
        /for \(const check of (brownfield|expo|enterprise|release)Checks\)/g,
      ) ?? [];
    assert.deepEqual(perFamilyLoops, [], "per-family push loops must be gone");
  });

  it("collects through the seam exactly once", () => {
    // one declaration + exactly one call site
    assert.equal(source.match(/collectDoctorIssues\(/g)?.length, 2);
    assert.equal(
      source.match(/collectDoctorIssues\(familyChecks, \{ strict \}\)/g)?.length,
      1,
    );
  });

  it("renders through the seam exactly once", () => {
    assert.equal(source.match(/printDoctorCheckSections\(/g)?.length, 2);
    assert.equal(
      source.match(/printDoctorCheckSections\(logger, sections\)/g)?.length,
      1,
    );
  });

  it("derives the verdict from one expression", () => {
    assert.equal(source.match(/const ok = doctorIssueVerdict\(issues\);/g)?.length, 1);
    assert.equal(
      source.match(/const ok = issues\.length === 0;/g),
      null,
      "the old inline verdict must be gone",
    );
  });

  it("keeps host.ok as a gate, not a second verdict", () => {
    // No code reads host.ok: the host family contributes through the collect that
    // owns its gate, and the run verdict is doctorIssueVerdict(issues).
    assert.equal(source.match(/\bhost\.ok\b/g), null);
    assert.match(source, /collectPreflightIssues\(findings, host, \{ strict \}\)/);
  });
});

/* ──────────────────── probe 3: collect / verdict / tags ──────────────────── */

describe("doctor check seam (#260) · escalation and rendering", () => {
  it("escalates a blocking failure without --strict", () => {
    const issues = collectDoctorIssues([
      { id: "enterprise", checks: [check({ ok: false, blocking: true, summary: "gate" })] },
    ]);
    assert.deepEqual(issues, ["[enterprise] gate"]);
    assert.equal(doctorIssueVerdict(issues), false);
  });

  it("keeps a non-blocking failure out of the verdict without --strict", () => {
    const issues = collectDoctorIssues([
      { id: "expo", checks: [check({ ok: false, blocking: false, summary: "gap" })] },
    ]);
    assert.deepEqual(issues, []);
    assert.equal(doctorIssueVerdict(issues), true);
    assert.equal(doctorCheckTag(check({ ok: false, blocking: false }), "WARN"), "WARN");
    assert.equal(doctorCheckTag(check({ ok: false, blocking: false }), "INFO"), "INFO");
  });

  it("lets --strict escalate a non-blocking failure", () => {
    const families = [
      { id: "expo", checks: [check({ ok: false, blocking: false, summary: "gap" })] },
    ];
    assert.deepEqual(collectDoctorIssues(families, { strict: true }), ["[expo] gap"]);
    assert.equal(doctorIssueVerdict(collectDoctorIssues(families, { strict: true })), false);
  });

  it("keeps release hygiene blocking-only even under --strict", () => {
    const families = [
      {
        id: "release",
        checks: [check({ ok: false, blocking: false, summary: "advisory" })],
        strictEscalates: false,
      },
    ];
    assert.deepEqual(collectDoctorIssues(families, { strict: true }), []);
  });

  it("tags rows the way the old per-family loops did", () => {
    assert.equal(doctorCheckTag(check()), "OK  ");
    assert.equal(doctorCheckTag(check({ ok: false, blocking: true })), "NEED");
    // expo rendered advisory gaps as WARN, every other family as INFO.
    assert.equal(doctorCheckTag(check({ ok: false }), "WARN"), "WARN");
    assert.equal(doctorCheckTag(check({ ok: false }), "INFO"), "INFO");
  });

  it("preserves registry order and per-family flags", () => {
    assert.deepEqual(
      DOCTOR_CHECK_FAMILIES.map((f) => [f.id, f.advisory, f.strictEscalates, f.blankBefore]),
      [
        ["brownfield", "INFO", true, true],
        ["expo", "WARN", true, true],
        ["enterprise", "INFO", true, false],
        ["release", "INFO", false, true],
      ],
    );
    assert.equal(
      DOCTOR_CHECK_FAMILIES.filter((f) => f.driftBefore).map((f) => f.id).join(","),
      "enterprise",
      "the F25 drift block renders before exactly one family",
    );
    assert.deepEqual(
      DOCTOR_CHECK_FAMILIES.map((f) => f.appliesTo("greenfield")),
      [false, false, true, true],
    );
    assert.deepEqual(
      DOCTOR_CHECK_FAMILIES.map((f) => f.appliesTo("brownfield")),
      [true, false, true, true],
    );
    assert.deepEqual(
      DOCTOR_CHECK_FAMILIES.map((f) => f.appliesTo("expo")),
      [false, true, true, true],
    );
  });
});

/* ───────────────────── probe 4: host-layer issue family ───────────────────── */

describe("host layer issues (#260)", () => {
  const finding = (over: Partial<Parameters<typeof collectPreflightIssues>[0][number]> = {}) => ({
    id: "git",
    plane: "cli" as const,
    status: "missing" as const,
    summary: "git not on PATH",
    ...over,
  });

  it("contributes nothing while the host layers are OK", () => {
    const findings = [finding()];
    assert.deepEqual(collectPreflightIssues(findings, { ok: true }), []);
    assert.deepEqual(collectPreflightIssues(findings, { ok: false }), ["git not on PATH"]);
  });

  it("never escalates non-missing statuses", () => {
    const findings = [finding({ status: "degraded" }), finding({ status: "info" })];
    assert.deepEqual(collectPreflightIssues(findings, { ok: false }, { strict: true }), []);
  });

  it("escalates assisted and the human-gated iOS step only under --strict", () => {
    const findings = [
      finding({ id: "android-sdk", plane: "assisted", summary: "android-sdk missing" }),
      finding({ id: "ios", plane: "manual", summary: "Xcode missing" }),
      finding({ id: "licenses", plane: "manual", summary: "licenses missing" }),
    ];
    assert.deepEqual(collectPreflightIssues(findings, { ok: false }), []);
    assert.deepEqual(collectPreflightIssues(findings, { ok: false }, { strict: true }), [
      "android-sdk missing",
      "Xcode missing",
    ]);
  });
});

/* ──────────────────────── probe 5: the one renderer ──────────────────────── */

describe("doctor check seam (#260) · renderer", () => {
  it("renders titles, tags, blank lines and the failure-gated hint", () => {
    const { logger, human } = captureLogger();
    printDoctorCheckSections(logger, [
      {
        title: "Expo interop",
        blankBefore: true,
        advisory: "WARN",
        checks: [check({ ok: false, summary: "expo gap" })],
      },
      { blankBefore: false, checks: [check({ summary: "drift line" })] },
      {
        title: "L3f Release hygiene (M2 / G-P0)",
        blankBefore: true,
        advisory: "INFO",
        checks: [check({ ok: false, blocking: true, summary: "dev support present" })],
        hintOnFailure: "  hint: run rn dev-support remove",
      },
    ]);
    assert.deepEqual(human, [
      "",
      "Expo interop",
      "  [WARN] expo gap",
      "  [OK  ] drift line",
      "",
      "L3f Release hygiene (M2 / G-P0)",
      "  [NEED] dev support present",
      "  hint: run rn dev-support remove",
    ]);
  });

  it("suppresses the hint when nothing in the section failed", () => {
    const { logger, human } = captureLogger();
    printDoctorCheckSections(logger, [
      {
        title: "L3f Release hygiene (M2 / G-P0)",
        blankBefore: false,
        checks: [check()],
        hintOnFailure: "  hint: never printed",
      },
    ]);
    assert.deepEqual(human, ["L3f Release hygiene (M2 / G-P0)", "  [OK  ] probe"]);
  });

  it("renders the F25 drift row through the same seam", () => {
    assert.deepEqual(shellTemplateDriftCheck(null).ok, true);
    const { logger, human } = captureLogger();
    printDoctorCheckSections(logger, [
      { blankBefore: true, checks: [shellTemplateDriftCheck("shell template v1 → v3")] },
    ]);
    assert.deepEqual(human, ["", "  [NEED] shell template v1 → v3"]);
  });
});

/* ──────────────── probe 6: shared readers + JSON compatibility ──────────────── */

describe("doctor check seam (#260) · context", () => {
  it("reads the project package.json once per run", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-readers-"));
    try {
      writeFileSync(path.join(root, "package.json"), `{"name":"first"}`);
      const readers = createDoctorReaders(root);
      assert.match(readers.readPackageJsonText() ?? "", /first/);
      // Remove the file: a second disk read would now return undefined.
      rmSync(path.join(root, "package.json"));
      assert.match(
        readers.readPackageJsonText() ?? "",
        /first/,
        "the loader must serve the first read, not touch disk again",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps the --json payload fields consumers already read", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-doctor-json-"));
    const { logger, payloads } = captureLogger();
    try {
      mkdirSync(path.join(root, ".rn"), { recursive: true });
      writeFileSync(path.join(root, "package.json"), `{"name":"payload-probe"}`);
      try {
        await runDoctor({ cwd: root, logger, profile: "greenfield" });
      } catch {
        // doctor throws CliError when it collected issues; the payload is still
        // written first, which is what this probe asserts.
      }
      assert.equal(payloads.length, 1, "doctor must emit exactly one payload");
      const payload = payloads[0] as Record<string, never>;
      for (const key of ["ok", "strict", "profile", "installHome", "host", "project", "autofix"]) {
        assert.ok(key in payload, `payload.${key} missing`);
      }
      const host = payload.host as unknown as Record<string, unknown>;
      const project = payload.project as unknown as Record<string, unknown>;
      assert.ok(Array.isArray(host.findings));
      const layers = host.layers as Record<string, unknown>;
      for (const plane of ["cli", "assisted", "manual"]) {
        assert.ok(Array.isArray(layers[plane]), `host.layers.${plane}`);
      }
      for (const family of ["brownfield", "expo", "enterprise", "releaseHygiene"]) {
        assert.ok(Array.isArray(project[family]), `project.${family} must stay an array`);
      }
      // Greenfield gates brownfield/expo out, but the keys stay present-and-empty.
      assert.deepEqual(project.brownfield, []);
      assert.deepEqual(project.expo, []);
      assert.ok((project.enterprise as unknown[]).length > 0);
      assert.ok((project.releaseHygiene as unknown[]).length > 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
