# 02 · Toolchain

## 合同

Toolchain 是开发者本地使用的 CLI、模板、生成器、调试、诊断与迁移工具。产品合同为「**双宿主切开 + 编排不替代上游 + 三 ABI 插件 + 企业自建 CI 合同**」。

### 双宿主

| 宿主 | 职责 |
|------|------|
| 本地/诊断：`rn` | `init` / `doctor` / `dev` / `generate` / `capability` / `migrate` |
| 交付：`rn-delivery`（或等价名） | `build` / `sign` / `test` / `release` / `update` / `submit` |

- 交付 CLI 版本写在**项目合同**钉死，**禁止**进入 app `dependencies`。
- 可选伞形发现 `client-platform rn`；标准旅程只用 `rn` / `rn-delivery`。
- 本 CLI **编排**企业契约、门禁与身份，**不替代** Metro / 官方打包器；禁止 fork 深度定制替代 Community CLI / EAS 作为默认路径。

### 易用默认（票 17）

- `rn init` 默认目标：**ios + android**。
- `harmonyos` 在合同与制品行中仍为一等 OS；工具链经 `rn add-target harmonyos` 后安装 adapter 插件。
- 工程形态：薄核心 `packages/core` + `packages/cli` + `packages/delivery-cli`，能力与端适配在 `plugins/*` 热插拔。

### 配置与插件 ABI

```text
CLI flags > env > 项目 JSONC 合同 > 用户/全局默认
```

插件三类 **不可混用**：

1. CLI 命令插件  
2. 原生/能力包（manifest + autolinking）  
3. 预构建/工程改写插件  

### 本地闭环

- Happy path：`rn doctor` →（如需）`init`/`migrate` → `rn dev`。
- doctor：检测 + **安全自动修复**；签名密钥/生产凭证/删工程 → 只建议不自动执行。
- 企业代理：显式 `dev-proxy`；默认不静默信任未知证书。
- 诊断剖面：`pure-rn` \| `brownfield` × 三端；脱敏诊断包；生产 Source Map **禁止**无鉴权下发。

### CI 合同摘要

- `CI=1` / `--non-interactive`；`--json` → 人类日志 stderr。
- **无全局 dry-run**；变更类命令显式 `--dry-run`。
- 退出码：`0` 成功 / `1` 通用失败 / `2` 用法 / `3` 兼容或门禁 / `4` 凭证 / `5` 网络或执行后端。

## 边界

- 属于本卷：命令面、项目合同、插件发现、本地诊断剖面。
- 不属于本卷：流水线阶段语义与签名根权属（03）、灰度状态机（04）、能力语义本身（01）。

## 非目标

- 万能单体 CLI 二进制。
- 用 `NODE_ENV` 切换密钥/环境密文。
- 在 dev 包上承诺 release 性能。

## Decided in / Evidence

| 主题 | Decided in | Evidence |
|------|------------|----------|
| CLI 产品合同 | [08](../wayfinding/issues/08-cli-product-contract.md) | [research/22](../wayfinding/research/22-rn-cli-surface-patterns.md) |
| 上游薄 CLI 对照 | [22](../wayfinding/issues/22-rn-cli-surface-patterns.md) | 同上 |
| 本地开发与诊断 | [09](../wayfinding/issues/09-local-dev-debug-diagnostics.md) | — |
| 薄核心 + init/add-target | [17](../wayfinding/issues/17-reference-skeleton-prototype.md) | `prototype/reference-skeleton/` |
| Build-vs-Buy（工具集成边界） | [03](../wayfinding/issues/03-industry-platform-build-buy.md) | [research/03](../wayfinding/research/03-industry-platform-build-buy.md) |
