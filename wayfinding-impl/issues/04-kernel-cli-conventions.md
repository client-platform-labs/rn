Type: research
Mode: AFK
Status: resolved
Triage: ready-for-agent
Assignee: cursor-agent

# 家族 kernel 与 CLI 约定核对

## Question

`/Users/xuwei/Work/client-platform-labs/kernel`（及已定家族文档）对 createCli、`package.json#clientPlatform`、JSONC 配置、Node/TS/commander 基线有哪些可核实约定，本仓 MVP 必须对齐哪些、允许本地扩展哪些？

产出对照表写入 `wayfinding-impl/research/04-kernel-cli-conventions.md`，供包命名与插件 ABI 票使用。

## Answer gist

- **Must:** Node 24.x LTS + TS + `commander` + ESM-first `@client-platform/*`; JSONC + Schema 2020-12/Ajv + `schemaVersion` pipeline; discover plugins via `package.json#clientPlatform`; family files `client-platform.config.jsonc` / `client-platform.manifest.jsonc`; boot Product CLI via `createCli`; static core / lazy `import()` for heavy paths.
- **May:** rn domain commands, dual-host `rn`/`rn-delivery`, presets/adapters/templates, Product JSONC fields, blueprint CI/exit/priority ladder (not defined by kernel); local bootstrap shaped like the charter until kernel packages ship.
- **Do not invent:** typed `createCli` API or `clientPlatform` field schema—kernel is charter-only today.
- Full matrix + gaps: [`../research/04-kernel-cli-conventions.md`](../research/04-kernel-cli-conventions.md)
