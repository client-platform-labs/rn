#!/usr/bin/env node
/**
 * Fixture + registry self-test (Map I / C5 — #259).
 *
 * The harness is itself a probe. `scripts/e2e/lib.sh` is the shell side of this
 * seam and is exercised by the e2e chains; the JS side had no test at all, so
 * its contract (fixture lifecycle, timeouts, exit codes, orphan detection) is
 * asserted here by execution rather than by grep.
 *
 * Also freezes the scaffolding-duplication counts so the 61 hand-rolled harnesses
 * cannot grow back, and asserts the migrated probes declare the fixture.
 *
 * Usage:
 *   node scripts/verify-harness.mjs
 *   node scripts/_run-verify.mjs harness
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

import {
  createHarness,
  computeExitCode,
  emptyRegistry,
  EXIT,
  REPO_ROOT,
} from "./lib/verify/fixture.mjs";
import {
  auditProbes,
  findProbe,
  listProbes,
} from "./lib/verify/registry.mjs";

const SCRIPTS = path.join(REPO_ROOT, "scripts");

/**
 * Probes that declare the fixture instead of rebuilding the scaffolding they
 * used to hand-roll (#259). Their old scaffolding counts are frozen below.
 */
const MIGRATED = [
  "verify-cp-auth.mjs",
  "verify-cp-rbac.mjs",
  "verify-cp-rollout-steps.mjs",
];

/**
 * Post-migration scaffolding counts over `scripts/verify-*.mjs` (excluding this
 * probe, which measures rather than rebuilds). Asserted with `<=` so future
 * migrations lower them and a regression cannot raise them silently.
 */
const FROZEN = {
  "function step": 34,
  "async function fetchJson": 5,
  "registry.json": 19,
  mkdtempSync: 21,
};

const h = createHarness({ name: "verify-harness" });

/**
 * Track accepted sockets so a raw `net.Server` can be closed without waiting
 * for undici's keep-alive connections to lapse (`closeAllConnections` is
 * HTTP-only).
 */
function trackSockets(server) {
  const sockets = new Set();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.destroySockets = () => {
    for (const socket of sockets) socket.destroy();
  };
  return server;
}

