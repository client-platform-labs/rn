/**
 * Shared RuntimeHost / SurfaceHost / BundlerResolver (ADR-006, map-a/#5+#17).
 * GF and BF use the same Dev Session protocol; only Surface open path forks.
 */
import {
  createDevSessionController,
  type DevSessionController,
} from "./dev-session-plugin.js";
import {
  DEV_SESSION_PROTOCOL_VERSION,
  negotiateDevSessionProtocol,
  resolveDevSessionProtocolVersion,
  type DevSessionConfig,
} from "./env.js";
import { createModuleEventBus, type ModuleEventBus } from "./module-event-bus.js";
import {
  createModuleDisposeRegistry,
  createSurfaceLifecycleController,
  type ModuleDisposeRegistry,
  type SurfaceLifecycleController,
} from "./surface-lifecycle.js";

export type HostSurfaceKind = "greenfield" | "brownfield";

export type BundlerBinding = {
  moduleId: string;
  metroPort: number;
  /** Effective bundler base URL (override or derived from port). */
  bundlerUrl: string;
  entry?: string;
};

/**
 * Resolve module → Metro URL | slot | baseline.
 * In-memory for reference hosts; native BF SDK will bind the same shape.
 */
export function createBundlerResolver(
  config: DevSessionConfig,
  options?: { lanHost?: string },
) {
  const host = options?.lanHost ?? "127.0.0.1";
  const urlOverrides = new Map<string, string>();
  let focusedModuleId: string | null =
    Object.keys(config.modules)[0] ?? null;

  const defaultUrl = (moduleId: string, port: number): string =>
    `http://${host}:${port}`;

  return {
    listPortTable(): Readonly<Record<string, number>> {
      const out: Record<string, number> = {};
      for (const [id, binding] of Object.entries(config.modules)) {
        out[id] = binding.metroPort;
      }
      return out;
    },

    getFocusedModule(): string | null {
      return focusedModuleId;
    },

    setFocusedModule(moduleId: string): void {
      if (!config.modules[moduleId]) {
        throw new Error(`unknown business_module "${moduleId}"`);
      }
      focusedModuleId = moduleId;
    },

    setBundlerUrlOverride(moduleId: string, url: string | null): void {
      if (!config.modules[moduleId]) {
        throw new Error(`unknown business_module "${moduleId}"`);
      }
      if (url === null) {
        urlOverrides.delete(moduleId);
        return;
      }
      urlOverrides.set(moduleId, url);
    },

    resolve(moduleId: string): BundlerBinding {
      const binding = config.modules[moduleId];
      if (!binding) {
        throw new Error(`unknown business_module "${moduleId}"`);
      }
      return {
        moduleId,
        metroPort: binding.metroPort,
        entry: binding.entry,
        bundlerUrl:
          urlOverrides.get(moduleId) ?? defaultUrl(moduleId, binding.metroPort),
      };
    },

    /** All modules — proves multi-bundler simultaneous table (not single-8081). */
    resolveAll(): BundlerBinding[] {
      return Object.keys(config.modules).map((id) => this.resolve(id));
    },
  };
}

export type BundlerResolver = ReturnType<typeof createBundlerResolver>;

export interface SurfaceHost {
  /** Open an RN surface for a business_module (GF: nav; BF: native push). */
  open(moduleId: string): Promise<BundlerBinding>;
  /** Destroy surface and force dispose (ADR-008 P0.1). */
  destroy(moduleId: string): Promise<void>;
  /** Destroy + assert probe clean (device sampling). */
  destroyAndVerify(
    moduleId: string,
    probe?: { assertClean(): void },
  ): Promise<void>;
}

export interface RuntimeHost {
  surfaceKind: HostSurfaceKind;
  protocolVersion: number;
  controller: DevSessionController;
  bundler: BundlerResolver;
  disposeRegistry: ModuleDisposeRegistry;
  lifecycle: SurfaceLifecycleController;
  eventBus: ModuleEventBus;
  load(moduleId: string): Promise<BundlerBinding>;
}

export type OpenSurfaceFn = (
  moduleId: string,
  binding: BundlerBinding,
) => void | Promise<void>;

