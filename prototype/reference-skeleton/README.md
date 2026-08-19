# THROWAWAY — reference skeleton

**Not production. Not the blueprint.**  
North star for this stub: **industry-familiar = thin core + hot-pluggable plugins + short happy path** (Expo / `@client-platform/kernel` style).

Canonical decisions live in `wayfinding/issues/*`. Ticket wins over this tree.

## Principles (locked in review)

1. **Thin core** — contracts, discovery, CLI hosts only.
2. **Plugins hot-plug** — install package → command / adapter / capability / channel policy appears; no core release required.
3. **Easy defaults** — `init` targets **ios + android**; Harmony is first-class in the *platform contract* but added with `add-target` (avoids forcing DevEco on day one).
4. **Dual host CLI** — `rn` (local) + `rn-delivery` (delivery). Optional: also invokable as `client-platform rn` via family umbrella; journeys do **not** require it.
5. **JS gates** — default `js-standard`; `js-gated` only for pay / login / new sensitive capability / first IA entry (policy plugin tunable).

## Layout

```text
prototype/reference-skeleton/
  packages/core|cli|delivery-cli   ← thin core
  plugins/*                        ← hot-plug (capabilities, OS adapters, channel, gates)
  examples/pure-rn-demo
  examples/hosts/brownfield
  schemas/ cli-help/ journeys/ topology/
```

## How to review

1. [journeys/01-pure-rn-init.md](./journeys/01-pure-rn-init.md)
2. [journeys/02-brownfield-gray-update.md](./journeys/02-brownfield-gray-update.md)
3. [cli-help/rn.txt](./cli-help/rn.txt) · [rn-delivery.txt](./cli-help/rn-delivery.txt)
4. [TREE.md](./TREE.md) · [topology/overview.md](./topology/overview.md)
