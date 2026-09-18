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
# 资源根双形态（2026-09-17，2.0.10 基座迁移）：no-ASAR Resources/app ⇄ 旧 2.0.5
# app.asar.unpacked。判定规则的唯一家是 scripts/lib/app-resources.mjs；本脚本随包
# 分发（payload/tools/），内联等价判定（app 存在且无 app.asar[.unpacked] → no-asar）。
# 锚集刷新（manifest v3，2026-09-17 11:55）：完成 0.1.2/2.0.5 → 2.0.10/0.1.5-rc.2
# 整体换锚（P0-2v2→PCA chunk；P0-7v2 main 变体删除；P0-7v2c 待移植显性化；
# PR-2/5 类名 bC90nG→S6drYq；NM 四补丁 session-log/ui-skill/agent-preset/conversation
# 以 0.1.5-rc.2 pristine 重锚）。verify 名称不改（dmg-layout gate 等按文件名引用）。
_RES="$DSH_APP/Contents/Resources"
if [ -d "$_RES/app" ] && [ ! -e "$_RES/app.asar" ] && [ ! -e "$_RES/app.asar.unpacked" ]; then
  _ROOT="$_RES/app"
else
  _ROOT="$_RES/app.asar.unpacked"
fi
NM="$_ROOT/node_modules/@deepseek-ai"
LIB="$_ROOT/lib"
fail=0
# hash 名 bundle glob 解析（源码构建后 hash 随内容变化；BASE=dmg 时亦兼容）
glob1(){ local dir="$1" pat="$2"; local f; f=$(ls "$dir"/$pat 2>/dev/null | grep -v '\.map$' | head -1); echo "${f:-/nonexistent}"; }
LIB_ER="$(glob1 "$LIB" 'electron-runtime-*.js')"
LIB_PM="$(glob1 "$LIB" 'profile-manager-*.js')"
# 2.0.10 锚集刷新（2026-09-17，patches-manifest v3）：上游把检查点恢复/首启清除
# 从 main.ts 拆进 profile-channel-admission chunk（hash glob 捕捉）。
LIB_PCA="$(glob1 "$LIB" 'profile-channel-admission-*.js')"
ck(){ # ck <label> <file> <marker> [expected]
  local n
  # 目标文件缺失必须响亮：否则 grep 空结果与「标记不存在」不可区分，
  # 会把「文件没了」读成「补丁没打」，或反之造成假通过。
  if [ ! -f "$2" ]; then echo "MISSING $1 (target absent: $2)"; fail=1; return; fi
  n=$(grep -cF "$3" "$2" 2>/dev/null || true); n=${n:-0}; n=$(echo "$n" | tr -d " \n")
  if [ "${n:-0}" -ge "${4:-1}" ]; then echo "OK   $1 ($n)"; else echo "FAIL $1 (found $n, want >=${4:-1})"; fail=1; fi
}
ckn(){ # ckn <label> <file> <marker> —— 否定式：符号出现 = 红（守护「绝不…」语义）
  local n
  if [ ! -f "$2" ]; then echo "MISSING $1 (target absent: $2)"; fail=1; return; fi
  n=$(grep -cF "$3" "$2" 2>/dev/null || true); n=${n:-0}; n=$(echo "$n" | tr -d " \n")
  if [ "${n:-0}" -eq 0 ]; then echo "OK   $1 (absent as required)"; else echo "FAIL $1 (found $n, want 0 — 保护面被破坏)"; fail=1; fi
}
ck "P0-1v2 更新守卫"        "$LIB_ER" "Update installation is disabled for security"
ck "P0-2v2 恢复日志"        "$LIB_PCA" "Profile checkpoint restored: package.json will be modified."
ck "P0-3 llm 主文件"        "$NM/dsh-llm/lib/index.js" "imageRequestPricing?.(provider, model)"
ck "P0-3 llm types"         "$NM/dsh-llm/lib/types/index.js" "imageRequestPricing?.(provider, model)"
ck "P0-4 tool-subagent"     "$NM/dsh-tool-subagent/lib/index.js" "Promise.resolve(fiber.dispose())"
ck "P0-4 file-ref"          "$NM/dsh-file-reference-local/lib/index.js" "Promise.resolve(fiber.dispose())"
ck "P0-4 file-ref types"    "$NM/dsh-file-reference-local/lib/types/index.js" "Promise.resolve(fiber.dispose())"
ck "P0-6v2 外链白名单"      "$LIB_ER" 'target.protocol === "mailto:"'
ck "P0-6v2 权限门"          "$LIB_ER" "setPermissionRequestHandler"
ck "P0-6c dmp 排除"         "$LIB/diagnostic-export-worker.js" 'endsWith(".dmp")'
ck "P0-6c 脱敏"             "$LIB/diagnostic-export-worker.js" "_desensitized"
# 2.0.10 锚集刷新（2026-09-17，manifest v3）：main.js 无 embeddedRoot（2.0.10 源的
# main.ts:727 createFreshDesktopProfile 不再有 2.0.5 的内嵌分支；首启真实路径只剩
# materializeDefaultDesktopProfile = P0-7v2b）。main.js 变体删除，保留 profile-manager。
ck "P0-7v2 首启兜底(首启真实路径)"  "$LIB_PM" "embeddedRoot"
# P0-7v2c（2026-09-17 12:20 判定纠正）：2.0.10 上的真实保护面 = 物化默认 profile 的
# chunk 绝不携带 clear 符号（P0-7v2b port 内嵌 p07v2c 语义：materialize 不调
# clearDesktopProfileUsageHistory，dist 实测 profile-manager chunk 无该符号）。
# 上一版把它登记成「待移植」并钉自造 marker——仪器对着自造 marker 而非真实保护面，
# 假 FAIL 会永远阻塞 T-10。改编码为否定式断言：物化 chunk 出现 clear 符号 = 红。
ckn "P0-7v2c 向导保护(物化chunk无clear符号)" "$LIB_PM" 'clearDesktopProfileUsageHistory'
ck "P0-8 pi-ai 磁盘化"      "$NM/dsh-llm-pi-ai/lib/index.js" "PI_AI_API_DIR"
ck "P0-9 RootOutlet 兜底"   "$NM/dsh-client-ui-renderer/lib/client.js" "data-slot-waiting"
ck "RECOVERY_DOCUMENT"      "$LIB/main.js" 'app.asar.unpacked'
ck "clipboard fall-through" "$NM/dsh-client-ui-primitives/lib/index.js" "fall through to the legacy"
ck "LB log 改名"            "$NM/dsh-session-log-export/lib/client.js" 'dsh-log-btn-fix'
ck "LB 迁移器"              "$NM/dsh-session-log-export/lib/client.js" "session-log-download: relocate beside sidebar settings"
ck "PR-1 parse icon"        "$NM/dsh-agent-presets/lib/index.js" "record.icon === void 0 ? {} : { icon: record.icon }"
ck "PR-1 serialize icon"    "$NM/dsh-agent-presets/lib/index.js" "preset.icon === void 0 ? {} : { icon: preset.icon }"
ck "PR-2/5 avatar"          "$NM/dsh-client-ui-agent-preset/lib/client.js" "S6drYq_cardAvatar"
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
