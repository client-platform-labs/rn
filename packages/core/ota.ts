/**
 * Device-safe OTA-gate entry (Metro-compatible subpath).
 *
 * Metro resolves `@client-platform/core/ota` to this file (it does not read the
 * package.json `exports` field). It re-exports the COMPILED dist — the source
 * uses NodeNext `.js` specifiers Metro cannot resolve on device.
 */
export * from "./dist/ota-gate.js";
