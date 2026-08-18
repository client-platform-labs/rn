Type: grilling
Status: open
Triage: ready-for-human
Blocked by: 01, 06

# 本地开发、调试与诊断闭环

## Question

开发者从拉取代码到真机调试、原生联调和故障定位的标准路径是什么，平台应怎样把环境漂移、Metro、原生构建、网络、权限、设备和 Source Map 问题变成可自动诊断的闭环？

必须定义环境引导、dev server、设备发现、代理与证书、Mock、Feature Flag、日志聚合、性能分析、诊断包、可复现报告、doctor 修复边界，以及纯 RN/Brownfield 和 iOS/Android 的差异。
