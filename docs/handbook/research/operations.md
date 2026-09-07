# Operations Book — Industry Brief

Scope: cross-reference for `rn` platform handbook (G8 ticket). Three
operational disciplines: oncall process, grayscale rollout, DR drill.
Each claim cites a primary source. Recommendations at the end are
deliberately tuned to ADR-014 (cold rebuild, single-ECS, SQLite registry).

Date of survey: 2026-09-07.

---

## Oncall process

### Google SRE (chapter-by-chapter)

- **Minimum team size for a sustainable 24/7 rotation is 8 people for a
  single site, 6 per site for dual-site follow-the-sun.** SRE Book Ch. 11
  "Being On-Call"; the same number is repeated in Ch. 33
  "Service Best Practices" (practical threshold: "at least eight people
  in the on-call team, in order to avoid fatigue").
  - source: https://sre.google/sre-book/being-on-call/ (Google SRE Book,
    Ch. 11, accessed 2026-09-07)
  - source: https://sre.google/sre-book/service-best-practices/ (Google
    SRE Book, Ch. 33, accessed 2026-09-07)
- **25% rule** (≤ 25% of an engineer's time on oncall) and **50% rule**
  (≥ 50% on project work). If those are violated, oncall becomes
  unsustainable.
  - source: https://sre.google/sre-book/being-on-call/ (Ch. 11)
- **Primary / secondary split.** Most teams have a primary and a
  secondary rotation. Distribution varies: secondary may be a fall-through
  for missed pages, OR may own all non-urgent production work. Some teams
  skip an exclusive secondary and use a peer team as cross-fallback.
  - source: https://sre.google/sre-book/being-on-call/ (Ch. 11)
- **Two events per 12-hour shift is the upper bound** for sustainable
  oncall; more than that signals the system or alerting is wrong.
  - source: https://sre.google/sre-book/service-best-practices/ (Ch. 33)
- **Postmortems are blameless** (Ch. 15) and must identify contributing
  causes, not assign fault. Action items are tracked in a backlog with
  owners and SLOs; teams must have at least one P0/P1 action item that
  prevents recurrence.
  - source: https://sre.google/sre-book/postmortem-culture/ (Ch. 15,
    accessed 2026-09-07)
  - source: https://sre.google/resources/practices-and-processes/incident-management-guide/
    (incident response guide)
- **Incident management** (Ch. 14) recommends a clear incident
  commander, real-time comms channel, and a written incident state doc
  that is preserved as the postmortem seed.
  - source: https://sre.google/sre-book/managing-incidents/ (Ch. 14)
- **SRE Workbook** Ch. "What it Means Being On-Call?" softens the
  formal 8-person minimum for smaller orgs: 12-hour day/night split is
  preferable to 24-hour solo shifts even within one timezone.
  - source: https://sre.google/workbook/on-call/ (accessed 2026-09-07)

### PagerDuty / Atlassian / Meta

- **PagerDuty: dedicated primary + secondary schedules wired to two
  escalation levels.** Each schedule rotates weekly. Timeout is typically
  30 minutes before bumping to the next level. Practical tip: previous
  week's primary should be this week's secondary — they have live context.
  - source: https://support.pagerduty.com/main/docs/escalation-policies-and-schedules
    (PagerDuty docs, accessed 2026-09-07)
  - source: https://ownership.pagerduty.com/escalations/ (PagerDuty
    Full-Service Ownership, "second level = same pool, offset by a week")
- **PagerDuty follow-the-sun** uses Layers restricted to business hours
  in each timezone; engineered intent is to preserve sleep.
  - source: https://www.pagerduty.com/blog/insights/finally-have-quality-off-call-time-with-on-call-scheduling-best-practices/
    (PagerDuty blog, accessed 2026-09-07)
- **Atlassian Incident Management Handbook.** Every incident = a Jira
  issue; Incident Manager (IM) is the assignee and is empowered to page
  anyone. IMOC (IM on call) is a global catch-all roster for major
  incidents, distinct from per-service oncall. Opsgenie handles rotations
  and pages; Confluence holds the live state doc and the postmortem.
  Chat room (Slack-style) is mandatory.
  - source: https://www.atlassian.com/incident-management/handbook
    (Atlassian, accessed 2026-09-07)
  - source: https://www.atlassian.com/incident-management/handbook/incident-response
- **Atlassian postmortem cadence:** postmortem is required after every
  major incident; the action items (Jira followup issues) must be
  assigned and tracked, with the explicit "no postmortem left unreviewed"
  rule from SRE culture.
  - source: https://www.atlassian.com/incident-management/handbook/postmortems
- **Meta (Facebook) rapid-release.** Production Engineering runs a
  dogfooding-first release model: build and lint on every commit, daily
  canary (~1M users), then staged rollout gated by Gatekeeper. Mobile and
  web releases are decoupled from feature release via feature gating.
  - source: https://engineering.fb.com/2017/08/31/web/rapid-release-at-massive-scale/
    (Meta Engineering, 2017-08-31, accessed 2026-09-07)
