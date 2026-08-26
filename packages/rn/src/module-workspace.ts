/**
 * Module workspace scaffold + shell link (ADR-005 topology B / ADR-008).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  DEFAULT_MAIN_METRO_PORT,
  defaultModulePort,
  type DevSessionConfig,
} from "@client-platform/rn-core";

import {
  loadDevSessionConfig,
  writeDevSessionConfig,
} from "./dev-session-config.js";

export const MODULES_DIR = "modules";

export function moduleWorkspaceRoot(
  projectRoot: string,
  moduleId: string,
): string {
  return path.join(projectRoot, MODULES_DIR, moduleId);
}

export function renderModulePackageJson(moduleId: string): string {
  return `${JSON.stringify(
    {
      name: `@rn-modules/${moduleId}`,
      version: "0.0.0",
      private: true,
      main: "index.js",
    },
    null,
    2,
  )}\n`;
}

export function renderModuleIndex(moduleId: string): string {
  return `/**
 * business_module "${moduleId}" entry (ADR-005 module workspace).
 * Do not treat this package as a second app-host.
 */
import { AppRegistry } from "react-native";
import { ModuleApp } from "./src/ModuleApp";

export function getModuleApp() {
  return ModuleApp;
}

export function registerModule(appKey: string): void {
  AppRegistry.registerComponent(appKey, () => ModuleApp);
}
`;
}

export function renderModuleApp(moduleId: string): string {
  return `import { StyleSheet, Text, View } from "react-native";

/**
 * Default surface for module "${moduleId}".
 * Replace with business UI; keep dispose/subscriptions tied to Surface lifecycle (ADR-008).
 */
export function ModuleApp() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>module:${moduleId}</Text>
      <Text style={styles.sub}>shell-linked module workspace · not an app-host</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, justifyContent: "center", backgroundColor: "#FAF9F5" },
  title: { fontSize: 22, fontWeight: "700", color: "#1F1E1C" },
  sub: { marginTop: 8, color: "#6B6962" },
});
`;
}

export function renderShellAppEntry(moduleId: string): string {
  return `/**
 * Shell App entry — loads business_module "${moduleId}" (ADR-005 topology B).
 * Business source lives under modules/${moduleId}/; do not pile domain code here.
 */
import { getModuleApp } from "./${MODULES_DIR}/${moduleId}";

const App = getModuleApp();
export default App;
`;
}

export function scaffoldModuleWorkspace(options: {
  projectRoot: string;
  moduleId: string;
}): string {
  const root = moduleWorkspaceRoot(options.projectRoot, options.moduleId);
  if (existsSync(root)) {
    throw new Error(`module workspace already exists: ${MODULES_DIR}/${options.moduleId}`);
  }
  mkdirSync(path.join(root, "src"), { recursive: true });
  writeFileSync(
    path.join(root, "package.json"),
    renderModulePackageJson(options.moduleId),
    "utf8",
  );
  writeFileSync(path.join(root, "index.js"), renderModuleIndex(options.moduleId), "utf8");
  writeFileSync(
    path.join(root, "src/ModuleApp.tsx"),
    renderModuleApp(options.moduleId),
    "utf8",
  );
  return root;
}

export function linkModuleToDevSession(options: {
  projectRoot: string;
  moduleId: string;
  metroPort?: number;
  entry?: string;
}): DevSessionConfig {
  const existing = loadDevSessionConfig(options.projectRoot);
  const modules = { ...(existing?.modules ?? {}) };
  const index = Object.keys(modules).length;
  const port =
    options.metroPort ??
    (modules[options.moduleId]?.metroPort ||
      defaultModulePort(options.moduleId, index));
  modules[options.moduleId] = {
    metroPort: port,
    entry: options.entry ?? `${MODULES_DIR}/${options.moduleId}/index`,
    envOverlay: modules[options.moduleId]?.envOverlay,
  };
  const config: DevSessionConfig = {
    schemaVersion: existing?.schemaVersion ?? 1,
    devSessionProtocolVersion: existing?.devSessionProtocolVersion ?? 1,
    transport: existing?.transport ?? "auto",
    activeEnvProfileId: existing?.activeEnvProfileId ?? "local",
    envProfiles: existing?.envProfiles ?? {
      local: {
        id: "local",
        apiBaseUrl: "http://127.0.0.1:3000",
        environment: "dev",
        tenantId: "local-tenant",
      },
    },
    modules,
  };
  writeDevSessionConfig(options.projectRoot, config);
  return config;
}

export function writeGreenfieldHostProfile(projectRoot: string): void {
  const dir = path.join(projectRoot, ".rn");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "host-profile.jsonc");
  writeFileSync(
    file,
    `// GF shell workspace (ADR-005 topology B)\n${JSON.stringify(
      {
        schemaVersion: 1,
        profile: "greenfield",
        topology: "shell-plus-modules",
        devSessionProtocolVersion: 1,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

/** Apply topology B after Community CLI hoist: main module workspace + shell App wire. */
export function applyTopologyBAfterInit(projectRoot: string): {
  moduleRoot: string;
  appEntry: string;
} {
  const moduleId = "main";
  const moduleRoot = scaffoldModuleWorkspace({ projectRoot, moduleId });
  linkModuleToDevSession({
    projectRoot,
    moduleId,
    metroPort: DEFAULT_MAIN_METRO_PORT,
    entry: "index",
  });
  writeGreenfieldHostProfile(projectRoot);

  const appTsx = path.join(projectRoot, "App.tsx");
  const appJsx = path.join(projectRoot, "App.jsx");
  const appEntry = existsSync(appTsx)
    ? appTsx
    : existsSync(appJsx)
      ? appJsx
      : appTsx;

  // Preserve upstream Hello as reference under modules/main if App exists.
  if (existsSync(appEntry)) {
    const previous = readFileSync(appEntry, "utf8");
    writeFileSync(
      path.join(moduleRoot, "src/UpstreamHello.tsx.bak"),
      previous,
      "utf8",
    );
  }
  writeFileSync(appEntry, renderShellAppEntry(moduleId), "utf8");
  return { moduleRoot, appEntry };
}
