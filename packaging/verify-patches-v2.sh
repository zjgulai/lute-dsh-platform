#!/bin/bash
# verify-patches v2 — LUTE 2.0.0（DSH 2.0.5/rc.1）补丁锚点校验
# 用法: DSH_APP=<staging app> ./verify-patches-v2.sh
set -u
DSH_APP="${DSH_APP:-/Users/lute/project/Magpie-Horch/packaging/staging/2.0.0/app/DSH Desktop.app}"
NM="$DSH_APP/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai"
LIB="$DSH_APP/Contents/Resources/app.asar.unpacked/lib"
fail=0
ck(){ # ck <label> <file> <marker> [expected]
  local n; n=$(grep -cF "$3" "$2" 2>/dev/null || true); n=${n:-0}; n=$(echo "$n" | tr -d " \n")
  if [ "${n:-0}" -ge "${4:-1}" ]; then echo "OK   $1 ($n)"; else echo "FAIL $1 (found $n, want >=${4:-1})"; fail=1; fi
}
ck "P0-1v2 更新守卫"        "$LIB/electron-runtime-DLNj0vyk.js" "Update installation is disabled for security"
ck "P0-2v2 恢复日志"        "$LIB/main.js" "Profile checkpoint restored: package.json will be modified."
ck "P0-3 llm 主文件"        "$NM/dsh-llm/lib/index.js" "imageRequestPricing?.(provider, model)"
ck "P0-3 llm types"         "$NM/dsh-llm/lib/types/index.js" "imageRequestPricing?.(provider, model)"
ck "P0-4 tool-subagent"     "$NM/dsh-tool-subagent/lib/index.js" "Promise.resolve(fiber.dispose())"
ck "P0-4 file-ref"          "$NM/dsh-file-reference-local/lib/index.js" "Promise.resolve(fiber.dispose())"
ck "P0-4 file-ref types"    "$NM/dsh-file-reference-local/lib/types/index.js" "Promise.resolve(fiber.dispose())"
ck "P0-6v2 外链白名单"      "$LIB/electron-runtime-DLNj0vyk.js" "P0-6v2: openExternal"
ck "P0-6v2 权限门"          "$LIB/electron-runtime-DLNj0vyk.js" "setPermissionRequestHandler"
ck "P0-6c dmp 排除"         "$LIB/diagnostic-export-worker.js" "P0-6c: 进程内存转储"
ck "P0-6c 脱敏"             "$LIB/diagnostic-export-worker.js" "P0-6c: Desensitize"
ck "P0-7v2 首启兜底"        "$LIB/main.js" "P0-7v2 LUTE 首启兜底"
ck "P0-8 pi-ai 磁盘化"      "$NM/dsh-llm-pi-ai/lib/index.js" "P0-8 补丁：pi-ai lazy"
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
echo
[ "$fail" = "0" ] && echo "PATCHES v2 ALL VERIFIED" || echo "PATCHES v2 DRIFT"
exit $fail
