# 实施地图 2 术语（增量）

完整领域术语见 [../wayfinding/CONTEXT.md](../wayfinding/CONTEXT.md)；MVP 术语见 [../wayfinding-impl/CONTEXT.md](../wayfinding-impl/CONTEXT.md)。

**企业闭环北极星**:
蓝图多平面模型（本地内环 · CI/制品 · 控制面 · 运行时治理 + Governance 横切）；可拆地图，不可过早把产品收成 demo；禁止线性五段偷换架构。
_Avoid_: 「开发→测试→部署→发布→回滚」作为唯一链路模型

**工业合同补丁（P1–P17）**:
见 [research/01-multi-plane-industrial-remediation.md](./research/01-multi-plane-industrial-remediation.md)；消解双列车碎片、棕地真空、质量/观测粗闭环等。
_Avoid_: 明知缺口仍按最小 stub 实现

**地图 A（wayfinding-impl-2）**:
双场景真机 + 制品/控制面合同可跑（候选轨）；详见 research §3。
_Avoid_: 本图 Done 即宣布产品完成

**身份谱系（地图 A）**:
`release_id` / `artifact_line` / `artifact_kind` / `runtime_fingerprint` / `capability_set` / `compatibility_profile_id`（+ JS 的 `update_id`/`channel`）；fingerprint 字段对齐蓝图附录；`host_support_window` + `max_profiles` 默认 3。
_Avoid_: 单 version 字符串冒充谱系；无限 N 宿主 JS 矩阵

**RN production 列车（A1）**:
默认 `0.87.x` + Hermes V1 + New Arch only；`rnExactTuple` = `0.87.<patch>+hermes-v1+newarch+codegen-locked`。
_Avoid_: init 默认实验旗标轨；用单 RN 版本号冒充元组

**平面职责禁区（实施提示）**:
从参考材料吸收「各平面不做的事」写法；权威边界仍以蓝图五卷 + P1–P17 为准，不另立第二套平面规格。
_Avoid_: 把参考 Phase Roadmap 当合同改写蓝图

**工业级分期**:
合同/接口/身份/阶段机按工业实践一次设计对；实现按里程碑增量填充，禁止设计成不可演进的死 stub。
_Avoid_: 为赶进度发明第二套「临时」架构

**真机可装包里程碑**:
本图切片：iOS/Android 真机安装 + Greenfield/Brownfield 一等路径，服务于闭环中的开发/测试/部署环节。
_Avoid_: 把本图当成整个产品终点

**Greenfield（本图）**:
纯 RN 独立 App 工业路径：可 init、dev、构建、装包、进入交付阶段合同。
_Avoid_: 仅 JSONC 骨架冒充工程

**Brownfield（本图）**:
原生宿主嵌入 RN 的一等路径；按蓝图宿主契约落地（深度由票 01 钉），非文档占位。
_Avoid_: 「示例空壳」代替可推广宿主路径
