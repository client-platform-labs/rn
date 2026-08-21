# 实施地图术语（增量）

完整领域术语见 [../wayfinding/CONTEXT.md](../wayfinding/CONTEXT.md)。

**MVP**:
本实施地图的可演示切片：`rn-core` + `rn` CLI 的 init/doctor/plugin list；不含生产交付与控制面。
_Avoid_: 把整个五边界平台叫作 MVP

**实施地图**:
蓝图收口后的 Wayfinder 图；允许携带执行（脚手架与代码），仍用决策票消除实施不确定性。
_Avoid_: 无票直接散改架构合同

**clientPlatform（MVP）**:
插件包 `package.json` 发现键；最小字段 `id` / `kind: "cli-command"` / `apiVersion` / `export`；惰性 `import()` 后调用 `register(ctx)`。
_Avoid_: 无清单目录扫描；启动期全量 eager import；把 native/prebuild ABI 混进 cli-command

**client-platform.manifest.jsonc（MVP）**:
项目合同；最小字段 `schemaVersion` / `product: "rn"` / `targets`；`config validate` 无文件 → exit 2。
_Avoid_: 另起 `rn.manifest.jsonc`；把密钥写进 JSONC

**下一里程碑（post-MVP）**:
delivery 编排骨架（阶段合同 + 可替换后端）；附带 init 目录合同与 adapter 空壳；不含生产控制面/真提审/JS 列车 E2E。
_Avoid_: 在本图继续扩 delivery 实现；一步跳进控制面或 Brownfield 宿主
