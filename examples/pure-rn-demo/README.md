# pure-rn-demo

Workspace placeholder for the rn product example slot.

For a **real** React Native 0.87 Greenfield app (ios+android), generate outside the monorepo root:

```bash
mkdir /tmp/pure-rn-app && cd /tmp/pure-rn-app
pnpm exec rn init          # from a checkout that has @client-platform/rn linked
pnpm exec rn doctor
pnpm exec rn dev
```

See [docs/a1-greenfield.md](../../docs/a1-greenfield.md).