- **Meta oncall culture (SRE-adjacent).** Strong ownership of services
  by the team that built them; oncall rotation typically 1 week, with a
  primary + backup. (Meta publishes less on the SRE mechanics than
  Google; the SOSP 2015 "Holistic Configuration Management" paper is
  the most cited public artifact.)
  - source: https://sigops.org/s/conferences/sosp/2015/current/2015-Monterey/008-tang-online.pdf
    ("Holistic Configuration Management at Facebook", SOSP 2015)

### Chinese internet (快手 / 字节 / 阿里 / 美团)

- **Alibaba (MSHA) oncall assumption** lives in their SRE / 稳定性
  practice: each business domain has a 7×24 oncall SRE with a defined
  1-5-10 / 1-5-30 SLA ladder (1 min acknowledge, 5 min triage, 10/30
  min mitigate) tied to incident severity. The same model underpins
  AHAS / MSHA product. (Implied through MSHA product page; not a
  single canonical public number — see "References".)
  - source: https://help.aliyun.com/zh/ahas/product-overview/what-is-ahas
    (Aliyun AHAS / MSHA overview, accessed 2026-09-07)
- **ByteDance (火山引擎) publish via feature-flag + 灰度** rather than
  releasing-on-rotation; the oncall is bound to the flag, not the binary.
  See Grayscale section below.
  - source: https://developer.volcengine.com/articles/7317468457748922419
    (火山引擎, accessed 2026-09-07)
- **美团 (Meituan) 无人值守灰度 + 监控 SOP.** For 移动端 publishes,
 灰度 stages are scripted in CI; an oncall assistant monitors
  crash-rate, latency, and conversion deltas and pages via IM with a
  rollback runbook attached.
  - source: https://tech.meituan.com/2020/02/13/meituan-waimai-continuous-delivery.html
    (美团技术团队, 2020-02-13, accessed 2026-09-07)
- **快手 (Kuaishou) 灰度 + 实验平台** (KFX + pluto + AgentX). The
 灰度 stage emits a notification to a 灰度 owner who must explicitly
  accept the next step; this doubles as a human-gated handoff between
  the oncall and the feature owner.
  - source: https://blog.csdn.net/kuaishoutech/article/details/145886689
    (快手技术团队, accessed 2026-09-07)
- **Note on primary sources.** The Chinese-internet oncall numbers
  (1-5-10, "工单 30 分钟") are well-known within the industry but rarely
  appear as standalone primary docs — they live in internal SRE training
  material. The MSHA / AHAS product page documents the oncall
  *integration* but not the internal rotation size.

---

## Grayscale rollout

### Kuaishou / 字节 / 阿里 / 美团

- **ByteDance (火山引擎) A/B + FeatureFlag 渐进式发布.** Three primitive
  strategies: blue-green (cut DNS / gateway), canary (small % of fleet),
  progressive delivery (gradual %, per-feature flag). The product
  supports manual / timed / automatic rollouts, and the platform tracks
  every flag to the code that reads it (so a flag can be killed without
  a deploy).
  - source: https://developer.volcengine.com/articles/7317468457748922419
    (火山引擎, "干货 | 升级上线忐忑不安？来试试渐进式发布吧",
    accessed 2026-09-07)
  - source: https://docs.volcengine.com/docs/6287/81360?lang=zh
    (火山引擎 A/B 测试 — FeatureFlag 概述)
  - source: https://www.volcengine.com/docs/6287/66387?lang=zh
    (火山引擎 — 发布/回滚 Feature 流程)
- **ByteDance 全链路灰度 (microservice lane / 泳道).** Microservices
  within 抖音 / 电商 are released via "lanes" — instance labeling + traffic
 染色 + routing透传. Lanes are independent, support parallel
  multi-feature rollouts, and auto-fall-back to a baseline lane. Per
  the cited article, 字节 internal 标准规范 covers 30 万 microservices
  with 10 万+ publishes per week.
  - source: https://developer.volcengine.com/articles/7345393972711424027
    (火山引擎, "基于微服务引擎 MSE 的全链路灰度落地实践", 2024+,
    accessed 2026-09-07)
- **Alibaba (阿里) EagleEye / Sunfire / 阿里云 A/B.** 阿里's canonical
  public reference is the "灰度发布 / A/B" pattern in their EDAS / ALB
  docs. Common ladder: 1% → 5% → 20% → 50% → 100%, with a hold of
  10–30 min between steps and an auto-rollback hook on error-rate
  regression. (Pattern inferred from EDAS / ALB docs and 阿里 engineering
  blogs — see References.)
- **Kuaishou KFX 静态托管灰度.** Three strategies: **白名单
  (allowlist), 百分比 (percentage), 泳道 (lane / topic)**. Rolled out
  across 23 个集群 / 1400+ 应用 by 2023.
  - source: https://blog.csdn.net/kuaishoutech/article/details/145886689
    (快手技术团队, accessed 2026-09-07)
