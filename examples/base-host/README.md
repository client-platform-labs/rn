# examples/base-host

Synthetic host project used by the Metro peel pipeline MVP (GitHub #141).

Files:

- `client-platform.peel.jsonc` — `basePathSet` + `peeledModules` consumed by
  `scripts/pack-base-peel.mjs --config <path>`. JSONC tolerates `//` comments.
- `src/base/Foo.ts` — synthetic base module (would be shipped in the
  base host bundle in P1).
- `src/peeled/Bar.ts` and `src/peeled/orders/Index.ts` — synthetic peeled
  business entries. They exist on disk so the example config references
  real paths; the pack script does not read them.

Replace these with the real base-host project when wiring P1 (Metro +
hermesc). See `docs/guides/metro-base-peel.md` for the contract.
