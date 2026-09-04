# Map #149 close-ready · 2026-09-04

## Status

Three frontier tickets are landing in parallel on 2026-09-04:

- **#141** Metro peel pipeline MVP (subagent: `a90d6e23`)
  Branch: `feat/141-metro-peel-mvp`
- **#155** Host 真·Bind + 双包证据 + 手册对齐 (subagent: `23535a1a`)
  Branch: `feat/155-host-real-bind`
- **#159** ScriptManager 二级加载 (Path B 薄封装) (subagent: `9b219986`)
  Branch: `feat/159-script-manager-thin`

After each branch lands, AFK + Map B/C/D + Hermes D0/D1/D2/43 loops must remain green; the new verify scripts (`verify-base-peel.mjs`, `verify-dev-harness.mjs`, `verify-panel-sot.mjs`, `verify-script-manager-thin.mjs`) all PASS.

## Close criteria (per #150 grill · Done = ScriptManager + 双包 + SoT + 自动化)

- [ ] #141 closed and branch merged
- [ ] #155 closed and branch merged
- [ ] #159 closed and branch merged
- [ ] `verify-base-peel.mjs` PASS
- [ ] `verify-dev-harness.mjs` PASS (or SKIP when no adb device)
- [ ] `verify-dual-pack-live.mjs` PASS
- [ ] `verify-multi-pack-bind.mjs` PASS
- [ ] `verify-panel-sot.mjs` PASS
- [ ] `verify-script-manager-thin.mjs` PASS
- [ ] Hermes D0/D1/D2/43 AFK loops all green
- [ ] spine `run-afk-hitl-loop.mjs --mode afk` 17/17 PASS

## Close command

```bash
gh issue close 149 --comment "Map #149 closes: #141 + #155 + #159 landed. Path B (ScriptManager 薄封装) is the industrial load path; Phase-1 process reload is the host-surface milestone (separate). SoT = CP catalog → Panel; ModuleRegistry is legacy read-cache. AFK + Map B + Map C + Map D + Hermes D0/D1/D2/43 all green. iOS Bind (out of scope) tracked separately."
```

## Notes

- iOS Debug Bind steel thread is explicitly out of scope (per #153 grill).
- 双 ReactHost / 独立 Activity path is out of scope (per #153 grill).
- Web approval console, store seven-channel adapters, HarmonyOS host integration all shelved (see #89, #90, #93).