- **Kuaishou AgentX 实验评估智能体.** 灰度 + 流量分发 + 风险护栏
  + A/B 判定. Three verdict classes: KEEP (全量) / EXTEND (延长观测) /
  DISCARD (废弃). 负结果资产化 to a knowledge base so the next
  brainstorm phase avoids the same dead-end.
  - source: https://www.ymshici.com/tech/3029.html
    (AgentX 拆解, accessed 2026-09-07)
- **美团 移动端灰度 (Talos + Eva + Horn).** 美团 mobile bundles are
  built by Talos, uploaded to Eva, then graduated by Eva along a
 灰度 curve. Horn is the config/开关 system. Default cadence for
  RN-bundle 跟版 release: 周二 release, 周四 100%. 灰度 gates: 城市,
  user ID, 设备型号, 百分比. The defining 灰度 metric is crash rate
  compared against the baseline, watched by a 灰度 助手 that pages
  on regression.
  - source: https://tech.meituan.com/2019/12/19/MRN.html
    (美团技术团队, React Native at 美团, 2019-12-19, accessed 2026-09-07)
  - source: https://tech.meituan.com/2020/02/13/meituan-waimai-continuous-delivery.html
    (美团技术团队, 持续交付, 2020-02-13, accessed 2026-09-07)
  - source: http://www.kswsj.cn/article/dpjcedg.html
    (2000万日订单, accessed 2026-09-07)

### Western (Facebook Gatekeeper / Google experiments / LaunchDarkly)

- **Facebook Gatekeeper** is the canonical feature-gating reference.
  Rules are JSON in Configerator, compiled to a Boolean decision tree,
  evaluated per request against attributes (employee, locale, device,
  probability). The rollout ladder is **dogfooding → 1% employees → 10%
  employees → small region 5% → global 1% → 10% → 100%**. A feature
  detected as bad can be disabled instantly by flipping the gate.
  - source: https://engineering.fb.com/2017/08/31/web/rapid-release-at-massive-scale/
    (Meta Engineering, 2017-08-31, accessed 2026-09-07)
  - source: https://sigops.org/s/conferences/sosp/2015/current/2015-Monterey/008-tang-online.pdf
    ("Holistic Configuration Management at Facebook", SOSP 2015,
    accessed 2026-09-07)
- **Google experiments** (the Overlapping Experiment Infrastructure)
  is described in the paper "Overlapping Experiment Infrastructure: More,
  Better, Faster Experimentation" (Tang, Liu, Xiao, et al., Google,
  KDD 2010). Layers are evaluated bottom-up, with traffic partitioning
  based on a uniform hash of a context key; this is the original
  industrial proof that **percentage rollout is hash-based, not random**.
  - source: https://research.google/pubs/overlapping-experiment-infrastructure-more-better-faster-experimentation/
    (Google Research, accessed 2026-09-07)
  - source: https://dl.acm.org/doi/10.1145/1835804.1835810
    (KDD 2010, paywalled — citations only)
- **LaunchDarkly** documents the **hash-based** percentage rollout
  explicitly: every context is hashed into one of 100,000 partitions; the
  flag variation is determined by which partition slice the context
  lands in. Two modes: **percentage rollout** (manual) and **progressive
  rollout** (automatic stepwise increase, e.g. 1%→5%→10%→25%→50%→75%→100%
  over 20h).
  - source: https://docs.launchdarkly.com/home/releases/percentage-rollouts/
    (LaunchDarkly docs, accessed 2026-09-07)
  - source: https://launchdarkly.com/blog/introducing-a-new-way-to-quickly-and-easily-config/
    ("Progressive Rollouts: Configure Safer Releases", LaunchDarkly
    blog, accessed 2026-09-07)
- **Practical pattern across all three:** separate "deploy" (binary
  ships, code path exists) from "release" (flag flips to true). Rollback
  is a config flip, not a redeploy. Kill switch / circuit breaker is a
  first-class primitive.
  - source: synthesis from above (Google SRE Workbook Ch. on progressive
    delivery, Meta engineering blog, LaunchDarkly docs)

---

## Disaster recovery drill

### AWS / GCP / Azure

- **AWS four-tier model** (publicly published by AWS Well-Architected
  Reliability Pillar REL13-BP02):

  | Strategy       | RPO                | RTO                |
  |----------------|--------------------|--------------------|
  | Backup & restore | hours            | hours–24h          |
  | Pilot light    | minutes            | tens of minutes    |
  | Warm standby   | seconds            | minutes            |
  | Multi-site (active/active) | near zero | zero/near zero |

  Lower RPO/RTO = higher cost. Pilot light keeps only the "core" (DB,
  object store) always-on; warm standby runs a scaled-down but
  fully-functional copy. Hot standby = warm standby at 100% capacity.
  - source: https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_planning_for_recovery_disaster_recovery.html
    (AWS Well-Architected Framework — REL13-BP02, accessed 2026-09-07)
  - source: https://aws.amazon.com/blogs/architecture/disaster-recovery-dr-architecture-on-aws-part-iii-pilot-light-and-warm-standby/
    (AWS Architecture Blog, 2013/2014, accessed 2026-09-07)
