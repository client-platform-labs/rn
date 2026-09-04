// base-host synthetic peeled entry (#141) — peeled out of business
// bundles. Real peeled business code lives in the app repo.
import { baseMarker } from "../base/Foo.js";

export const PEEL_KIND = "peeled";
export const peeled = { kind: PEEL_KIND, base: baseMarker() };
