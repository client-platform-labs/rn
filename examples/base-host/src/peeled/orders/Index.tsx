// base-host peeled orders entry (#141b P1 real mode).
//
// Real source for the "orders" peeled business. Imported (transitively)
// by `index.peeled.js` when `RN_PEEL_MODULE=orders/Index`. NOT bundled
// into the base pack — `processModuleFilter` in `metro.config.peeled.js`
// strips every base path out of the peeled bundle.
import React from "react";
import { Text, View } from "react-native";

export const ORDERS_KIND = "peeled.orders";
export const ORDERS_MODULE_ID = "src/peeled/orders/Index.ts";

export const orders = {
  kind: ORDERS_KIND,
  moduleId: ORDERS_MODULE_ID,
};

export function PeeledOrders() {
  return React.createElement(
    View,
    { testID: "peeled-orders" },
    React.createElement(Text, null, "peeled orders"),
  );
}

export default PeeledOrders;
