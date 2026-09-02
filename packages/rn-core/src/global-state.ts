/**
 * L0 shell global state with Catalog-declared namespace ACL (#139 / S-T3).
 */
export type GlobalStateStore = {
  read<T>(namespace: string, key: string): T | undefined;
  write(namespace: string, key: string, value: unknown): void;
};

export type GlobalStateAcl = {
  /** Namespaces the current actor may read/write. */
  allowedNamespaces: (moduleId: string) => ReadonlySet<string>;
  /** Active business_module identity; null = shell/host (all allowed). */
  actorModuleId: () => string | null;
};

export function createGlobalStateStore(acl: GlobalStateAcl): GlobalStateStore {
  const data = new Map<string, Map<string, unknown>>();

  const assertAllowed = (namespace: string): void => {
    const actor = acl.actorModuleId();
    if (actor === null) return; // shell/host
    const allowed = acl.allowedNamespaces(actor);
    if (!allowed.has(namespace)) {
      throw new Error(
        `globalState ACL denied: module "${actor}" cannot access namespace "${namespace}"`,
      );
    }
  };

  return {
    read<T>(namespace: string, key: string): T | undefined {
      assertAllowed(namespace);
      return data.get(namespace)?.get(key) as T | undefined;
    },
    write(namespace: string, key: string, value: unknown): void {
      assertAllowed(namespace);
      let ns = data.get(namespace);
      if (!ns) {
        ns = new Map();
        data.set(namespace, ns);
      }
      ns.set(key, value);
    },
  };
}