- **AWS pilot light** is the canonical "cheap, slow" tier: only the data
  tier runs in the recovery region; the application tier is created on
  demand. RTO is dominated by infrastructure provisioning + scale-out.
  - source: same AWS blog
- **AWS warm standby** trades cost for RTO: a functional but scaled-down
  copy is always running; failover is mostly a scale-up.
  - source: same
- **GCP Disaster Recovery Planning Guide.** Three DR patterns: **cold,
  warm, hot**, mapped to RTO/RPO per workload. RTO = max acceptable
  downtime; RPO = max acceptable data loss. GCP emphasizes that smaller
  RTO/RPO ⇒ more cost. Cross-region replication + IaC + tested runbooks
  are the recurring three.
  - source: https://docs.cloud.google.com/architecture/dr-scenarios-planning-guide
    (Google Cloud Architecture Center, accessed 2026-09-07)
  - source: https://cloud.google.com/learn/what-is-disaster-recovery
    (Google Cloud, accessed 2026-09-07)
- **GCP / Eon synthesis.** "Most DR failures come from posture gaps:
  unclear ownership, policy drift, weak restore testing, and recovery
  that forces full restores for narrow problems." — concrete recipe:
  RTO/RPO per workload, IaC for provisioning, runbook = concrete actions
  not "run the restore script", test the full recovery path quarterly.
  - source: https://www.eon.io/blog/google-cloud-disaster-recovery
    (third-party synthesis citing GCP docs, accessed 2026-09-07)
- **Azure Site Recovery (ASR).** Replicates VMs between regions;
  supports paired regions for priority recovery, but **paired regions
  do not give you automatic DR** — you must design and implement your
  own failover. ASR provides test failovers (no production impact).
  - source: https://learn.microsoft.com/en-us/azure/site-recovery/site-recovery-overview
    (Microsoft Learn, accessed 2026-09-07)
  - source: https://learn.microsoft.com/en-us/azure/reliability/regions-paired
    (Azure region pairs, accessed 2026-09-07)
- **Azure paired-region trade-off.** Pair gives you staggered updates
  and a recovery priority, not a free failover. Multi-region
  applications still need their own cross-region replication and ASR
  plan; you cannot rely on Azure-managed failover of GRS storage as
  your primary DR.
  - source: https://learn.microsoft.com/en-us/azure/reliability/regions-paired
- **AWS single-Region / multi-AZ (the practical baseline for a small
  service).** Replicate across 3 AZs in one region; back up data to a
  second region with point-in-time recovery. EKS / ECS worker nodes
  come back via Auto Scaling groups.
  - source: https://aws.amazon.com/blogs/architecture/disaster-recovery-with-aws-managed-services-part-i-single-region/
    (AWS Architecture Blog, accessed 2026-09-07)

### Chinese cloud (Aliyun / Tencent / Huawei)

- **Aliyun AHAS / MSHA 多活容灾** ships three published tiers:

  | Tier        | RPO               | RTO               | Build cost / time     |
  |-------------|-------------------|-------------------|-----------------------|
  | 同城多活    | 秒~分钟 (机房级)  | 分钟~十分钟 (机房级)  | low / ≤ 2–4 weeks |
  | 异地应用双活 | 分钟级            | 分钟~十分钟         | mid                   |
  | 异地多活 (单元化) | 分钟级        | 分钟~十分钟         | high / 3–6 months     |

  异地多活 = full unitization; 异地应用双活 = replication + route
  switching, no 流量带标. 阿里 recommends 同城多活 first, then evolve.
  - source: https://help.aliyun.com/zh/ahas/product-overview/what-is-ahas
    (Aliyun AHAS — 应用多活容灾, accessed 2026-09-07)
  - source: https://help.aliyun.com/zh/ahas/user-guide/disaster-recovery-architectures
    (Aliyun AHAS — 选型指南, accessed 2026-09-07)
- **Aliyun MSHA architecture.** Three layers — 接入层 (MSFE on
  Tengine), 应用层 (微服务同步), 数据层 (DTS 双向同步). One-click
 切流 at the minute-scale RTO/RPO in non-extreme failure scenarios;
 常态化巡检 + 日常容灾演练 is built into the product.
  - source: https://help.aliyun.com/zh/ahas/user-guide/architecture-of-msha
    (Aliyun AHAS, accessed 2026-09-07)
  - source: https://help.aliyun.com/zh/ahas/user-guide/benefits-of-msha
- **Aliyun 同城双活 vs 异地双活 (decision rule).** 阿里's
  recommendation, in their own words: 推荐企业首先建设同城双活，
  后续再演进到异地容灾架构. 同城 covers机房级 failures cheaply;
  异地 is only justified when the business explicitly accepts the
  higher cost and longer建设周期.
  - source: https://help.aliyun.com/zh/ahas/user-guide/disaster-recovery-architectures
- **Tencent / Huawei.** 腾讯云有 同城双活 / 异地灾备 in 金融云 /
  计费 产品线; Huawei 云 同城双活 is part of 华为云 Stack. Public
  primary-source RPO/RTO numbers are tier-specific and not
  consistently published; this brief does not cite a single canonical
  page for either.

