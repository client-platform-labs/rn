import { existsSync } from "node:fs";
import path from "node:path";
import {
  findManifestRoot,
  MANIFEST_FILENAME,
} from "@client-platform/rn-core";
import { ensureMetroBridge } from "../android-dev-bridge.js";
import {
  buildAndroidInstallArgs,
  gateAndroidInstall,
  type DevTransportMode,
  parseDevTransportMode,
  resolveDevTransportMode,
  setupDevTransport,
} from "../dev-transport.js";
import { CliError, EXIT_FAIL } from "../errors.js";
import { androidHostChildEnv, probeAndroidHost } from "../host-env.js";
import type { CliLogger } from "../logger.js";
import {
  listModulePorts,
  loadDevSessionConfig,
} from "../dev-session-config.js";
import { writeDevSessionContributions } from "../dev-session-plugins.js";
import { DEV_SUPPORT_MODULE_DIR } from "../dev-support/constants.js";
import {
  type MetroAfterPlatform,
  ensureMultiMetroSessions,
  runPlatformWithMetro,
} from "../metro-orchestrator.js";
import {
  ensureHostShellDevSession,
  runHostShellMetroForeground,
} from "../shell-dev-orchestrate.js";
import { resolveHostShellPreferredPort } from "../shell-dev-session.js";
import { commandExists, resolveNpx, runStreaming } from "../process.js";

function resolveProjectRoot(cwd: string): string {
  const manifestRoot = findManifestRoot(cwd);
  if (manifestRoot) {
    return manifestRoot;
  }
  if (existsSync(path.join(cwd, "package.json"))) {
    return path.resolve(cwd);
  }
  throw new CliError(
    `No ${MANIFEST_FILENAME} or package.json found — run from an rn init project`,
    EXIT_FAIL,
  );
}

function hasReactNativeScripts(projectRoot: string): boolean {
  return (
    existsSync(path.join(projectRoot, "node_modules", "react-native")) ||
    existsSync(path.join(projectRoot, "android")) ||
    existsSync(path.join(projectRoot, "ios"))
  );
}

function logDevTransportSetup(
  logger: CliLogger,
  transport: ReturnType<typeof setupDevTransport>,
  android: ReturnType<typeof probeAndroidHost>,
): void {
  if (!transport.ok) {
    throw new CliError(transport.message, EXIT_FAIL);
  }
  logger.writeHuman(transport.message);
  logger.writeHuman(
    `adb: ${android.adbPath}${android.adbOnPath ? "" : " (via ANDROID_HOME/platform-tools)"}`,
  );
  if (transport.selectedDevice) {
    logger.writeHuman(
      `device: ${transport.selectedDevice.serial} (transport: ${transport.mode})`,
    );
  }
  const { probe } = transport;
  if (probe.sessionReady) {
    logger.writeHuman("dev session: bridge + Metro ready");
  } else if (transport.mode !== "lan" && probe.bridgeReady) {
    logger.writeHuman("dev session: device bridge ready");
  } else if (transport.mode === "lan") {
    logger.writeHuman("dev session: LAN — ensure phone and Mac on same network");
  }
}

function isAndroidBuildWarm(projectRoot: string): boolean {
  return existsSync(
    path.join(projectRoot, "android", "app", "build", "outputs", "apk", "debug"),
  );
}

function resolveMetroAfterPlatform(options: {
  stopMetro?: boolean;
  detachMetro?: boolean;
}): MetroAfterPlatform {
  if (options.stopMetro) {
    return "stop";
  }
  if (options.detachMetro) {
    return "detach";
  }
  return "foreground";
}

