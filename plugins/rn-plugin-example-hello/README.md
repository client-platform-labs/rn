# `@client-platform/rn-plugin-example-hello`

Example workspace plugin for MVP discovery (`rn plugin list`) and lazy CLI registration.

`package.json#clientPlatform`:

```json
{
  "id": "example-hello",
  "kind": "cli-command",
  "apiVersion": 1,
  "export": "./dist/register.js"
}
```

`export` default is `register(ctx)` with `{ program, logger }`. It adds `rn hello` (imported only when registering plugin commands, not for `plugin list` / `doctor`).
