#!/bin/bash
# verify-patches v2 — LUTE 2.0.0（DSH 2.0.5/rc.1）补丁锚点校验
# 用法: ./verify-patches-v2.sh                       # 默认校验当前权威 staging 树
#       DSH_APP=<staging app> ./verify-patches-v2.sh
#       STAGE_VERSION=<版本> ./verify-patches-v2.sh   # 换一棵 staging 树
set -u
# 默认目标 = 当前权威 staging 树。把历史版本号（曾为 2.0.0）硬编码在默认值里，会随目录裁剪
# 变成结构性红灯：表现为 35 条 MISSING，与「补丁真的漂移」在输出上不可区分。
# 改为可覆盖的版本变量，并在推导出的树不存在时响亮失败。
PKG_ROOT="$(cd "$(dirname "$0")" && pwd)"
STAGE_VERSION="${STAGE_VERSION:-2.3.1}"
DSH_APP="${DSH_APP:-}"
if [ -z "$DSH_APP" ]; then
  if [ -d "$PKG_ROOT/staging/$STAGE_VERSION/app/DSH Desktop.app" ]; then
    DSH_APP="$PKG_ROOT/staging/$STAGE_VERSION/app/DSH Desktop.app"
  elif [ -d "$PKG_ROOT/app/DSH Desktop.app" ]; then
    # 随 payload 分发时（拷到 payload/tools/），脚本旁就是 app/，没有 staging/ 层。
    DSH_APP="$PKG_ROOT/app/DSH Desktop.app"
  else
    DSH_APP="$PKG_ROOT/staging/$STAGE_VERSION/app/DSH Desktop.app"
  fi
fi
if [ ! -d "$DSH_APP" ]; then
  echo "FAIL 目标 app 不存在: $DSH_APP"
  echo "     现有 staging 树: $(ls "$PKG_ROOT/staging" 2>/dev/null | grep -v '\.log$' | tr '\n' ' ')"
  echo "     用 STAGE_VERSION=<版本> 或 DSH_APP=<app 路径> 指定要校验的树。"
  exit 1
