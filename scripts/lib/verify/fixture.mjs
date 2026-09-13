/**
 * Verify fixture (Map I / C5 — #259) — the one fixture interface for
 * `scripts/verify-*.mjs`.
 *
 * Owns the knowledge every probe used to hand-roll: a hermetic temp project, a
 * control-plane instance, CLI invocation, HTTP helpers, assertions, cleanup and
 * the PASS/FAIL/SKIP exit contract. Probes **declare** a fixture instead of
 * building one.
 *
 * Semantics mirror `scripts/e2e/lib.sh`, the shell side of the same seam, so a
 * reader moving between the two harnesses reads the same vocabulary:
 *
 *   e2e/lib.sh              this module
 *   ---------------------   ----------------------
 *   step / ok / err         step / ok / err
 *   warn / skip             warn / skip
 *   assert_eq               assertEq
 *   assert_ne               assertNe
 *   assert_contains         assertContains
 *   assert_file_exists      assertFileExists
 *   assert_cmd_ok           assertCmdOk
 *   assert_cmd_output_...   assertCmdOutputContains
 *   skip_step               skipStep
 *   chain_done -> 0/1/2     done -> computeExitCode() -> 0/1/2
 *
 * Exit contract (identical to chain_done): 0 = all PASS, 1 = at least one FAIL,
 * 2 = no FAIL but at least one SKIP. SKIP is deliberately not PASS.
 */
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Repo root — `scripts/lib/verify` is three levels down. */
export const REPO_ROOT = path.resolve(HERE, "..", "..", "..");

/** PASS / FAIL / SKIP — the same three codes `e2e/lib.sh:chain_done` uses. */
export const EXIT = { PASS: 0, FAIL: 1, SKIP: 2 };

/**
 * Derive the process exit code from the counters (mirrors `chain_done`).
 * Pure so it can be asserted directly without exiting a test process.
 */
export function computeExitCode({ fails = 0, skips = 0 } = {}) {
  if (fails > 0) return EXIT.FAIL;
  if (skips > 0) return EXIT.SKIP;
  return EXIT.PASS;
}

/**
 * Canonical empty delivery registry — the shape `ship`'s own
 * `emptyRegistry()` produces (`packages/ship/src/candidate-store.ts`). Probes
 * that need candidates pass `registry` to `project()`.
 */
export function emptyRegistry() {
  return {
    schemaVersion: 1,
    staging: [],
    production: [],
    gray: [],
    devices: {},
    blocked: [],
    kills: [],
    pauses: [],
    rollouts: [],
    revocations: [],
  };
}

/** The `rn` / `ship` bin entry for a CLI name. */
export function cliBin(name) {
  return path.join(REPO_ROOT, "packages", name, "bin", `${name}.mjs`);
}

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
function paint(code, text) {
  return COLOR ? `\u001b[${code}m${text}\u001b[0m` : text;
}

// Generous, because probes emit machine-readable output (a full audit is 70KB+)
// and a silently truncated payload parses as corrupt data.
/**
 * Per-stream capture limit. Exported so the fixture's own probe can assert the
 * truncation boundary against the real value instead of a copy of it.
 */
export const CAPTURE_LIMIT = 4 * 1024 * 1024;

/**
 * Run a node script and capture both streams. Never throws on a non-zero exit —
 * callers assert on `code` (that is the point: exit codes are the contract).
 */
export function runNode(script, args = [], options = {}) {
  const {
    cwd = REPO_ROOT,
    env,
    timeoutMs = 60_000,
    label = path.basename(script),
  } = options;

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let truncated = false;

    child.stdout.on("data", (c) => {
      if (stdout.length < CAPTURE_LIMIT) stdout += c;
      else truncated = true;
    });
    child.stderr.on("data", (c) => {
      if (stderr.length < CAPTURE_LIMIT) stderr += c;
      else truncated = true;
    });

    // Wall-clock guard. `_run-verify.mjs` also guards; this one keeps a probe
    // from hanging a whole suite when it is invoked directly.
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        code: 127,
        stdout,
        stderr: `${stderr}${err instanceof Error ? err.message : String(err)}`,
        timedOut: false,
        truncated,
        label,
      });
    });

    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      // Truncation must never be silent: a clipped payload reads as bad data.
      if (truncated) {
        console.error(
          `[capture] ${label}: output exceeded ${CAPTURE_LIMIT} bytes and was truncated`,
        );
      }
      resolve({
        // 124 mirrors coreutils `timeout` and `_run-verify.mjs`.
        code: timedOut ? 124 : (code ?? (signal ? 124 : 1)),
        stdout,
        stderr,
        timedOut,
        truncated,
        label,
      });
    });
  });
}

