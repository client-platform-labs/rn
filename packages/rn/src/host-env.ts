/**
 * Host toolchain probes for `rn doctor` (and shared callers).
 * Native Android/iOS tools are optional for Metro-only; required for device builds.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { commandExists, findAndroidSdkRoot, spawnSyncCapture } from "./process.js";

export type HostCheckLevel = "ok" | "warn" | "fail";

export interface HostCheckItem {
  id: string;
  level: HostCheckLevel;
  message: string;
}

export interface AndroidHostProbe {
  sdkRoot: string | undefined;
  /** adb resolved via PATH or $SDK/platform-tools/adb */
  adbPath: string | undefined;
  adbOnPath: boolean;
  javaMajor: number | undefined;
  javaMessage: string;
}

function resolveAdbPath(sdkRoot: string | undefined): {
  adbPath: string | undefined;
  adbOnPath: boolean;
} {
  const onPath = commandExists("adb");
  if (onPath) {
    const which = spawnSyncCapture(
      process.platform === "win32" ? "where" : "which",
      ["adb"],
    );
    const first = which.stdout.trim().split(/\r?\n/)[0]?.trim();
    return { adbPath: first || "adb", adbOnPath: true };
  }
  if (sdkRoot) {
    const bundled = path.join(
      sdkRoot,
      "platform-tools",
      process.platform === "win32" ? "adb.exe" : "adb",
    );
    if (existsSync(bundled)) {
      return { adbPath: bundled, adbOnPath: false };
    }
  }
  return { adbPath: undefined, adbOnPath: false };
}

/**
 * Best-effort Java major (17+ needed for typical RN 0.87 Android Gradle).
 * macOS ships a /usr/bin/java stub that exits without a real JDK — treat as missing.
 */
