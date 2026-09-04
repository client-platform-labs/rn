/**
 * Base-host RN entry (#141b P1 real mode).
 *
 * Registered with AppRegistry under the name "BaseHost" so the
 * `react-native bundle --entry-file index.base.js` invocation in
 * `scripts/pack-base-peel.mjs --real` has a real walk target. The host
 * app (tiangong / brownfield) loads the resulting base/index.hbc
 * directly via the native JS executor and does not call this AppRegistry
 * callback at runtime — but RN's bundler requires the entry to perform
 * the registration.
 *
 * @format
 */

import { AppRegistry } from "react-native";
import { name as appName } from "./app.json";
import { BASE_KIND } from "./src/base/Foo";

AppRegistry.registerComponent(appName, () => () => ({
  // Functional component shim — the base marker must exist in the bundle
  // graph so `base.marker.json.modules["src/base/Foo.ts"]` is real.
  kind: BASE_KIND,
}));
