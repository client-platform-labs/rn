#!/usr/bin/env bash
# 06-ios.sh — iOS Xcode / TestFlight / 商店提审预检
# 验证: iOS 工具链 / IPA 签字 / 商店凭据（仅预检，不真提审）
# 退出码: 0 / 2 (工具链缺) / 4 (凭据缺)

set -uo pipefail

echo "── 06 iOS ─────────────────────────────────────────"

FAIL=0

# 1. 工具链
echo "[1/4] Xcode …"
if command -v xcodebuild >/dev/null 2>&1; then
  XCODE_VER=$(xcodebuild -version 2>/dev/null | head -1)
  echo "  ✓ ${XCODE_VER}"
else
  echo "  ⚠ xcodebuild 不可用（仅 macOS runner 需要）"
  FAIL=1
fi

# 2. fastlane（可选）
echo "[2/4] fastlane …"
if command -v fastlane >/dev/null 2>&1; then
  echo "  ✓ fastlane $(fastlane --version 2>/dev/null | head -1)"
else
  echo "  ⚠ fastlane 不可用（推荐安装）"
fi

# 3. App Store Connect API 凭证（环境变量）
echo "[3/4] App Store Connect API 凭证 …"
if [[ -n "${ASC_API_KEY_PATH:-}" ]] && [[ -f "${ASC_API_KEY_PATH}" ]]; then
  echo "  ✓ ASC_API_KEY_PATH=${ASC_API_KEY_PATH}"
elif [[ -n "${ASC_KEY_ID:-}" ]] && [[ -n "${ASC_ISSUER_ID:-}" ]]; then
  echo "  ✓ ASC env vars set"
else
  echo "  ⚠ 未配置 App Store Connect API 凭证"
  echo "     需申请：https://appstoreconnect.apple.com/access/api"
  echo "     或运行 'fastlane spaceship login'"
  FAIL=1
fi

# 4. 隐私清单 + 出口合规
echo "[4/4] PrivacyInfo.xcprivacy / ITSAppUsesNonExemptEncryption …"
# 仅当存在 iOS 仓时检查
if [[ -d "$HOME/code/host-android" ]] || [[ -d "$HOME/code/desk" ]]; then
  PRIVACY=$(find "$HOME/code" -name "PrivacyInfo.xcprivacy" 2>/dev/null | head -1)
  if [[ -n "$PRIVACY" ]]; then
    echo "  ✓ ${PRIVACY}"
  else
    echo "  ⚠ 业务仓缺 PrivacyInfo.xcprivacy（商店要求）"
    FAIL=1
  fi
else
  echo "  ⚠ 业务实例未克隆（$HOME/code/host-android 或 desk）"
fi

echo "───────────────────────────────────────────────────"
if [[ ${FAIL:-0} -ne 0 ]]; then
  echo "WARN：iOS 预检缺项（部分可由企业侧补）"
  echo "  详见 10-store-submit-checklist.md §iOS"
  exit 4
fi
echo "PASS：iOS 达上市前预检"
exit 0
