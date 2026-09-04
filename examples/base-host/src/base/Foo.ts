// base-host synthetic base entry (#141) — exists only so the example
// config references a real file path. Real base host code lives in the
// app repo (out of scope for the MVP pipeline).
export const BASE_KIND = "base";
export function baseMarker() {
  return { kind: BASE_KIND };
}
