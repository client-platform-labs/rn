Type: task
Mode: AFK
Status: open
GitHub: #6
Triage: ready-for-agent
Blocked by: 01, 02, 03

# A3 Delivery：七阶段至候选包

## Question

实现 `rn-delivery` 阶段合同编排至可安装候选包（硬门禁分轨、双 SBOM/attest 接口、同物晋级），满足地图 A3？

## 与 Goals 的关系（非新切片）

- `js-update` 按 **`business_module`** 产出（一壳多 Bundle）
- Debug Host vs release 分轨（票 13b）；装包台（票 14）消费本切片候选包元数据