export async function runDev(options: {
  cwd: string;
  logger: CliLogger;
  android?: boolean;
  ios?: boolean;
  metroOnly?: boolean;
  noMetro?: boolean;
  stopMetro?: boolean;
  detachMetro?: boolean;
  transport?: DevTransportMode;
  device?: string;
  activeArchOnly?: boolean;
  /** Comma-separated business_module ids → parallel Metro (#17). */
  modules?: string;
  /** Custom shell Metro port (default: smart allocate from dev-session). */
  port?: number;
}): Promise<void> {
  const projectRoot = resolveProjectRoot(options.cwd);
  if (!hasReactNativeScripts(projectRoot)) {
    throw new CliError(
      "Project does not look like a React Native app (missing react-native / ios / android). Run `rn init` first.",
      EXIT_FAIL,
    );
  }

  if (options.metroOnly && (options.android || options.ios)) {
    throw new CliError(
      "pass only one of --metro-only, --android, or --ios",
      EXIT_FAIL,
    );
  }

  if (options.stopMetro && options.detachMetro) {
    throw new CliError("pass only one of --stop-metro or --detach-metro", EXIT_FAIL);
  }

  const npx = resolveNpx();
  const metroAfter = resolveMetroAfterPlatform(options);

  const moduleIds = options.modules
    ? options.modules
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  if (moduleIds.length > 0) {
    const sessionConfig = loadDevSessionConfig(projectRoot);
    if (!sessionConfig) {
      throw new CliError(
        "`.rn/dev-session.jsonc` missing — run `rn demo add` or create the multi-module port table (map-a/#17)",
        EXIT_FAIL,
      );
    }
    const ports = listModulePorts(sessionConfig, moduleIds, projectRoot);
    options.logger.writeHuman(
      `Multi-Metro (#17): ${ports.map((p) => `${p.id}=:${p.port}`).join(", ")}`,
    );
    const supportRoot = path.join(
      projectRoot,
      DEV_SUPPORT_MODULE_DIR,
      "DevSupportRoot.tsx",
    );
    if (existsSync(supportRoot)) {
      const contrib = await writeDevSessionContributions(projectRoot, {
        cwd: projectRoot,
        logger: {
          info: (m) => options.logger.writeHuman(m),
          warn: (m) => options.logger.warn(m),
        },
      });
      if (contrib) {
        options.logger.writeHuman(
          `Dev Session plugins: ${contrib.menuItems.length} menu contribution(s)`,
        );
      }
    }
    const sessions = await ensureMultiMetroSessions({
      npx,
      projectRoot,
      logger: options.logger,
      modules: ports,
      noMetro: options.noMetro,
      detached: options.detachMetro || Boolean(options.android || options.ios),
    });

    const androidHost = probeAndroidHost();
    if (androidHost.adbPath) {
      for (const s of sessions) {
        const bridge = ensureMetroBridge({
          port: s.port,
          adbPath: androidHost.adbPath,
        });
        options.logger.writeHuman(
          bridge.ok
            ? `reverse :${s.port} (${s.moduleId})`
            : `reverse :${s.port} skipped — ${bridge.message}`,
        );
      }
    }

    if (!options.android && !options.ios) {
      options.logger.writeHuman(
        "Multi-Metro running (detached). Attach shell with `rn dev --android` or open modules in Dev Menu.",
      );
      return;
    }
  }

  const metroBase = {
    npx,
    projectRoot,
    logger: options.logger,
    noMetro: options.noMetro || moduleIds.length > 0,
    after: metroAfter,
    port:
      moduleIds.length > 0
        ? listModulePorts(loadDevSessionConfig(projectRoot)!, moduleIds, projectRoot)[0]
            ?.port
        : resolveHostShellPreferredPort(projectRoot, options.port),
  };

  if (options.android) {
    const android = probeAndroidHost();
    if (!android.adbPath) {
      throw new CliError(
        [
          "adb not found — Android platform-tools are required for `rn dev --android`.",
          "See layered guidance: rn doctor",
          "One-shot host install: rn host android --yes",
          "Then: rn doctor --strict",
        ].join("\n"),
        EXIT_FAIL,
      );
    }

    const transportMode = options.transport ?? "auto";
    options.logger.info("Device gate (fail-fast before Gradle)…");
    const { device, authorized } = gateAndroidInstall({
      adbPath: android.adbPath,
      sdkRoot: android.sdkRoot,
      javaMajor: android.javaMajor,
      deviceId: options.device,
    });
    const resolvedMode = resolveDevTransportMode(transportMode, device);
    const warm = isAndroidBuildWarm(projectRoot);
    options.logger.writeHuman(
      `device gate: ok (${authorized.length} authorized)`,
    );

    const host = await ensureHostShellDevSession({
      npx,
      projectRoot,
      logger: options.logger,
      port: options.port,
      noMetro: options.noMetro,
      detached: metroAfter === "detach",
    });

    options.logger.info("Metro ready — configuring DevTransport…");
    const transport = setupDevTransport({
      adbPath: android.adbPath!,
      port: host.session.port,
      mode: resolvedMode,
      device,
    });
    logDevTransportSetup(options.logger, transport, android);

    const { runAndroidArgs, gradleEnv } = buildAndroidInstallArgs({
      adbPath: android.adbPath,
      device,
      authorizedCount: authorized.length,
      activeArchOnly: options.activeArchOnly,
      metroPort: host.session.port,
    });
    if (gradleEnv.ORG_GRADLE_PROJECT_reactNativeArchitectures) {
      options.logger.writeHuman(
        `native build: single ABI ${gradleEnv.ORG_GRADLE_PROJECT_reactNativeArchitectures} (--active-arch-only)`,
      );
    }

    options.logger.info(
      warm
        ? "Native build & install (warm — incremental Gradle)…"
        : "Native build & install (cold — first build may take several minutes)…",
    );
    const childEnv = androidHostChildEnv(undefined, android);
    const code = await runStreaming(npx, runAndroidArgs, {
      cwd: projectRoot,
      env: { ...childEnv, ...gradleEnv },
    });
    if (code !== 0) {
      await host.closeBroker?.();
      throw new CliError(`react-native run-android failed (exit ${code})`, EXIT_FAIL);
    }
    options.logger.writeHuman("dev session: install complete — reload JS from Metro (r)");

    if (!host.session.startedByUs) {
      return;
    }
    switch (metroAfter) {
      case "stop":
        host.session.child?.kill?.("SIGTERM");
        await host.closeBroker?.();
        options.logger.writeHuman("Install complete — Metro stopped.");
        return;
      case "detach":
        host.session.child?.unref?.();
        options.logger.writeHuman(
          `Install complete — Metro left running on :${host.session.port} (background).`,
        );
        return;
      case "foreground":
        options.logger.writeHuman(
          `Install complete — Metro on :${host.session.port}. Press Ctrl+C to stop.`,
        );
        await runHostShellMetroForeground(host);
        return;
    }
  }

  if (options.ios) {
    if (process.platform !== "darwin") {
      throw new CliError(
        "iOS run is only supported on darwin.",
        EXIT_FAIL,
      );
    }
    if (!commandExists("xcodebuild")) {
      throw new CliError(
        "xcodebuild not found — install Xcode.",
        EXIT_FAIL,
      );
    }

    await runPlatformWithMetro(metroBase, async (_session) => {
      options.logger.info("Building & installing iOS (run-ios --no-packager)…");
      options.logger.writeHuman(
        "Device tip: open Xcode once to accept licenses; use a simulator or paired device.",
      );
      const code = await runStreaming(
        npx,
        ["react-native", "run-ios", "--no-packager"],
        { cwd: projectRoot },
      );
      if (code !== 0) {
        throw new CliError(`react-native run-ios failed (exit ${code})`, EXIT_FAIL);
      }
    });
    return;
  }

  options.logger.info("Starting shell Metro (smart port + Dev Session reverse)…");
  const host = await ensureHostShellDevSession({
    npx,
    projectRoot,
    logger: options.logger,
    port: options.port,
    noMetro: options.noMetro,
    detached: false,
  });
  if (!options.logger.json) {
    options.logger.writeHuman(
      `Shell Metro on :${host.session.port} — Broker Pull ${host.hostPullUrl}`,
    );
    options.logger.writeHuman("Metro stays in foreground. Ctrl+C to stop.");
    options.logger.writeHuman(
      "Platform attach: rn dev --android  (same smart port + reverse).",
    );
  }
  await runHostShellMetroForeground(host);
}
