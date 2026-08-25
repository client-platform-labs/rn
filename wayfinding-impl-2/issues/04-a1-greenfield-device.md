Type: task
Mode: AFK
Status: resolved
Triage: ready-for-human
Assignee: cursor-agent
Blocked by: 01, 02, 03, 10, 11

# A1 Greenfield：工业 init/dev/doctor + 真机候选包

## Question

实现 pure-rn 工业路径：`rn init` 生成可构建工程、`rn doctor`/`rn dev` 真机可用，并产出 iOS/Android 候选安装包，满足地图 A1？

## Working Notes

权威：票 01/02/03/11；fingerprint 模块票 10 已落地。
- RN **0.87.x** + Hermes V1 + New Arch only
- `rnExactTuple` 形如 `0.87.<patch>+hermes-v1+newarch+codegen-locked`
- 验收串：doctor → init → dev 真机 → delivery 候选包 → 安装
- 默认 targets ios+android；Harmony 合同预留不进 A1 模板强制
- **深化（地图 A Goals G1，非新切片）**：Dev Session（票 13/13b）、一壳多 Bundle + 多 Metro 并行（票 16 的 GF 部分）、`dev-session` 插件 ABI；详见 [map.md](../map.md) · [票 16](./16-multi-bundle-shell-dev.md)
## Answer

（2026-08-21）A1 Greenfield 工业路径已落地：Community CLI 编排 init、扩 doctor、加 `rn dev`、delivery debug 候选编排；真机安装依赖本机 SDK。

### Approach

1. **`rn init`** — 非交互编排 `npx @react-native-community/cli init --version 0.87.0`（不手维护完整 RN native 树），再 overlay `client-platform.manifest.jsonc`（schemaVersion **2** + 身份脊柱）。`rnExactTuple` 从生成后的 `package.json` 解析 patch。`--dry-run` 只打印计划。
2. **`rn doctor`** — Node 24 与包解析失败则 **fail**；manifest 校验失败 **fail**；Android SDK/`adb`、darwin `xcodebuild` 默认 **warn**（`--strict` 升为 fail）；可算时打印 fingerprint digest；无 unsafe autofix。
3. **`rn dev`** — 编排上游 Metro (`react-native start`)；可选 `--android` / `--ios` 调 `run-*`（工具缺失则清晰失败）。
4. **`rn-delivery build`** — 有 `android/` 时 Gradle `assembleDebug` 并输出 `artifact_kind` / `release_id` / APK digest；darwin 上尝试 `xcodebuild` Debug simulator；无 SDK 时明确 exit 1。其余动词仍 stub。商店 submit 不做。
5. **CI** — 仍 typecheck + test + `rn doctor` + `rn init --dry-run`；不要求 SDK。

### Files (主要)

- `packages/rn-core` — schema v1|v2、`greenfield.ts`、manifest 渲染/校验
- `packages/rn` — `init` / `doctor` / `dev` + `process.ts`
- `packages/rn-delivery` — TypeScript CLI；`build` 真编排
- `docs/a1-greenfield.md`、`docs/mvp-scaffold.md`、`examples/pure-rn-demo/README.md`

### Verify (CI-safe)

```bash
pnpm install && pnpm typecheck && pnpm test
pnpm exec rn doctor          # exit 0（SDK 可为 warn）
pnpm exec rn init --dry-run  # 打印 RN 0.87 编排计划
```

### Real init smoke (this session)

在空临时目录用 `packages/rn/bin/rn.mjs init` 成功：Community CLI 拉取 0.87.0 模板 → hoist 到 cwd → 写入 schemaVersion 2 manifest，`rnExactTuple=0.87.0+hermes-v1+newarch+codegen-locked`，含 `ios/` + `android/`。注意：Community CLI 对 cwd 的绝对 `--directory` 会 `path.relative` 成 `''` 导致 mkdir 失败，故实现为相对子目录 stage 再 hoist。

### Works vs needs local SDK

| Step | Works without SDK | Needs local |
| --- | --- | --- |
| `rn doctor` | yes (warn) | `--strict` / device |
| `rn init --dry-run` | yes | — |
| `rn init` (real) | needs **network** for template | then local tree |
| `rn dev` (Metro) | needs generated app + `node_modules` | — |
| `rn dev --android/--ios` | — | adb / Xcode |
| `rn-delivery build` android | — | Android SDK + Gradle |
| `rn-delivery build` ios | — | darwin + Xcode (+ pods) |
| device install | — | `adb install` / Xcode |

本机若无 Android SDK：`rn-delivery build --platform android` 会明确 exit 1。iOS 还需 `cd ios && bundle exec pod install` 后再 `rn-delivery build --platform ios` / `rn dev --ios`。
