import { pathToFileURL } from "node:url";

import {
  createBrownfieldReferenceHost,
  defaultDualModuleDevSession,
} from "@client-platform/rn-core";

/**
 * TS-side brownfield reference host demo (map-a/#5).
 * Native open is a callback — replace with Activity/Fragment push in a real shell.
 */
export async function runBrownfieldHostDemo(): Promise<void> {
  const opened: string[] = [];
  const host = createBrownfieldReferenceHost({
    config: defaultDualModuleDevSession(),
    openSurface: async (moduleId, binding) => {
      opened.push(`${moduleId}@${binding.bundlerUrl}`);
    },
  });

  await host.surfaceHost.open("main");
  await host.surfaceHost.open("support");

  console.log(
    JSON.stringify(
      {
        surfaceKind: host.surfaceKind,
        protocolVersion: host.protocolVersion,
        ports: host.bundler.listPortTable(),
        opened,
      },
      null,
      2,
    ),
  );
}

const isMain =
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await runBrownfieldHostDemo();
}