export function probeJavaMajor(): { major: number | undefined; message: string } {
  if (!commandExists("java")) {
    return {
      major: undefined,
      message: "java not on PATH (JDK 17+ required for Android Gradle builds)",
    };
  }
  const r = spawnSyncCapture("java", ["-version"]);
  const text = `${r.stderr}\n${r.stdout}`;
  if (
    /Unable to locate a Java Runtime/i.test(text) ||
    /no Java runtime/i.test(text)
  ) {
    return {
      major: undefined,
      message:
        "JDK missing (macOS java stub only — install Temurin/JDK 17+ or Android Studio JBR)",
    };
  }
  const m =
    text.match(/version\s+"(\d+)(?:\.\d+)?/) ||
    text.match(/version\s+"1\.(\d+)/);
  if (!m) {
    return {
      major: undefined,
      message:
        r.status === 0
          ? "java present but version unparseable"
          : "JDK missing or java -version failed (need JDK 17+)",
    };
  }
  const major = Number(m[1]);
  if (!Number.isFinite(major)) {
    return { major: undefined, message: "java present but version unparseable" };
  }
  return { major, message: `java ${major}` };
}

export function probeAndroidHost(): AndroidHostProbe {
  const sdkRoot = findAndroidSdkRoot();
  const { adbPath, adbOnPath } = resolveAdbPath(sdkRoot);
  const java = probeJavaMajor();
  return {
    sdkRoot,
    adbPath,
    adbOnPath,
    javaMajor: java.major,
    javaMessage: java.message,
  };
}

/** Resolve JDK 17 home without requiring shell profile sourcing. */
export function resolveJavaHome(): string | undefined {
  const fromEnv = process.env.JAVA_HOME?.trim();
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }
  if (process.platform === "darwin") {
    const temurin =
      "/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home";
    if (existsSync(temurin)) {
      return temurin;
    }
    const r = spawnSyncCapture("/usr/libexec/java_home", ["-v", "17"]);
    const home = r.stdout.trim();
    if (r.status === 0 && home && existsSync(home)) {
      return home;
    }
  }
  return undefined;
}

/**
 * Child-process env for Android builds. Probes SDK/JDK on disk so `rn dev --android`
 * works even when the current shell never sourced android-env.sh.
 */
export function androidHostChildEnv(
  base: NodeJS.ProcessEnv = process.env,
  probe: AndroidHostProbe = probeAndroidHost(),
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  if (probe.sdkRoot) {
    env.ANDROID_HOME = env.ANDROID_HOME || probe.sdkRoot;
    env.ANDROID_SDK_ROOT = env.ANDROID_SDK_ROOT || probe.sdkRoot;
    const pathParts: string[] = [
      path.join(probe.sdkRoot, "platform-tools"),
      path.join(probe.sdkRoot, "cmdline-tools", "latest", "bin"),
    ];
    if (existsSync("/opt/homebrew/bin")) {
      pathParts.push("/opt/homebrew/bin");
    }
    if (existsSync("/usr/local/bin")) {
      pathParts.push("/usr/local/bin");
    }
    env.PATH = `${pathParts.join(path.delimiter)}${path.delimiter}${env.PATH ?? ""}`;
  }
  const javaHome = resolveJavaHome();
  if (javaHome) {
    env.JAVA_HOME = env.JAVA_HOME || javaHome;
    const javaBin = path.join(javaHome, "bin");
    if (existsSync(javaBin)) {
      env.PATH = `${javaBin}${path.delimiter}${env.PATH ?? ""}`;
    }
  }
  return env;
}

/**
 * Emit discrete host check rows (legacy helpers; prefer doctor host layers).
 * Missing tools are warn by default; `--strict` upgrades to fail.
 */
export function androidHostCheckItems(
  probe: AndroidHostProbe = probeAndroidHost(),
  options: { strict?: boolean } = {},
): HostCheckItem[] {
  const missingLevel: HostCheckLevel = options.strict ? "fail" : "warn";
  const items: HostCheckItem[] = [];

  if (probe.sdkRoot) {
    items.push({
      id: "android-sdk",
      level: "ok",
      message: `Android SDK: ${probe.sdkRoot}`,
    });
  } else {
    items.push({
      id: "android-sdk",
      level: missingLevel,
      message:
        "Android SDK missing (set ANDROID_HOME / ANDROID_SDK_ROOT; install Android Studio SDK)",
    });
  }

  if (probe.adbPath) {
    items.push({
      id: "adb",
      level: "ok",
      message: probe.adbOnPath
        ? `adb: ${probe.adbPath}`
        : `adb: ${probe.adbPath} (not on PATH — add $ANDROID_HOME/platform-tools)`,
    });
  } else {
    items.push({
      id: "adb",
      level: missingLevel,
      message:
        "adb missing (install SDK platform-tools; needed for rn dev --android / device install)",
    });
  }

  if (probe.javaMajor !== undefined && probe.javaMajor >= 17) {
    items.push({
      id: "jdk",
      level: "ok",
      message: `JDK: ${probe.javaMessage} (ok for Android Gradle)`,
    });
  } else if (probe.javaMajor !== undefined) {
    items.push({
      id: "jdk",
      level: missingLevel,
      message: `JDK: ${probe.javaMessage} — need 17+ for RN Android builds`,
    });
  } else {
    items.push({
      id: "jdk",
      level: missingLevel,
      message: probe.javaMessage,
    });
  }

  return items;
}

export function iosHostCheckItems(options: {
  strict?: boolean;
}): HostCheckItem[] {
  if (process.platform !== "darwin") {
    return [
      {
        id: "ios",
        level: "ok",
        message: "iOS toolchain skipped (non-darwin)",
      },
    ];
  }
  const missingLevel: HostCheckLevel = options.strict ? "fail" : "warn";
  if (commandExists("xcodebuild")) {
    return [{ id: "ios", level: "ok", message: "xcodebuild: ok" }];
  }
  return [
    {
      id: "ios",
      level: missingLevel,
      message: "xcodebuild not found (install Xcode + CLT for iOS builds)",
    },
  ];
}
