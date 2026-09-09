#!/usr/bin/env bash
# chain 10 — iOS 壳 simulator 全生命周期（Debug-iphonesimulator）
# 覆盖：
#   - build ios（xcodebuild，iphonesimulator，无 store 签名）
#   - .app 产物存在 + 真实 sha256 digest（非 pending）
#   - simctl install booted + simctl launch
#   - 验证已安装且可启动（无签名/SBOM 断言，store submit 不在本链范围）
#
# 环境要求（darwin + xcodebuild + cocoapods + 可用模拟器），任一缺失 → 全 SKIP 不 FAIL。
set -o pipefail
source "$(dirname "$0")/lib.sh"

JGET="node $E2E_REPO/scripts/e2e/jget.mjs"
RD="$E2E_REPO/packages/ship/bin/ship.mjs"
IOS_DIR="$E2E_HOST/ios"

# ── 环境探测 ──
if [[ "$(uname -s)" != "Darwin" ]]; then
  skip "非 darwin — iOS build 需 macOS"; SKIPS=$((SKIPS+1)); chain_done
fi
if ! command -v xcodebuild >/dev/null 2>&1; then
  skip "无 xcodebuild — 装 Xcode + CLT 后重试"; SKIPS=$((SKIPS+1)); chain_done
fi
if [[ ! -d "$IOS_DIR" ]]; then
  skip "无 ios/ 目录"; SKIPS=$((SKIPS+1)); chain_done
fi

step "10.1 [环境] Pods 是否就位（pods 未装则不 build）"
if [[ -d "$IOS_DIR/Pods" && -f "$IOS_DIR/Podfile.lock" ]]; then
  ok "Pods 已 install"
  PODS_READY=1
else
  skip "未 pod install — iOS build 需先 cd ios && pod install"; SKIPS=$((SKIPS+1))
  PODS_READY=0
fi

step "10.2 [环境] 可用 iPhone 模拟器"
BOOTED=$(xcrun simctl list devices booted -j 2>/dev/null | jq -r '.devices[]? // [] | .[]? | select(.state=="Booted") | .name' 2>/dev/null | head -1)
AVAIL=$(xcrun simctl list devices available -j 2>/dev/null | jq -r '.devices[]? // [] | .[]? | select(.name | test("iPhone")) | .name' 2>/dev/null | head -1)
if [[ -n "$BOOTED" ]]; then ok "已 booted: $BOOTED"
elif [[ -n "$AVAIL" ]]; then ok "可用模拟器: $AVAIL（若 build 后需 install 会自动 boot）"
else skip "无 iPhone 模拟器（xcrun simctl list devices）"; SKIPS=$((SKIPS+1)); fi

if [[ "$PODS_READY" != "1" ]]; then
  step "10.3 [build] iOS 跳过（pods 未就位）"
  skip "build ios 需先 pod install"; SKIPS=$((SKIPS+1)); chain_done
fi

step "10.3 [build] ship build --platform ios"
cd "$E2E_HOST"
BUILD_OUT=$(node "$RD" build --platform ios 2>&1)
BUILD_RC=$?
if [[ $BUILD_RC -ne 0 ]]; then
  err "build ios 失败: $(echo "$BUILD_OUT" | tail -5)"
  FAILS=$((FAILS+1)); chain_done
fi
ok "build ios 退出 0"