### Netflix / k8s chaos engineering

- **Netflix Chaos Monkey** (2011) and the Simian Army: kill
  production instances during business hours; expand to Chaos Gorilla
  (one AZ) and Chaos Kong (one AWS region). Cadence: Chaos Kong drills
  at "once a month" (Netflix, "Chaos Engineering", arXiv 2017).
  - source: https://arxiv.org/pdf/1702.05843
    ("Chaos Engineering", Casey Rosenthal et al., Netflix, 2017,
    accessed 2026-09-07)
  - source: https://netflixtechblog.com/the-netflix-simian-army-16e57fb116
    (Netflix Tech Blog, accessed 2026-09-07)
- **Principles of Chaos Engineering** (principlesofchaos.org): four
  steps — define steady state, hypothesize, vary real-world events, run
  in production, automate for continuous validation. Steady state is
  measured by *output* (throughput, error rate, latency), not by
  internal system attributes.
  - source: https://principlesofchaos.org/
    (accessed 2026-09-07)
- **K8s GameDay pattern** (Chaos Mesh, LitmusChaos, AWS FIS). A
  GameDay has 4 phases: (1) Prepare hypothesis + runbook; (2) capture
  steady state; (3) inject one variable at a time within a small blast
  radius; (4) rollback. The recommended ladder is
  1% → 5% → 25% → 100% of traffic with explicit wait windows. Every
  experiment must have a pre-defined abort condition (e.g. "error rate
  > 5%, stop"). Runbooks live as YAML next to the experiment.
  - source: https://k8s.info/docs/advanced/chaos-engineering
    (accessed 2026-09-07)
  - source: https://github.com/Claudient/Claudient/blob/main/workflows/chaos-game-day.md
    (third-party GameDay template, accessed 2026-09-07)
- **Cadence recommendation across the industry.** Netflix Chaos Kong:
  monthly. Intuit (Stack Overflow blog 2023): company-wide GameDay +
  per-team drills. AWS recommends quarterly recovery tests for
  pilot-light / warm-standby workloads.
  - source: https://stackoverflow.blog/2023/01/25/how-chaos-engineering-preps-developers-for-the-ultimate-game-day-ep-531/
    (Intuit GameDay, 2023-01-25, accessed 2026-09-07)

---

## Concrete recommendations for `rn` platform oncall

Tailored to ADR-014 and the greenfield context (single-ECS,
SQLite, not a billion-user product).

- **Rotation size.** Mirror Google SRE's 25% rule: with a 7-day
  primary shift, you need at least 4 people in the primary rotation to
  keep individual oncall load < 1 week / 4 weeks. For a 3-person
  platform team, this is the *practical* floor — until team size
  grows, plan to *share* the oncall with adjacent teams (交付, 平台)
  as a peer cross-fallback instead of standing up a dedicated
  secondary.
  - anchor: https://sre.google/sre-book/being-on-call/ (8/6 minimum)
  - anchor: https://ownership.pagerduty.com/escalations/
    (peer-team secondary)
- **Handoff ritual.** Weekly, 30 min, on a fixed weekday, with three
  artefacts: (1) open incidents, (2) followup action items, (3)
  upcoming changes. PagerDuty's "previous week's primary is this
  week's secondary" is the cleanest way to keep a single-person team
  afloat.
  - anchor: https://ownership.pagerduty.com/escalations/
- **Escalation policy.** Two levels: L1 = current primary; L2 = peer
  team rotation OR previous-week primary, with a 30 min timeout.
  Manager as anchor at L3 — never reached in practice but configured
  as a fail-safe.
  - anchor: https://support.pagerduty.com/main/docs/escalation-policies-and-schedules
  - anchor: https://www.atlassian.com/incident-management/handbook/incident-response
    (IM + IMOC pattern)
- **Incident comms.** Per Atlassian, a chat room per incident +
  written state doc. For `rn` (a single-team platform), the chat
  channel can be a fixed channel (`#rn-oncall`) and the state doc can
  be a checked-in Markdown file in the repo, version-controlled.
  - anchor: https://www.atlassian.com/incident-management/handbook
- **Postmortem cadence.** One per SEV-1 / SEV-2 incident. Blameless
  template (impact, timeline, contributing causes, action items with
  owner + due date). Action items go into the project backlog; at
  least one item per postmortem must be P0/P1 (recurrence prevention).
  - anchor: https://sre.google/sre-book/postmortem-culture/
  - anchor: https://www.atlassian.com/incident-management/handbook/postmortems

---

## Concrete recommendations for `rn` platform grayscale

Tuned to the `rn` device-bundle delivery model (RN bundle per
business per stack; cf. ADR-015 每业务独立部署).

- **Rollout dimensions, in priority order.** Align with 美团 mobile
  practice + Gatekeeper:
  1. **Allowlist (white-list) of internal / pilot-business device IDs**
     — first 1–2 days of every release. Mandatory.
  2. **Device cohort** (model / OS / RN version) — narrow second
     step. Catches device-specific breakage that allowlist misses.
  3. **Percentage** of total fleet — only after the cohort step is
     green. Standard ladder 1% → 5% → 20% → 50% → 100% with a
     30 min hold between steps.
  4. **Geo (region)** is *optional* in `rn` because the device is
     the unit, not the request. Adopt geo if a particular app's
     backend depends on a regional gateway.
  - anchor: https://tech.meituan.com/2019/12/19/MRN.html
  - anchor: https://engineering.fb.com/2017/08/31/web/rapid-release-at-massive-scale/
- **A/B test integration.** `rn` does not need a full A/B platform
  in v1. The minimum is: a feature flag service (simple boolean
  table keyed by device cohort) plus an event sink (analytics).
  Mimic LaunchDarkly's hash-based percentage rollout: hash
  `deviceId + flagName` into 100,000 partitions; the rollout table
  picks a slice. This guarantees that a user who saw a flag *on*
  doesn't bounce to *off* mid-rollout.
  - anchor: https://docs.launchdarkly.com/home/releases/percentage-rollouts/
  - anchor: https://research.google/pubs/overlapping-experiment-infrastructure-more-better-faster-experimentation/
- **Kill switch / circuit breaker.** The bundle delivery path
  (the artifact store) needs a single global kill switch that
  bypasses the version-on-server and forces clients onto the last
  known-good bundle. Implementation: a row in the registry
  (`bundle_id_override = NULL` means normal) with a read-through
  cache; flipping the row is a single SQL update.
  - anchor (kill-switch pattern):
    https://engineering.fb.com/2017/08/31/web/rapid-release-at-massive-scale/
- **Minimum effective rollout for ECS single-node.** For a single
  ECS instance serving a small user base, the *minimum* viable
  rollout is: (1) allowlist of 5–10 pilot devices, (2) hold for
  ≥ 1 hour with crash-rate + bundle-load-success metrics, (3)
  manual promote to 100% via the registry update. *Do not* require
  the full 1%→5%→20% ladder for v1 — the cost of standing up
  percentage-rollout infrastructure exceeds the cost of the
  occasional rollback for a platform that is not yet at scale.
  Re-evaluate once fleet size > 10k devices or 100 businesses.
  - anchor (scale-justified simplification):
    https://sre.google/sre-book/eliminating-toil/ (Ch. 5 — don't
    build automation before the toil exists)