/**
 * A hermetic temp project: `<tmp>/rn-verify-<name>-XXXX` with a `package.json`
 * and a `.rn/delivery/registry.json`. Removed by `harness.cleanup()`.
 */
function createProject(harness, options = {}) {
  const {
    name = "probe",
    registry = emptyRegistry(),
    packageJson = { name: `${name}-demo` },
    files = {},
  } = options;

  const root = mkdtempSync(path.join(tmpdir(), `rn-verify-${name}-`));
  const deliveryDir = path.join(root, ".rn", "delivery");
  mkdirSync(deliveryDir, { recursive: true });
  writeFileSync(
    path.join(root, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  const registryPath = path.join(deliveryDir, "registry.json");
  writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

  for (const [rel, contents] of Object.entries(files)) {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(
      abs,
      typeof contents === "string"
        ? contents
        : `${JSON.stringify(contents, null, 2)}\n`,
    );
  }

  harness._trackDir(root);
  return {
    root,
    name,
    deliveryDir,
    registryPath,
    readRegistry: () => {
      const raw = readFileSync(registryPath, "utf8");
      try {
        return JSON.parse(raw);
      } catch {
        // A malformed fixture registry is a probe bug, not a product signal:
        // name it so the failure points at the fixture instead of surfacing as
        // a bare SyntaxError from deep inside a probe.
        throw new Error(
          `verify fixture: delivery registry is not valid JSON (${registryPath})`,
        );
      }
    },
    writeRegistry: (reg) =>
      writeFileSync(registryPath, `${JSON.stringify(reg, null, 2)}\n`),
    read: (rel) => readFileSync(path.join(root, rel), "utf8"),
    exists: (rel) => existsSync(path.join(root, rel)),
  };
}

/** Allocate a free loopback port instead of guessing one from a random offset. */
export function allocatePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Poll `url` until it answers, instead of `sleep(600)` then hope.
 * Rejects once `timeoutMs` elapses; the caller's message stays actionable.
 *
 * Each attempt is itself bounded by `attemptMs`: a listener that accepts the
 * connection and never replies (a half-dead control plane) would otherwise hold
 * `fetch` open far beyond the caller's deadline, and the poll loop would never
 * get to observe its own timeout.
 */
export async function waitForHttp(url, options = {}) {
  const { timeoutMs = 20_000, intervalMs = 100, attemptMs = 2_000 } = options;
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(Math.max(1, Math.min(attemptMs, remaining))),
      });
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    if (Date.now() >= deadline) break;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `waitForHttp ${url} timed out after ${timeoutMs}ms` +
      (lastError ? ` (last: ${lastError.message})` : ""),
  );
}

/**
 * Create a probe harness. One per probe file.
 *
 * @example
 *   const h = createHarness({ name: "cp-auth" });
 *   const cp = await h.serve({ role: "admin" });
 *   h.assertStatus(await cp.json("/v1/registry"), 200, "registry readable");
 *   h.done();
 */
