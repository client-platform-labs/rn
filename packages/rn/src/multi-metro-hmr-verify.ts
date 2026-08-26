/**
 * Dual-entry multi-Metro HMR isolation checks (map-a/#17).
 * Curl two bundlers; mutate a module-private file; assert markers do not cross.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type ModuleBundleTarget = {
  id: string;
  port: number;
  /** Metro entry basename without extension, e.g. index / index.support */
  entry: string;
};

export function metroBundleUrl(
  port: number,
  entry: string,
  platform = "android",
): string {
  return `http://127.0.0.1:${port}/${entry}.bundle?platform=${platform}&dev=true&minify=false`;
}

export function metroStatusUrl(port: number): string {
  return `http://127.0.0.1:${port}/status`;
}

export async function fetchText(
  url: string,
  timeoutMs = 120_000,
): Promise<{ ok: boolean; status: number; body: string; headers: Headers }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body, headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

export async function assertMetroReady(port: number): Promise<void> {
  const res = await fetchText(metroStatusUrl(port), 5_000);
  if (!res.ok) {
    throw new Error(`Metro :${port} not ready (HTTP ${res.status})`);
  }
}

export type IsolationProbe = {
  moduleId: string;
  /** Absolute path to a source file only that module's entry should pull in. */
  filePath: string;
  /** Stable substring that should appear in this module's bundle before mutation. */
  baselineMarker: string;
  /** Must not appear in the other module's bundle (optional). */
  exclusiveOfOther?: boolean;
};

export type IsolationResult = {
  ok: boolean;
  details: string[];
};

/**
 * 1) Baseline: each bundle contains its marker; optionally exclusive.
 * 2) Mutate support-only file with a unique token; re-fetch; token only in support.
 * Restores the mutated file even on failure.
 */
export async function verifyDualBundleIsolation(options: {
  projectRoot: string;
  modules: [ModuleBundleTarget, ModuleBundleTarget];
  probes: [IsolationProbe, IsolationProbe];
  /** Which probe index to mutate for the HMR cross-check (default 1 = support). */
  mutateIndex?: 0 | 1;
}): Promise<IsolationResult> {
  const details: string[] = [];
  const mutateIndex = options.mutateIndex ?? 1;
  const [a, b] = options.modules;
  const [probeA, probeB] = options.probes;

  await assertMetroReady(a.port);
  await assertMetroReady(b.port);
  details.push(`metros ready :${a.port}+${b.port}`);

  const urlA = metroBundleUrl(a.port, a.entry);
  const urlB = metroBundleUrl(b.port, b.entry);
  const beforeA = await fetchText(urlA);
  const beforeB = await fetchText(urlB);
  if (!beforeA.ok || !beforeB.ok) {
    return {
      ok: false,
      details: [
        ...details,
        `bundle HTTP fail a=${beforeA.status} b=${beforeB.status}`,
      ],
    };
  }

  for (const [label, body, probe] of [
    [a.id, beforeA.body, probeA],
    [b.id, beforeB.body, probeB],
  ] as const) {
    if (!body.includes(probe.baselineMarker)) {
      return {
        ok: false,
        details: [
          ...details,
          `${label} missing baseline marker ${JSON.stringify(probe.baselineMarker)}`,
        ],
      };
    }
    details.push(`${label} has baseline ${JSON.stringify(probe.baselineMarker)}`);
  }

  if (probeA.exclusiveOfOther !== false && beforeB.body.includes(probeA.baselineMarker)) {
    return {
      ok: false,
      details: [
        ...details,
        `${b.id} incorrectly contains ${a.id} marker ${JSON.stringify(probeA.baselineMarker)}`,
      ],
    };
  }
  if (probeB.exclusiveOfOther !== false && beforeA.body.includes(probeB.baselineMarker)) {
    return {
      ok: false,
      details: [
        ...details,
        `${a.id} incorrectly contains ${b.id} marker ${JSON.stringify(probeB.baselineMarker)}`,
      ],
    };
  }
  details.push("baseline markers are exclusive across bundles");

  const mutateProbe = options.probes[mutateIndex];
  const mutateModule = options.modules[mutateIndex];
  const otherModule = options.modules[mutateIndex === 0 ? 1 : 0];
  const filePath = path.isAbsolute(mutateProbe.filePath)
    ? mutateProbe.filePath
    : path.join(options.projectRoot, mutateProbe.filePath);
  const original = readFileSync(filePath, "utf8");
  const token = `RN_HMR_ISO_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const injected = original.includes(mutateProbe.baselineMarker)
    ? original.replace(
        mutateProbe.baselineMarker,
        `${mutateProbe.baselineMarker} /* ${token} */`,
      )
    : `${original}\nexport const __rnHmrIso = ${JSON.stringify(token)};\n`;

  try {
    writeFileSync(filePath, injected, "utf8");
    details.push(`mutated ${path.relative(options.projectRoot, filePath)} +${token}`);

    // Metro watcher + transform; poll until token appears or timeout.
    const mutatedUrl = metroBundleUrl(mutateModule.port, mutateModule.entry);
    const otherUrl = metroBundleUrl(otherModule.port, otherModule.entry);
    const deadline = Date.now() + 60_000;
    let mutatedBody = "";
    let sawToken = false;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 800));
      const res = await fetchText(mutatedUrl);
      if (!res.ok) continue;
      mutatedBody = res.body;
      if (mutatedBody.includes(token)) {
        sawToken = true;
        break;
      }
    }
    if (!sawToken) {
      return {
        ok: false,
        details: [...details, `${mutateModule.id} bundle never picked up token`],
      };
    }
    details.push(`${mutateModule.id} bundle contains mutation token`);

    const otherRes = await fetchText(otherUrl);
    if (!otherRes.ok) {
      return {
        ok: false,
        details: [...details, `${otherModule.id} re-fetch HTTP ${otherRes.status}`],
      };
    }
    if (otherRes.body.includes(token)) {
      return {
        ok: false,
        details: [
          ...details,
          `CROSS-CONTAMINATE: ${otherModule.id} contains ${mutateModule.id} token`,
        ],
      };
    }
    details.push(`${otherModule.id} clean of mutation token`);
    return { ok: true, details };
  } finally {
    writeFileSync(filePath, original, "utf8");
  }
}

/** Default sample-demo probes for main (:8081) + support (:8082). */
export function sampleDemoIsolationTargets(projectRoot: string): {
  modules: [ModuleBundleTarget, ModuleBundleTarget];
  probes: [IsolationProbe, IsolationProbe];
} {
  return {
    modules: [
      { id: "main", port: 8081, entry: "index" },
      { id: "support", port: 8082, entry: "index.support" },
    ],
    probes: [
      {
        moduleId: "main",
        filePath: path.join(
          projectRoot,
          "src/sample/features/tickets/TicketListScreen.tsx",
        ),
        baselineMarker: "新建工单",
        exclusiveOfOther: true,
      },
      {
        moduleId: "support",
        filePath: path.join(
          projectRoot,
          "src/sample/modules/SupportModuleApp.tsx",
        ),
        baselineMarker: "support module",
        exclusiveOfOther: true,
      },
    ],
  };
}