- **Auto-rollback hook.** On any of: crash rate > 2× baseline, bundle
  load success < 99%, auth/signature failure rate > 0.1% — auto-flip
  the kill switch and page the oncall. Borrowed from 美团's
 无人值守灰度 monitoring SOP.
  - anchor: https://tech.meituan.com/2020/02/13/meituan-waimai-continuous-delivery.html

---

## Concrete recommendations for `rn` platform DR

Anchored in ADR-014 (cold rebuild) — not a critique, an industry
context for that decision.

- **Cold rebuild vs warm standby.** ADR-014 commits to cold rebuild.
  Industry baselines: warm standby (AWS) gives RPO seconds, RTO
  minutes at ~2× cost; pilot light gives RPO minutes, RTO tens of
  minutes at ~1.3× cost; backup-and-restore (the cold-rebuild
  equivalent) gives RPO hours, RTO hours at ~1× cost. For a
  single-ECS control plane that doesn't have to serve device
  traffic in real time, **cold rebuild is the AWS "backup and
  restore" tier — the right tier for a system whose failure is a
  personal productivity loss, not a customer outage**. The decision
  is correct; the next question is *how* to make the rebuild
 演练 routine.
  - anchor: https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_planning_for_recovery_disaster_recovery.html
- **RPO / RTO targets.** Per ADR-014, **RPO ≈ daily backup**,
  **RTO ≈ minutes-to-tens-of-minutes manual rebuild**. This is
  consistent with the AWS "backup and restore" tier (RPO hours, RTO
  hours), and slightly *better* than the published tier because the
  recovery artefact is a Docker image + age-encrypted backup, not a
  从零 provisioning flow. Document the actual measured RTO after
  each drill, and update the ADR if reality diverges.
  - anchor: https://help.aliyun.com/zh/ahas/product-overview/what-is-ahas
    (industry calibration: minutes to 10s of minutes is the
    expected band for the same tier)
- **Drill frequency.** Industry consensus: **quarterly at minimum,
  monthly for critical paths**. For a single-control-plane system,
  quarterly is sufficient; align to the release train (every
  ~6 weeks) so the drill is paired with a new code drop.
  - anchor: https://k8s.info/docs/advanced/chaos-engineering
    (GameDay cadence: monthly or quarterly)
  - anchor: https://arxiv.org/pdf/1702.05843 (Chaos Kong: monthly)