export function createHarness({ name = "verify" } = {}) {
  let fails = 0;
  let skips = 0;
  let checks = 0;
  const dirs = [];
  const children = new Set();
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    for (const child of children) {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }
    children.clear();
    for (const dir of dirs.splice(0)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best effort — a leaked tmp dir must not fail the probe */
      }
    }
  };

  // Children and temp dirs must never outlive the probe, however it ends.
  process.on("exit", cleanup);
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      cleanup();
      process.exit(130);
    });
  }

  const harness = {
    name,
    get fails() {
      return fails;
    },
    get skips() {
      return skips;
    },
    get checks() {
      return checks;
    },

    // ——— progress (mirrors e2e/lib.sh) ———
    step(label) {
      console.log(`  ${paint(36, "\u25b8")} ${label}`);
    },
    ok(label) {
      checks += 1;
      console.log(`  ${paint(32, "\u2713")} ${label}`);
    },
    warn(label) {
      console.log(`  ${paint(33, "!")} ${label}`);
    },
    skip(label) {
      skips += 1;
      console.log(`  ${paint(33, "\u2298")} ${label}`);
    },
    skipStep(label) {
      harness.skip(label);
    },
    err(msg) {
      checks += 1;
      fails += 1;
      // stdout, like e2e/lib.sh — a verdict line belongs with its context.
      console.log(`  ${paint(31, "\u2717")} ${msg}`);
    },

    // ——— assertions ———
    assertEq(actual, expected, label) {
      if (Object.is(actual, expected)) harness.ok(`${label} (${format(actual)})`);
      else harness.err(`${label} — expected [${format(expected)}] got [${format(actual)}]`);
    },
    assertNe(actual, unexpected, label) {
      if (!Object.is(actual, unexpected)) harness.ok(`${label} (\u2260 ${format(unexpected)})`);
      else harness.err(`${label} — must not equal [${format(unexpected)}]`);
    },
    assertContains(haystack, needle, label) {
      const hay = typeof haystack === "string" ? haystack : JSON.stringify(haystack);
      if (hay.includes(needle)) harness.ok(label);
      else harness.err(`${label} — [${needle}] not found`);
    },
    assertTruthy(value, label) {
      if (value) harness.ok(label);
      else harness.err(`${label} — expected truthy, got [${format(value)}]`);
    },
    assertFileExists(file, label = file) {
      if (existsSync(file)) harness.ok(label);
      else harness.err(`${label} — file missing [${file}]`);
    },
    /** `res` is any `{ status, body }` — assert an HTTP status. */
    assertStatus(res, expected, label) {
      if (res?.status === expected) harness.ok(label);
      else
        harness.err(
          `${label} — expected HTTP ${expected}, got ${res?.status} ${truncate(format(res?.body))}`,
        );
    },
    assertCmdOk(result, label) {
      if (result?.code === 0) harness.ok(label);
      else
        harness.err(
          `${label} — exit ${result?.code}${result?.timedOut ? " (timed out)" : ""}: ${truncate(result?.stderr ?? result?.stdout)}`,
        );
    },
    /**
     * The command must NOT succeed: a gate that is supposed to block. Composing
     * this from assertNe at every call site while saying "expected blocked" in
     * the label was the same assertion written N times — this names the intent.
     */
    assertCmdFails(result, label) {
      if (result?.code !== 0) harness.ok(label);
      else
        harness.err(
          `${label} — expected a non-zero exit, got 0: ${truncate(result?.stdout)}`,
        );
    },
    assertCmdOutputContains(result, needle, label) {
      const hay = `${result?.stdout ?? ""}${result?.stderr ?? ""}`;
      if (hay.includes(needle)) harness.ok(label);
      else
        harness.err(`${label} — [${needle}] not in output: ${truncate(hay)}`);
    },

    // ——— fixture ———
    project(options) {
      return createProject(harness, options);
    },

    /**
     * Start a control plane (`ship serve`) and wait until `/health` answers.
     *
     * Binds a free port by default. A port that cannot host THIS project's
     * control plane is retried on a fresh port up to `bindRetries` times:
     * either EADDRINUSE, or the control plane's own identity refusal (SEAM-5/F16
     * will not silently reuse a port already serving a different project). A
     * leftover listener must not surface as a confusing fetch error.
     *
     * The returned `server.port` / `server.base` are the port actually bound:
     * always address the server through them, never through a captured port.
     */
    async serve(options = {}) {
      const {
        project = harness.project({ name: `${name}-cp` }),
        role,
        token = `verify-${name}-token`,
        env = {},
        port,
        waitMs = 20_000,
        bindRetries = 1,
        args = [],
      } = options;

      const attempt = async (listenPort) => {
        const child = spawn(
          process.execPath,
          [
            cliBin("ship"),
            "serve",
            "--port",
            String(listenPort),
            "--host",
            "127.0.0.1",
            ...args,
          ],
          {
            cwd: project.root,
            stdio: ["ignore", "pipe", "pipe"],
            env: {
              ...process.env,
              RN_CP_TOKEN: token,
              ...(role ? { RN_CP_ROLE: role } : {}),
              ...env,
            },
          },
        );
        children.add(child);
        let stderr = "";
        child.stderr.on("data", (c) => {
          if (stderr.length < CAPTURE_LIMIT) stderr += c;
        });
        const base = `http://127.0.0.1:${listenPort}`;
        // Fail fast when the child dies (usually a refused port) instead of
        // polling /health until the timeout — the diagnostic is in its stderr.
        // Await `close`, not `exit`: `exit` fires before stdio is flushed, so
        // the reason would race away with the message we need to report.
        let settled = false;
        const exited = new Promise((_, reject) => {
          child.once("close", (code) => {
            if (!settled) reject(new Error(`ship serve exited ${code}`));
          });
        });
        exited.catch(() => {}); // a late rejection is not an unhandled rejection
        try {
          await Promise.race([
            waitForHttp(`${base}/health`, { timeoutMs: waitMs }),
            exited,
          ]);
          settled = true;
        } catch (err) {
          child.kill("SIGKILL");
          children.delete(child);
          // The control plane refuses to reuse a port that already serves a
          // different project (identity check), which is not EADDRINUSE — both
          // mean "this port cannot host our CP", and both are retryable.
          const portUnusable =
            /EADDRINUSE|already serving a different control-plane project/.test(stderr);
          throw Object.assign(
            new Error(
              `ship serve failed on :${listenPort} — ${err.message}${stderr ? `\n${truncate(stderr)}` : ""}`,
            ),
            { portUnusable },
          );
        }
        const server = {
          base,
          port: listenPort,
          token,
          role: role ?? "default",
          project,
          child,
          get stderr() {
            return stderr;
          },
          url: (p) => `${base}${p.startsWith("/") ? p : `/${p}`}`,
          /** Valid bearer headers for this server. */
          get auth() {
            return {
              "content-type": "application/json",
              authorization: `Bearer ${token}`,
            };
          },
          /** `{ status, body }` for a path or absolute URL. */
          async json(p, init) {
            const url = p.startsWith("http") ? p : server.url(p);
            const res = await fetch(url, init);
            const body = await res.json().catch(() => ({}));
            return { status: res.status, body };
          },
          async text(p, init) {
            const res = await fetch(p.startsWith("http") ? p : server.url(p), init);
            return { status: res.status, body: await res.text() };
          },
          async post(p, body, init = {}) {
            return server.json(p, {
              method: "POST",
              headers: server.auth,
              body: JSON.stringify(body),
              ...init,
            });
          },
          kill() {
            children.delete(child);
            child.kill("SIGTERM");
          },
        };
        return server;
      };

      let lastError;
      for (let i = 0; i <= bindRetries; i += 1) {
        // Only the first attempt honours a caller-supplied port; a retry means
        // that port is taken, and the probe wants a working CP, not that number.
        const listenPort = i === 0 && port ? port : await allocatePort();
        try {
          return await attempt(listenPort);
        } catch (err) {
          if (!err.portUnusable) throw err;
          lastError = err;
        }
      }
      throw lastError;
    },

    /** Invoke `packages/<name>/bin/<name>.mjs` and capture exit code + streams. */
    cli(cliName, args = [], options = {}) {
      return runNode(cliBin(cliName), args, {
        label: `${cliName} ${args.join(" ")}`.trim(),
        ...options,
      });
    },

    /** Invoke an arbitrary node script (used by the fixture's own probe). */
    runNode,

    /** `{ status, body }` from an absolute URL or a server-relative path. */
    async json(url, init, server) {
      const target = url.startsWith("http") || !server ? url : server.url(url);
      const res = await fetch(target, init);
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    },

    waitForHttp,
    allocatePort,

    _trackDir(dir) {
      dirs.push(dir);
    },

    cleanup,

    /**
     * Run a probe body and finish it: any thrown error becomes one `err` and
     * the probe still exits through the normal verdict. Removes the
     * try/catch-and-remember-flag boilerplate every probe used to carry.
     * Never returns.
     */
    async run(body) {
      try {
        await body();
      } catch (err) {
        harness.err(err instanceof Error ? err.message : String(err));
      }
      harness.done();
    },

    /**
     * Print the verdict and exit. Mirrors `chain_done`: FAIL > SKIP > PASS.
     * Never returns.
     */
    done() {
      const code = computeExitCode({ fails, skips });
      cleanup();
      if (code === EXIT.FAIL) {
        console.log(`  ${paint(31, "\u2717")} ${name}: ${fails} FAIL, ${skips} SKIP`);
      } else if (code === EXIT.SKIP) {
        console.log(`  ${paint(33, "!")} ${name}: all OK with ${skips} SKIP`);
      } else {
        console.log(`  ${paint(32, "\u2713")} ${name}: all PASS (${checks} checks)`);
      }
      process.exit(code);
    },
  };

  return harness;
}

function format(value) {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncate(text, max = 400) {
  const s = text ?? "";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
