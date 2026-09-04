// base-host base entry (#141b P1 real mode).
//
// Real source for the base-host Metro graph. Imported by `index.base.js`
// so the bundler visits it; also referenced as `src/base/Foo.ts` in
// `client-platform.peel.jsonc`'s `basePathSet`.
//
// The base marker is a simple shape that the host app introspects at
// runtime (via #126 BundleManager) to confirm the base bundle is loaded.
import React from "react";
import { Text, View } from "react-native";

export const BASE_KIND = "base";
export const BASE_MODULE_ID = "src/base/Foo.ts";

export function baseMarker() {
  return { kind: BASE_KIND, moduleId: BASE_MODULE_ID };
}

export function BaseFoo() {
  return React.createElement(
    View,
    { testID: "base-foo" },
    React.createElement(Text, null, "base host"),
  );
}

export default BaseFoo;