fi
NM="$DSH_APP/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai"
LIB="$DSH_APP/Contents/Resources/app.asar.unpacked/lib"
fail=0
# hash 名 bundle glob 解析（源码构建后 hash 随内容变化；BASE=dmg 时亦兼容）
glob1(){ local dir="$1" pat="$2"; local f; f=$(ls "$dir"/$pat 2>/dev/null | grep -v '\.map$' | head -1); echo "${f:-/nonexistent}"; }
LIB_ER="$(glob1 "$LIB" 'electron-runtime-*.js')"
LIB_PM="$(glob1 "$LIB" 'profile-manager-*.js')"
ck(){ # ck <label> <file> <marker> [expected]
  local n
  # 目标文件缺失必须响亮：否则 grep 空结果与「标记不存在」不可区分，
  # 会把「文件没了」读成「补丁没打」，或反之造成假通过。
  if [ ! -f "$2" ]; then echo "MISSING $1 (target absent: $2)"; fail=1; return; fi
  n=$(grep -cF "$3" "$2" 2>/dev/null || true); n=${n:-0}; n=$(echo "$n" | tr -d " \n")
  if [ "${n:-0}" -ge "${4:-1}" ]; then echo "OK   $1 ($n)"; else echo "FAIL $1 (found $n, want >=${4:-1})"; fail=1; fi
}
ck "P0-1v2 更新守卫"        "$LIB_ER" "Update installation is disabled for security"
ck "P0-2v2 恢复日志"        "$LIB/main.js" "Profile checkpoint restored: package.json will be modified."
ck "P0-3 llm 主文件"        "$NM/dsh-llm/lib/index.js" "imageRequestPricing?.(provider, model)"
ck "P0-3 llm types"         "$NM/dsh-llm/lib/types/index.js" "imageRequestPricing?.(provider, model)"
ck "P0-4 tool-subagent"     "$NM/dsh-tool-subagent/lib/index.js" "Promise.resolve(fiber.dispose())"
ck "P0-4 file-ref"          "$NM/dsh-file-reference-local/lib/index.js" "Promise.resolve(fiber.dispose())"
ck "P0-4 file-ref types"    "$NM/dsh-file-reference-local/lib/types/index.js" "Promise.resolve(fiber.dispose())"
ck "P0-6v2 外链白名单"      "$LIB_ER" 'target.protocol === "mailto:"'
ck "P0-6v2 权限门"          "$LIB_ER" "setPermissionRequestHandler"
ck "P0-6c dmp 排除"         "$LIB/diagnostic-export-worker.js" 'endsWith(".dmp")'
ck "P0-6c 脱敏"             "$LIB/diagnostic-export-worker.js" "_desensitized"
ck "P0-7v2 首启兜底(main.js)"  "$LIB/main.js" "embeddedRoot"
ck "P0-7v2 首启兜底(首启真实路径)"  "$LIB_PM" "embeddedRoot"
ck "P0-7v2c wizard 状态保护"  "$LIB/main.js" 'activeProfileDir, "vendor")'
ck "P0-8 pi-ai 磁盘化"      "$NM/dsh-llm-pi-ai/lib/index.js" "PI_AI_API_DIR"
ck "P0-9 RootOutlet 兜底"   "$NM/dsh-client-ui-renderer/lib/client.js" "data-slot-waiting"
ck "RECOVERY_DOCUMENT"      "$LIB/main.js" 'app.asar.unpacked'
ck "clipboard fall-through" "$NM/dsh-client-ui-primitives/lib/index.js" "fall through to the legacy"
ck "LB log 改名"            "$NM/dsh-session-log-export/lib/client.js" 'dsh-log-btn-fix'
ck "LB 迁移器"              "$NM/dsh-session-log-export/lib/client.js" "session-log-download: relocate beside sidebar settings"
ck "PR-1 parse icon"        "$NM/dsh-agent-presets/lib/index.js" "record.icon === void 0 ? {} : { icon: record.icon }"
ck "PR-1 serialize icon"    "$NM/dsh-agent-presets/lib/index.js" "preset.icon === void 0 ? {} : { icon: preset.icon }"
ck "PR-2/5 avatar"          "$NM/dsh-client-ui-agent-preset/lib/client.js" "bC90nG_cardAvatar"
ck "PR-2/5 绿晕"            "$NM/dsh-client-ui-agent-preset/lib/client.js" "radial-gradient(120% 90% at 12% 0%,color-mix(in srgb,#58B848 8%"
ck "skill-title skill"      "$NM/dsh-skill/lib/index.js" "title must be a string"
ck "skill-title filesystem" "$NM/dsh-skill-filesystem/lib/index.js" "optionalString(parsed.data, \"title\")"
ck "skill-title tool-skill" "$NM/dsh-tool-skill/lib/index.js" "skill.title"
ck "skill-title controller" "$NM/dsh-api-session-controller/lib/index.js" "skill.title"
ck "skill-title remotes"    "$NM/dsh-api-remotes/lib/client.js" "\"title\": string().readonly().optional()"
ck "skill-title ui-skill"   "$NM/dsh-client-ui-skill/lib/client.js" "skill.title ?? skill.name"
ck "chatui loadOlder 自愈"  "$NM/dsh-api-session-controller/lib/client.js" "loadOlder blocked"
ck "chatui lastOwnMessage"  "$NM/dsh-api-session-controller/lib/client.js" "lastOwnMessage"
ck "chatui 按钮门"          "$NM/dsh-client-ui-chat/lib/client.js" "hasMore && openState === \"open\""
ck "chatui 上箭头 recall"   "$NM/dsh-client-ui-conversation/lib/client.js" "recallPrevious"
ck "cordis clamp"           "$NM/cordis/lib/index.js" "Math.max(0, index - info.offset)"
ck "loader B-4 回滚"        "$NM/cordis-plugin-loader/lib/index.js" "Object.keys(newMap).reverse()"
ck "G1 HMR 生产守卫"        "$NM/dsh-client-hmr/lib/index.js" "Production guard (2026-09-13)"
ck "G2 console 转发"        "$LIB_ER" "console-message"
echo
[ "$fail" = "0" ] && echo "PATCHES v2 ALL VERIFIED" || echo "PATCHES v2 DRIFT"
exit $fail