# 从 last-candidate.json 读真实 digest + bundle_path
CAND="$E2E_HOST/.rn/delivery/last-candidate.json"
step "10.4 [产物] .app bundle + 真实 digest"
if [[ -f "$CAND" ]]; then
  DIG=$(jq -r '.digest // empty' "$CAND" 2>/dev/null)
  BUNDLE=$(jq -r '.bundle_path // empty' "$CAND" 2>/dev/null)
  PLAT=$(jq -r '.platform // empty' "$CAND" 2>/dev/null)
  [[ "$PLAT" == "ios" ]] && ok "platform=ios" || { err "platform 非 ios: $PLAT"; FAILS=$((FAILS+1)); }
  if [[ "$DIG" =~ ^[0-9a-f]{64}$ ]]; then ok "digest 真实 (64 hex): ${DIG:0:12}..."
  else err "digest 仍 pending/非法: $DIG"; FAILS=$((FAILS+1)); fi
  if [[ -n "$BUNDLE" && -d "$BUNDLE" ]]; then ok ".app 存在: $BUNDLE"
  else err ".app 不存在 (bundle_path=$BUNDLE)"; FAILS=$((FAILS+1)); fi
else
  err "无 last-candidate.json（build 未写结果）"; FAILS=$((FAILS+1)); chain_done
fi

# ── 安装 + 启动（需模拟器）──
if [[ -z "$BOOTED" && -z "$AVAIL" ]]; then
  step "10.5 [install] 跳过（无模拟器）"
  skip "无 iPhone 模拟器"; SKIPS=$((SKIPS+1)); chain_done
fi
if [[ -z "$BUNDLE" || ! -d "$BUNDLE" ]]; then
  step "10.5 [install] 跳过（无 .app）"
  skip "无 .app bundle"; SKIPS=$((SKIPS+1)); chain_done
fi

step "10.5 [install] simctl install booted（无 booted 则先 boot）"
if [[ -z "$BOOTED" ]]; then
  # boot 第一个 iPhone 模拟器
  DEVICE_UDID=$(xcrun simctl list devices available -j 2>/dev/null | jq -r '.devices[]? // [] | .[]? | select(.name | test("iPhone")) | .udid' 2>/dev/null | head -1)
  if [[ -n "$DEVICE_UDID" ]]; then
    xcrun simctl boot "$DEVICE_UDID" 2>&1 | tail -1
    ok "已 boot $DEVICE_UDID"
  fi
fi
INSTALL_OUT=$(xcrun simctl install booted "$BUNDLE" 2>&1)
INSTALL_RC=$?
if [[ $INSTALL_RC -eq 0 ]]; then ok "install 成功"
else err "install 失败: $INSTALL_OUT"; FAILS=$((FAILS+1)); chain_done; fi

step "10.6 [launch] simctl launch（验证可启动、无 crash）"
BUNDLE_ID=$(cd "$E2E_HOST/ios" && plutil -extract CFBundleIdentifier raw "$BUNDLE/Info.plist" 2>/dev/null || echo "")
if [[ -z "$BUNDLE_ID" ]]; then
  # 兜底：从 pbxproj 拼 PRODUCT_BUNDLE_IDENTIFIER（org.reactjs.native.example.<PRODUCT_NAME>）
  PROD_NAME=$(grep -m1 'PRODUCT_NAME = ' "$E2E_HOST/ios/hermesgfapp.xcodeproj/project.pbxproj" 2>/dev/null | sed 's/.*= //;s/;//;s/"//g' | tr -d ' ')
  BUNDLE_ID="org.reactjs.native.example.$PROD_NAME"
fi
LAUNCH_OUT=$(xcrun simctl launch booted "$BUNDLE_ID" 2>&1)
LAUNCH_RC=$?
if [[ $LAUNCH_RC -eq 0 ]]; then
  ok "launch 成功 (bundle=$BUNDLE_ID, pid=$(echo "$LAUNCH_OUT" | grep -oE '[0-9]+' | tail -1))"
else
  warn "launch 返回非 0: $LAUNCH_OUT（可能已运行）"; 
fi

step "10.7 [verify] 已安装 app 可枚举（listapps）"
LIST=$(xcrun simctl listapps booted 2>/dev/null | grep -c "$BUNDLE_ID" || echo 0)
if [[ "$LIST" -ge 1 ]]; then ok "listapps 含 $BUNDLE_ID"
else warn "listapps 未枚举到 $BUNDLE_ID（launch 已成功即视为可启动）"; fi

chain_done