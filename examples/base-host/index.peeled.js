/**
 * Peeled-business RN entry (#141b P1 real mode).
 *
 * Each peeled module passes `RN_PEEL_MODULE` to `pack-base-peel.mjs
 * --real`, which selects the corresponding source under
 * `src/peeled/<RN_PEEL_MODULE>/` and writes the per-module metro
 * context. The pack script sets `RN_PEEL_MODULE=Bar` for the
 * "checkout" pack and `RN_PEEL_MODULE=orders/Index` for the
 * "orders" pack. The two imports below are statically resolvable
 * by Metro because the source paths are concrete (Metro handles
 * conditional imports via dead-code elimination on process.env).
 *
 * Like `index.base.js`, this entry only exists to give Metro a
 * walk target. The host app loads the resulting
 * peeled/<id>/index.hbc directly; the AppRegistry callback is
 * never invoked at runtime.
 *
 * @format
 */

import { AppRegistry } from "react-native";
import { name as appName } from "./app.json";
import * as checkoutMarker from "./src/peeled/Bar";
import * as ordersMarker from "./src/peeled/orders/Index";

// Select the marker module based on RN_PEEL_MODULE. process.env is
// inlined by Metro at build time when used in a static conditional.
const marker =
  process.env.RN_PEEL_MODULE === "orders/Index" ? ordersMarker : checkoutMarker;
const moduleId =
  process.env.RN_PEEL_MODULE === "orders/Index" ? "orders" : "checkout";

AppRegistry.registerComponent(`${appName}.${moduleId}`, () => () => marker);