export function createReferenceRuntimeHost(options: {
  config: DevSessionConfig;
  surfaceKind: HostSurfaceKind;
  /** Peer protocol from Debug Host / embedded SDK handshake (defaults to config). */
  peerProtocolVersion?: number;
  lanHost?: string;
  openSurface: OpenSurfaceFn;
}): RuntimeHost & { surfaceHost: SurfaceHost } {
  const peer =
    options.peerProtocolVersion ??
    resolveDevSessionProtocolVersion(options.config);
  const negotiated = negotiateDevSessionProtocol({ peer });
  if (!negotiated.ok) {
    throw new Error(negotiated.reason);
  }

  const ports = Object.values(options.config.modules).map((m) => m.metroPort);
  if (ports.length > 1 && new Set(ports).size === 1) {
    throw new Error(
      "brownfield/greenfield multi-module session must not collapse to a single Metro port",
    );
  }

  const controller = createDevSessionController(options.config);
  const bundler = createBundlerResolver(options.config, {
    lanHost: options.lanHost,
  });
  const disposeRegistry = createModuleDisposeRegistry();
  const lifecycle = createSurfaceLifecycleController({ disposeRegistry });
  const eventBus = createModuleEventBus();

  const load = async (moduleId: string): Promise<BundlerBinding> => {
    const binding = bundler.resolve(moduleId);
    bundler.setFocusedModule(moduleId);
    lifecycle.notify(moduleId, "willAppear");
    await options.openSurface(moduleId, binding);
    lifecycle.notify(moduleId, "didAppear");
    return binding;
  };

  const destroy = async (moduleId: string): Promise<void> => {
    if (!options.config.modules[moduleId]) {
      throw new Error(`unknown business_module "${moduleId}"`);
    }
    await lifecycle.destroy(moduleId);
  };

  const surfaceHost: SurfaceHost = {
    open: load,
    destroy,
    destroyAndVerify: async (moduleId, probe) => {
      if (!options.config.modules[moduleId]) {
        throw new Error(`unknown business_module "${moduleId}"`);
      }
      await lifecycle.destroyAndVerify(moduleId, probe);
    },
  };

  return {
    surfaceKind: options.surfaceKind,
    protocolVersion: negotiated.version,
    controller,
    bundler,
    disposeRegistry,
    lifecycle,
    eventBus,
    load,
    surfaceHost,
  };
}

/** BF reference host — SurfaceHost = native-push adapter (injectable). */
export function createBrownfieldReferenceHost(options: {
  config: DevSessionConfig;
  peerProtocolVersion?: number;
  lanHost?: string;
  /** Native navigation opens the RN surface (Activity/Fragment/… callback). */
  openSurface: OpenSurfaceFn;
}): RuntimeHost & { surfaceHost: SurfaceHost } {
  return createReferenceRuntimeHost({
    ...options,
    surfaceKind: "brownfield",
  });
}

/** GF reference host — same protocol; SurfaceHost = in-app navigation adapter. */
export function createGreenfieldReferenceHost(options: {
  config: DevSessionConfig;
  peerProtocolVersion?: number;
  lanHost?: string;
  openSurface: OpenSurfaceFn;
}): RuntimeHost & { surfaceHost: SurfaceHost } {
  return createReferenceRuntimeHost({
    ...options,
    surfaceKind: "greenfield",
  });
}

export function assertSharedDevSessionProtocol(
  a: Pick<RuntimeHost, "protocolVersion" | "bundler">,
  b: Pick<RuntimeHost, "protocolVersion" | "bundler">,
): { ok: true } | { ok: false; detail: string } {
  if (a.protocolVersion !== b.protocolVersion) {
    return {
      ok: false,
      detail: `protocol mismatch ${a.protocolVersion} vs ${b.protocolVersion}`,
    };
  }
  if (a.protocolVersion !== DEV_SESSION_PROTOCOL_VERSION) {
    return {
      ok: false,
      detail: `unexpected protocol ${a.protocolVersion} (cli=${DEV_SESSION_PROTOCOL_VERSION})`,
    };
  }
  const pa = a.bundler.listPortTable();
  const pb = b.bundler.listPortTable();
  const keys = new Set([...Object.keys(pa), ...Object.keys(pb)]);
  for (const id of keys) {
    if (pa[id] !== pb[id]) {
      return {
        ok: false,
        detail: `port table diverge on ${id}: ${pa[id]} vs ${pb[id]}`,
      };
    }
  }
  if (Object.keys(pa).length < 2) {
    return {
      ok: false,
      detail: "expected ≥2 modules for multi-Metro isomorphism check",
    };
  }
  return { ok: true };
}
