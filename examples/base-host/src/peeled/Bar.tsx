// base-host peeled checkout entry (#141b P1 real mode).
//
// Real source for the "checkout" peeled business. Imported (transitively)
// by `index.peeled.js` when `RN_PEEL_MODULE=Bar`. NOT bundled into the
// base pack — `processModuleFilter` in `metro.config.peeled.js` strips
// every base path out of the peeled bundle.
//
// The peeled marker is a simple shape that the host app introspects at
// runtime (via #126 BundleManager) to confirm the peeled bundle is
// loaded and to re-bind its module ids to the base.
import React from "react";
import { Text, View } from "react-native";
import { baseMarker } from "../base/Foo";

export const PEEL_KIND = "peeled";
export const PEEL_MODULE_ID = "src/peeled/Bar.ts";

export const peeled = {
  kind: PEEL_KIND,
  moduleId: PEEL_MODULE_ID,
  base: baseMarker(),
};

export function PeeledBar() {
  return React.createElement(
    View,
    { testID: "peeled-bar" },
    React.createElement(Text, null, "peeled checkout"),
  );
}

export default PeeledBar;