await h.run(async () => {
  // ——— exit-code contract ———
  h.step("exit-code contract mirrors chain_done");
  h.assertEq(computeExitCode({}), EXIT.PASS, "no failures -> 0");
  h.assertEq(computeExitCode({ fails: 1 }), EXIT.FAIL, "a failure -> 1");
  h.assertEq(computeExitCode({ skips: 1 }), EXIT.SKIP, "a skip alone -> 2");
  h.assertEq(computeExitCode({ fails: 1, skips: 1 }), EXIT.FAIL, "a failure outranks a skip");
  h.assertNe(EXIT.SKIP, EXIT.PASS, "SKIP is not PASS");

  // ——— project fixture ———
  h.step("project fixture writes a hermetic project and cleans up");
  const child = createHarness({ name: "selftest-project" });
  const p = child.project({ name: "proj" });
  h.assertTruthy(existsSync(p.root), "temp project created");
  h.assertFileExists(path.join(p.root, "package.json"), "package.json written");
  h.assertFileExists(p.registryPath, "delivery registry written");
  h.assertEq(
    Object.keys(p.readRegistry()).length,
    Object.keys(emptyRegistry()).length,
    "registry uses the canonical empty shape",
  );
  h.assertEq(p.readRegistry().staging.length, 0, "staging lane starts empty");

  const p2 = child.project({
    name: "proj2",
    registry: { ...emptyRegistry(), blocked: [{ digest: "bd" }] },
    files: { "sub/x.txt": "hello", "sub/obj.json": { nested: true } },
  });
  h.assertEq(p2.readRegistry().blocked[0].digest, "bd", "registry override honoured");
  h.assertContains(p2.read("sub/x.txt"), "hello", "extra string fixture file written");
  h.assertEq(JSON.parse(p2.read("sub/obj.json")).nested, true, "extra JSON fixture file written");
  h.assertTruthy(p2.exists("sub/x.txt"), "fixture exists() sees written files");

  child.cleanup();
  h.assertTruthy(!existsSync(p.root), "cleanup removes the temp project");
  h.assertTruthy(!existsSync(p2.root), "cleanup removes every tracked project");

  // ——— port allocation ———
  h.step("allocatePort returns a bindable free port");
  const portA = await h.allocatePort();
  const portB = await h.allocatePort();
  h.assertTruthy(portA > 1024 && portA < 65536, `port is in range (${portA})`);
  h.assertNe(portA, portB, "consecutive allocations differ");
  const bindable = await new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(portA, "127.0.0.1", () => srv.close(() => resolve(true)));
  });
  h.assertTruthy(bindable, "the allocated port is actually free");

  // ——— waitForHttp: readiness polling and timeout ———
  h.step("waitForHttp polls to readiness, then times out loudly");
  const httpSrv = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  await new Promise((r) => httpSrv.listen(0, "127.0.0.1", r));
  const livePort = httpSrv.address().port;
  h.assertEq(
    (await h.waitForHttp(`http://127.0.0.1:${livePort}/`)).status,
    200,
    "resolves once the server answers",
  );
  // undici keeps the response socket alive, and `close()` waits for open
  // connections — drop them first or this await never settles.
  httpSrv.closeAllConnections();
  await new Promise((r) => httpSrv.close(r));

  const startedAt = Date.now();
  let timeoutMessage = "";
  try {
    await h.waitForHttp(`http://127.0.0.1:${livePort}/`, { timeoutMs: 400, intervalMs: 50 });
  } catch (err) {
    timeoutMessage = err.message;
  }
  h.assertContains(timeoutMessage, "timed out", "rejects after the timeout");
  h.assertTruthy(
    Date.now() - startedAt >= 380,
    "the timeout is honoured rather than skipped early",
  );

  // A listener that accepts and never replies must not hold the poll open:
  // each attempt is bounded, so the caller's deadline still wins.
  const blackHole = trackSockets(net.createServer(() => {}));
  await new Promise((r) => blackHole.listen(0, "127.0.0.1", r));
  const blackHolePort = blackHole.address().port;
  const blackHoleStart = Date.now();
  let blackHoleMessage = "";
  try {
    await h.waitForHttp(`http://127.0.0.1:${blackHolePort}/`, {
      timeoutMs: 600,
      attemptMs: 200,
      intervalMs: 50,
    });
  } catch (err) {
    blackHoleMessage = err.message;
  }
  h.assertContains(blackHoleMessage, "timed out", "an unresponsive listener still times out");
  h.assertTruthy(
    Date.now() - blackHoleStart < 5_000,
    "an unresponsive listener times out near its deadline, not undici's",
  );
  blackHole.destroySockets();
  await new Promise((r) => blackHole.close(r));

  // ——— control plane ———
  h.step("serve binds a free port, retries a taken one, answers /health");
  const squatter = trackSockets(net.createServer());
  await new Promise((r) => squatter.listen(0, "127.0.0.1", r));
  const takenPort = squatter.address().port;

  // Retry path: the port is taken, so the probe still gets a working CP.
  const cp = await h.serve({ role: "admin", port: takenPort });
  h.assertNe(cp.port, takenPort, "a taken port is not reused");
  const health = await cp.json("/health");
  h.assertStatus(health, 200, "control plane answers /health");
  h.assertEq(health.body.ok, true, "health reports ok:true");
  h.assertStatus(await cp.json("/v1/registry"), 200, "admin reads the registry");
  cp.kill();

  // Exhausted-retry path: the control plane's own diagnostic must survive, so a
  // probe reads why the port was refused rather than a bare fetch error.
  let refusedMessage = "";
  try {
    await h.serve({ role: "admin", port: takenPort, bindRetries: 0, waitMs: 10_000 });
  } catch (err) {
    refusedMessage = err.message;
  }
  h.assertContains(refusedMessage, "different", "a refused port reports a foreign listener");
  h.assertContains(refusedMessage, "SEAM-5/F16", "a refused port names the identity rule");
  squatter.destroySockets();
  await new Promise((r) => squatter.close(r));

  // ——— CLI exit-code mapping and timeouts ———
  h.step("cli maps exit codes and captures both streams");
  const help = await h.cli("ship", ["--help"]);
  h.assertCmdOk(help, "ship --help exits 0");
  h.assertCmdOutputContains(help, "Usage: ship", "ship --help prints usage");
  const bogus = await h.cli("ship", ["definitely-not-a-verb"]);
  h.assertCmdOk(
    { ...bogus, code: bogus.code === 0 ? 1 : 0 },
    "an unknown verb exits non-zero",
  );
  h.assertCmdOutputContains(bogus, "unknown command", "an unknown verb explains itself");

  h.step("timeouts surface as 124, never as a hang");
  const hang = h.project({
    name: "hang",
    files: { "hang.mjs": "setTimeout(() => {}, 30_000);\n" },
  });
  const killed = await h.runNode(path.join(hang.root, "hang.mjs"), [], { timeoutMs: 500 });
  h.assertEq(killed.code, 124, "runNode kills a hung script and reports 124");
  h.assertTruthy(killed.timedOut, "runNode flags the timeout");
  const guarded = await h.runNode(
    path.join(SCRIPTS, "_run-verify.mjs"),
    [path.join(hang.root, "hang.mjs")],
    { timeoutMs: 20_000, env: { VERIFY_TIMEOUT_MS: "700" } },
  );
  h.assertEq(guarded.code, 124, "the runner's wall-clock guard also reports 124");

  // ——— registry: enumeration and derived wiring ———
  h.step("registry enumerates the fleet and derives its wiring");
  const probes = listProbes();
  const onDisk = readdirSync(SCRIPTS)
    .filter((f) => f.startsWith("verify-") && f.endsWith(".mjs"))
    .sort();
  h.assertEq(probes.length, onDisk.length, "listProbes matches the probes on disk");
  h.assertTruthy(probes.length >= 61, `fleet size (${probes.length})`);
  h.assertTruthy(
    probes.every((pr) => pr.rel.startsWith("scripts/") && pr.path.endsWith(pr.base)),
    "every probe reports its path",
  );

  const audit = auditProbes();
  h.assertEq(
    audit.referenced.length + audit.orphans.length,
    audit.total,
    "referenced + orphans partitions the fleet",
  );
  h.assertTruthy(
    audit.orphans.every((pr) => pr.references.length === 0 && !pr.ciReferenced),
    "orphans truly have no automation caller",
  );
  h.assertTruthy(
    audit.ciReferenced.every((pr) => pr.kinds.includes("ci")),
    "CI-referenced probes carry a ci wiring",
  );
  h.assertTruthy(
    audit.dangling.every((d) => !onDisk.includes(d.base)),
    "every dangling reference points at a file that does not exist",
  );
  h.assertTruthy(audit.dangling.length > 0, `dead wiring is visible (${audit.dangling.length})`);

  h.step("findProbe accepts every shape callers use");
  for (const q of [
    "cp-auth",
    "verify-cp-auth",
    "verify-cp-auth.mjs",
    "scripts/verify-cp-auth.mjs",
  ]) {
    h.assertEq(findProbe(q)?.name, "verify-cp-auth", `resolves "${q}"`);
  }
  h.assertEq(findProbe("no-such-probe"), null, "unknown probe resolves to null");

  // ——— orphan detection is derived, so prove it on a synthetic repo ———
  h.step("orphan + dangling detection derives from sources, not a list");
  const synth = h.project({
    name: "synth-repo",
    files: {
      "scripts/verify-wired.mjs": "// probe\n",
      "scripts/verify-ignored.mjs": "// probe\n",
      "scripts/verify-only-commented.mjs": "// probe\n",
      "scripts/run-synth-loop.mjs": 'export const p = "scripts/verify-wired.mjs";\n',
      ".github/workflows/synth.yml": "      - run: node scripts/verify-wired.mjs\n",
    },
  });
  // A probe named only inside a comment is documentation, not an execution path.
  writeFileSync(
    path.join(synth.root, "scripts", "run-synth-loop.mjs"),
    '// node scripts/verify-only-commented.mjs\nexport const p = "scripts/verify-wired.mjs";\n',
  );
  // A `[[ -f ]]`-guarded reference to a probe that is not on disk.
  writeFileSync(
    path.join(synth.root, ".github", "workflows", "synth.yml"),
    '      - run: |\n          if [[ -f scripts/verify-gone.mjs ]]; then node scripts/verify-gone.mjs; fi\n          node scripts/verify-wired.mjs\n',
  );
  const synthAudit = auditProbes({ repoRoot: synth.root });
  h.assertEq(synthAudit.total, 3, "synthetic repo enumerates its 3 probes");
  h.assertEq(
    synthAudit.orphans.map((pr) => pr.name).sort().join(","),
    "verify-ignored,verify-only-commented",
    "orphans = no caller; a comment is not a caller",
  );
  h.assertEq(synthAudit.ciReferenced.length, 1, "only the CI-wired probe is CI-referenced");
  h.assertEq(
    synthAudit.dangling.map((d) => d.base).join(","),
    "verify-gone.mjs",
    "the dangling reference is reported",
  );

  // ——— freeze: the hand-rolled scaffolding must not grow back ———
  h.step("scaffolding duplication is frozen");
  const measured = onDisk.filter((f) => f !== "verify-harness.mjs");
  const fileCountWith = (needle) =>
    measured.filter((f) => readFileSync(path.join(SCRIPTS, f), "utf8").includes(needle))
      .length;
  for (const [needle, bound] of Object.entries(FROZEN)) {
    const now = fileCountWith(needle);
    h.assertTruthy(now <= bound, `${now} files with "${needle}" <= ${bound}`);
  }

  h.step("migrated probes declare the fixture instead of rebuilding it");
  for (const file of MIGRATED) {
    const src = readFileSync(path.join(SCRIPTS, file), "utf8");
    h.assertContains(src, "./lib/verify/fixture.mjs", `${file} imports the fixture`);
    for (const scaffold of ["mkdtempSync", "async function fetchJson", "function step"]) {
      h.assertTruthy(!src.includes(scaffold), `${file} has no ${scaffold}`);
    }
  }

  // ——— the runner exposes and executes the fleet ———
  h.step("the runner lists the fleet and runs a migrated probe");
  const listed = await h.runNode(
    path.join(SCRIPTS, "_run-verify.mjs"),
    ["--list", "--json"],
    { timeoutMs: 30_000 },
  );
  h.assertCmdOk(listed, "--list exits 0");
  let parsedList = [];
  try {
    parsedList = JSON.parse(listed.stdout);
  } catch {
    /* the assertion below reports the failure */
  }
  h.assertEq(parsedList.length, probes.length, "--list enumerates every probe");

  const orphanRun = await h.runNode(
    path.join(SCRIPTS, "_run-verify.mjs"),
    ["--orphans", "--json"],
    { timeoutMs: 30_000 },
  );
  let parsedOrphans = { dangling: [] };
  try {
    parsedOrphans = JSON.parse(orphanRun.stdout);
  } catch {
    /* the assertion below reports the failure */
  }
  // The audit payload is larger than the capture limit used to be; parsing it at
  // all is the regression guard for silent truncation of machine-readable output.
  h.assertTruthy(
    orphanRun.stdout.length > 64 * 1024,
    `audit payload exceeds the old 64KB capture cap (${orphanRun.stdout.length} bytes)`,
  );
  h.assertTruthy(!orphanRun.truncated, "the capture reports no truncation");
  h.assertEq(parsedOrphans.total, probes.length, "the audit covers every probe");
  h.assertEq(
    orphanRun.code,
    parsedOrphans.dangling.length > 0 ? 1 : 0,
    "dead wiring fails the audit, clean wiring passes it",
  );

  const ran = await h.runNode(
    path.join(SCRIPTS, "_run-verify.mjs"),
    ["cp-auth"],
    { timeoutMs: 90_000 },
  );
  h.assertEq(ran.code, 0, "a bare probe name resolves and runs");
  h.assertContains(ran.stdout, "verify-cp-auth: all PASS", "the migrated probe reported PASS");
});