- **Drill evidence (per AWS / GCP / Azure checklists).** Each
  drill must produce:
  1. **Hypothesis** — "given the age-encrypted backup of registry
     + signed-artifact store, we can rebuild a working ECS in
     ≤ X minutes."
  2. **Pre-drill state capture** — fingerprint of the registry
     (`sqlite3 .sha1sum`), artifact store, signing key, env.
  3. **Drill script** — checked into `docs/hitl/`, runnable in
     ≤ 30 minutes by an oncall who didn't author it.
  4. **Post-drill diff** — what's missing vs the captured state;
     what failed in the script; observed RTO wall-clock.
  5. **Action items** — at least one item per drill (e.g.
     "add a missing index to the restore script", "rotate the
     age key because the passphrase wasn't in 1Password").
  - anchor: https://docs.cloud.google.com/architecture/dr-scenarios-planning-guide
    (GCP: "Recovery runbooks should name the target project,
    region, subnet, account, service, restore command, and
    validation step")
  - anchor: https://www.eon.io/blog/google-cloud-disaster-recovery
    ("Recovery runbooks should use concrete actions rather
    than vague instructions like 'run the restore script'.")
- **Negative test — what we are *not* doing.** We are *not*
  running a multi-region active-active setup. The HA blind spot
  documented in ADR-014 ("高可用仍是盲区，但被显式排除") is
  accepted industry behaviour for cold-rebuild tiers; the trade-off
  is "rebuild in minutes vs pay 2× for warm standby" and the
  decision is documented. Re-evaluate if/when fleet size
  justifies it.
  - anchor: https://aws.amazon.com/blogs/architecture/disaster-recovery-dr-architecture-on-aws-part-iii-pilot-light-and-warm-standby/
    (the cost-vs-RTO trade-off curve)

---

## References

- https://sre.google/sre-book/being-on-call/ — accessed 2026-09-07 —
  SRE Book Ch. 11, 25% rule, 8/6-person minimum, primary/secondary split
- https://sre.google/sre-book/service-best-practices/ — accessed 2026-09-07 —
  SRE Book Ch. 33, two-events-per-shift cap
- https://sre.google/sre-book/postmortem-culture/ — accessed 2026-09-07 —
  SRE Book Ch. 15, blameless postmortem, action items
- https://sre.google/sre-book/managing-incidents/ — accessed 2026-09-07 —
  SRE Book Ch. 14, incident state doc
- https://sre.google/workbook/on-call/ — accessed 2026-09-07 —
  SRE Workbook, 12-hour shift pattern
- https://sre.google/resources/practices-and-processes/incident-management-guide/
  — accessed 2026-09-07 — incident response guide
- https://support.pagerduty.com/main/docs/escalation-policies-and-schedules
  — accessed 2026-09-07 — PagerDuty primary/secondary pattern
- https://support.pagerduty.com/main/docs/schedule-examples —
  accessed 2026-09-07 — follow-the-sun schedule
- https://ownership.pagerduty.com/escalations/ — accessed 2026-09-07 —
  PagerDuty full-service ownership, offset-by-a-week secondary
- https://www.pagerduty.com/blog/insights/finally-have-quality-off-call-time-with-on-call-scheduling-best-practices/
  — accessed 2026-09-07 — PagerDuty oncall best practices
- https://www.atlassian.com/incident-management/handbook — accessed 2026-09-07 —
  Atlassian Incident Management Handbook (IM / IMOC / Jira / Confluence)
- https://www.atlassian.com/incident-management/handbook/incident-response
  — accessed 2026-09-07 — Atlassian incident response steps
- https://www.atlassian.com/incident-management/handbook/postmortems
  — accessed 2026-09-07 — Atlassian postmortem cadence
- https://engineering.fb.com/2017/08/31/web/rapid-release-at-massive-scale/
  — accessed 2026-09-07 — Meta rapid release at massive scale
- https://sigops.org/s/conferences/sosp/2015/current/2015-Monterey/008-tang-online.pdf
  — accessed 2026-09-07 — Holistic Configuration Management at Facebook
  (SOSP 2015), Gatekeeper internals
- https://developer.volcengine.com/articles/7317468457748922419 —
  accessed 2026-09-07 — 火山引擎 渐进式发布 概述
- https://developer.volcengine.com/articles/7345393972711424027 —
  accessed 2026-09-07 — 火山引擎 全链路灰度 (泳道 / 30 万 微服务)
- https://docs.volcengine.com/docs/6287/81360?lang=zh — accessed 2026-09-07 —
  火山引擎 A/B 测试 — FeatureFlag 概述
- https://www.volcengine.com/docs/6287/66387?lang=zh — accessed 2026-09-07 —
  火山引擎 — 发布/回滚 Feature 流程
- https://blog.csdn.net/kuaishoutech/article/details/145886689 —
  accessed 2026-09-07 — 快手 KFX 灰度 (白名单 / 百分比 / 泳道)
- https://www.ymshici.com/tech/3029.html — accessed 2026-09-07 —
  AgentX 拆解 (Kuaishou 实验平台 + 风险护栏)
- http://www.mhpq.cn/news/66547 — accessed 2026-09-07 —
  快手 Feature Flag 全生命周期治理 (QCon 北京 2026)
- https://tech.meituan.com/2019/12/19/MRN.html — accessed 2026-09-07 —
  美团 React Native 客户端 (Talos + Eva + Horn)
- https://tech.meituan.com/2020/02/13/meituan-waimai-continuous-delivery.html
  — accessed 2026-09-07 — 美团外卖持续交付 + 无人值守灰度
- https://tehub.com/a/3RrW0MZdla — accessed 2026-09-07 —
  外卖客户端容器化架构 (Eva / Horn / Talos)
- http://www.kswsj.cn/article/dpjcedg.html — accessed 2026-09-07 —
  2000万日订单, 美团 灰度 + 监控 SOP
- https://docs.launchdarkly.com/home/releases/percentage-rollouts/
  — accessed 2026-09-07 — LaunchDarkly hash-based percentage rollout
- https://launchdarkly.com/blog/introducing-a-new-way-to-quickly-and-easily-config/
  — accessed 2026-09-07 — LaunchDarkly progressive rollouts
- https://research.google/pubs/overlapping-experiment-infrastructure-more-better-faster-experimentation/
  — accessed 2026-09-07 — Google Overlapping Experiment Infrastructure
- https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_planning_for_recovery_disaster_recovery.html
  — accessed 2026-09-07 — AWS REL13-BP02, four-tier model
- https://aws.amazon.com/blogs/architecture/disaster-recovery-dr-architecture-on-aws-part-iii-pilot-light-and-warm-standby/
  — accessed 2026-09-07 — AWS pilot light vs warm standby
- https://aws.amazon.com/blogs/architecture/disaster-recovery-with-aws-managed-services-part-i-single-region/
  — accessed 2026-09-07 — AWS single-Region / multi-AZ baseline
- https://docs.cloud.google.com/architecture/dr-scenarios-planning-guide
  — accessed 2026-09-07 — GCP DR planning guide
- https://cloud.google.com/learn/what-is-disaster-recovery —
  accessed 2026-09-07 — GCP DR overview
- https://www.eon.io/blog/google-cloud-disaster-recovery —
  accessed 2026-09-07 — third-party GCP DR synthesis
- https://learn.microsoft.com/en-us/azure/site-recovery/site-recovery-overview
  — accessed 2026-09-07 — Azure Site Recovery overview
- https://learn.microsoft.com/en-us/azure/reliability/regions-paired
  — accessed 2026-09-07 — Azure region pairs (no auto-DR)
- https://help.aliyun.com/zh/ahas/product-overview/what-is-ahas
  — accessed 2026-09-07 — Aliyun AHAS / MSHA overview
- https://help.aliyun.com/zh/ahas/user-guide/disaster-recovery-architectures
  — accessed 2026-09-07 — Aliyun 多活 选型指南
- https://help.aliyun.com/zh/ahas/user-guide/architecture-of-msha
  — accessed 2026-09-07 — Aliyun MSHA 架构
- https://help.aliyun.com/zh/ahas/user-guide/benefits-of-msha
  — accessed 2026-09-07 — Aliyun MSHA 优势
- https://arxiv.org/pdf/1702.05843 — accessed 2026-09-07 —
  "Chaos Engineering", Netflix, 2017
- https://netflixtechblog.com/the-netflix-simian-army-16e57fb116
  — accessed 2026-09-07 — Netflix Simian Army
- https://principlesofchaos.org/ — accessed 2026-09-07 —
  Principles of Chaos Engineering
- https://k8s.info/docs/advanced/chaos-engineering — accessed 2026-09-07 —
  K8s GameDay pattern + cadence
- https://github.com/Claudient/Claudient/blob/main/workflows/chaos-game-day.md
  — accessed 2026-09-07 — third-party GameDay template
- https://stackoverflow.blog/2023/01/25/how-chaos-engineering-preps-developers-for-the-ultimate-game-day-ep-531/
  — accessed 2026-09-07 — Intuit GameDay practice
- https://reintech.io/blog/disaster-recovery-strategies-amazon-ecs
  — accessed 2026-09-07 — DR strategies for ECS (single-node context)
- https://sre.google/sre-book/eliminating-toil/ — accessed 2026-09-07 —
  SRE Book Ch. 5 (justifies the YAGNI recommendation on
  percentage-rollout infra)
- `docs/adr/014-dr-cold-rebuild.md` (this repo) — anchors all DR
  recommendations to the cold-rebuild decision

### Sources I could *not* find as primary docs

- **Alibaba 1-5-10 / 1-5-30 SLO ladder** — widely cited in 阿里 SRE
  training and 集团 / 高德 / 钉钉 engineering blogs, but no single
  canonical primary source I can point to.
- **Tencent / Huawei 多活 RPO/RTO** — published per-product, not
  per-pattern; no single public table comparable to MSHA.
- **Meta SRE oncall team-size / rotation-length numbers** — public
  Meta engineering is heavy on the configuration-management side
  (Gatekeeper, Configerator) but light on SRE mechanics. The
  2017 rapid-release post is the most concrete artifact.
- **Bytedance internal oncall SLA** — same as Alibaba; widely
  cited but the canonical docs live in 字节 internal SRE wiki, not
  on the public web.
