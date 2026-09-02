# `@client-platform/shell-core`

Business-facing SDK façade for the multi-bundle shell.

**Import only this package** from business modules for:

- `router` — `push` / `replace` / `back`
- `eventBus` — cross-module pub/sub
- `globalState` — L0 namespaced store (Catalog ACL)
- `registerDispose` / `registerBundleNavigator`

## Host binding

```ts
import { bindShellCore } from "@client-platform/shell-core";

bindShellCore({
  router,
  eventBus,
  globalState,
  disposeRegistry,
  actorModuleId: () => currentModuleId,
});
```

Business modules must not import native bridge contract names or `@client-platform/rn-core` host APIs for navigation/bus/state.

## Compatibility

- **Field-additive:** new exports may appear; existing names are not removed within a major.
- **`minShellSdk`:** Host / BundleManager refuse load when the shell SDK is below the module's declared minimum (see rn-core BundleManager).
