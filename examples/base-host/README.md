# examples/base-host

Reference project for the Metro peel pipeline MVP (GitHub #141) and
its real-mode follow-up (#141b).

Files:

- `client-platform.peel.jsonc` — `basePathSet` + `peeledModules` +
  optional `bundle` block. Consumed by
  `scripts/pack-base-peel.mjs --config <path>`. JSONC tolerates
  `//` comments and `${TOKEN}` substitution.
- `src/base/Foo.tsx` — real base module (was synthetic `.ts` in #141
  MVP). Imported by `index.base.js` so the Metro bundler visits it.
- `src/peeled/Bar.tsx`, `src/peeled/orders/Index.tsx` — real peeled
  business entries. Imported by `index.peeled.js` so the Metro
  bundler visits them. Filtered out of the base pack by
  `processModuleFilter` in `metro.config.peeled.js`.
- `package.json` — minimal manifest. The example project intentionally
  has no `node_modules` of its own; the pack script loads Metro,
  `@react-native/metro-config`, and `hermesc` from a separate RN host
  (default `~/code/tiangong-host`, override with `TIANGONG_HOST`).
- `index.base.js` — RN entry for the base pack. Registers the base
  marker component so Metro has a walk target.
- `index.peeled.js` — RN entry for the peeled pack. Selects
  `Bar.tsx` or `orders/Index.tsx` based on `RN_PEEL_MODULE`.
- `metro.config.base.js` — Metro config for the base pack. Wires
  `createModuleIdFactory` against the persisted
  `base-module-id-map.json`.
- `metro.config.peeled.js` — Metro config for the peeled pack. Wires
  `createModuleIdFactory` (shared map) + `processModuleFilter`
  (excludes base paths).
- `babel.config.js` — `@react-native/babel-preset` resolved via the
  external RN root.
- `tsconfig.json` — minimal TS config for the entry + src files.
- `app.json` — RN AppRegistry app name (`BaseHost`).

## Modes

```bash
# Synthetic (default, fast, no Metro, no hermesc)
node ../../scripts/pack-base-peel.mjs --config client-platform.peel.jsonc

# Real (slow, runs Metro 0.87 + hermesc)
node ../../scripts/pack-base-peel.mjs --config client-platform.peel.jsonc --real

# Real + verify
node ../../scripts/verify-base-peel.mjs --config client-platform.peel.jsonc --real
```

See [`../../docs/guides/metro-base-peel.md`](../../docs/guides/metro-base-peel.md)
for the full contract and the [real-mode runbook](../../docs/guides/metro-base-peel-real-runbook.md)
for step-by-step local reproduction.
