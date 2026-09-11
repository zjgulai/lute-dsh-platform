#!/bin/bash
# DSH Desktop 2.0.4 补丁锚点校验（--verify-anchors 等价物）
# 用途：每次升级/重装后运行，逐项确认 P0 补丁仍在位；漂移即报 DRIFT。
# 用法: ./verify-patches.sh   （全部 OK 退出 0，有漂移退出 1）
#
# 三条执行纪律（2026-08-30 实测教训，改补丁前必读）：
# 1. 预设平面包（standard preset 行，如 dsh-tool-subagent）的 profile override
#    惰性失效——必须直补 checkout 副本（app.asar.unpacked/node_modules/@deepseek-ai/...）；
#    本脚本的 P0-4 checkout 锚点正是为此。见 issues/A-8。
# 2. pnpm 的 file: 依赖是【副本】而非符号链接——改本地 fork 源码后须重跑
#    pnpm install（或 cp 同步），否则 node_modules 仍跑旧码。
# 3. 改 client bundle 后【整机重启】验收；Cmd+R 热重载在无 dev:web 时会把
#    renderer 弄进残缺状态（composer 未挂载实录）。
set -u
# 路径参数化（随包分发时由 install.sh 显式传入）：
#   DSH_APP   —— 已补丁 app 位置（默认 /Applications/DSH Desktop.app）
#   DSH_HOME  —— DSH 数据根（默认 ~/.dsh）
#   LING_SRC  —— dsh-memory-local fork 源（默认 ~/project/Magpie-Horch/dsh-memory-local）
DSH_APP="${DSH_APP:-/Applications/DSH Desktop.app}"
DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
# 路径解析器：必须在任何使用之前定义（曾因定义顺序错误让所有锚点取到空路径）。
resolve_dir() { # 回显第一个存在的候选目录，都没有则返回非零
  local cand
  for cand in "$@"; do
    [ -d "$cand" ] && { printf '%s' "$cand"; return 0; }
  done
  return 1
}
missing=0
require_dir() { # name path —— 缺失时显式记账，避免 grep 空结果被当成「0 次命中」通过
  local name="$1" path="$2"
  if [ -z "$path" ] || [ ! -d "$path" ]; then
    echo "[MISSING] $name: 目标目录不存在（锚点无法判定，不等于通过）"
    fail=1
    missing=1
    return 1
  fi
  return 0
}
# 归组后 fork 源在 packages/capabilities/（旧路径 ~/project/Magpie-Horch/dsh-memory-local
# 在 ADR-0011 后已不存在，曾导致 2 个锚点静默空转）。
LING="${LING_SRC:-$(resolve_dir "$(dirname "${BASH_SOURCE[0]}")/../packages/capabilities/dsh-memory-local" "$HOME/project/Magpie-Horch/packages/capabilities/dsh-memory-local" || true)}"
CHK="$DSH_APP/Contents/Resources/app.asar.unpacked/lib"
CORE="$DSH_APP/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai"
PROF="$(resolve_dir "$DSH_HOME_DIR/profiles/desktop/node_modules/@deepseek-ai" "$DSH_HOME_DIR/profiles/node_modules/@deepseek-ai" || true)"
NOEMA="$DSH_HOME_DIR/profiles/desktop/node_modules/@zseven-w/dsh-noema"
DM="$DSH_HOME_DIR/profiles/desktop/node_modules/dshmarket"
fail=0

check() { # name expected actual
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "[ok] $name"
  else
    echo "[DRIFT] $name: expected=$expected actual=$actual"
    fail=1
  fi
}

# ---- P0-1 更新器（electron-runtime） ----
# 该 bundle 以**内容哈希**命名（electron-runtime-<hash>.js），上游每次构建都会改哈希。
# 锚点曾写死 electron-runtime-DS52LbUW.js，build 一变即全部静默失效——这是重锚成本的主要来源。
# 改为 glob 定位；找不到时显式报告，不再让 grep 空结果被当作「0 次命中」通过。
ER="$(ls "$CHK"/electron-runtime-*.js 2>/dev/null | head -1)"
require_dir "P0-1 electron-runtime bundle" "$(dirname "$ER" 2>/dev/null)" || true
[ -f "$ER" ] || { echo "[MISSING] P0-1 electron-runtime bundle: 未找到 $CHK/electron-runtime-*.js"; fail=1; missing=1; }
check "P0-1 openPath 自动执行已移除" 0 "$(grep -c 'shell.openPath(artifactPath)' "$ER" 2>/dev/null || true)"
check "P0-1 Windows spawn 已移除" 0 "$(grep -c 'launchWindowsUpdateInstaller(artifactPath)' "$ER" 2>/dev/null || true)"
check "P0-1 setPermissionRequestHandler" 1 "$(grep -c 'setPermissionRequestHandler' "$ER" 2>/dev/null || true)"
check "P0-1 openExternal 仅 mailto" 0 "$(grep -c 'target.protocol === "https:"' "$ER" 2>/dev/null || true)"

# ---- P0-2 静默回滚日志 ----
check "P0-2 main.js restore 日志" 1 "$(grep -c 'restoring profile checkpoint slot' "$CHK/main.js" 2>/dev/null || true)"
check "P0-2 dshmarket restore 日志" 1 "$(grep -c 'restoreProfileBackup: restoring' "$DM/lib/backup.js" 2>/dev/null || true)"

# ---- P0-3 compaction（dsh-llm override） ----
check "P0-3 compaction 补丁在位（内容锚点）" 1 "$(grep -Fc 'adapter.imageRequestPricing?.' "$CORE/dsh-llm/lib/index.js" 2>/dev/null || true)"
check "P0-3 lib/index.js ?.()" 1 "$(grep -Fc 'adapter.imageRequestPricing?.' "$PROF/dsh-llm/lib/index.js" 2>/dev/null || true)"
check "P0-3 lib/types/index.js ?.()" 1 "$(grep -Fc 'adapter.imageRequestPricing?.' "$PROF/dsh-llm/lib/types/index.js" 2>/dev/null || true)"

# ---- P0-4 agent-dispose ----
check "P0-4 tool-subagent 补丁在位（内容锚点）" 1 "$(grep -Fc 'Promise.resolve(fiber.dispose())' "$CORE/dsh-tool-subagent/lib/index.js" 2>/dev/null || true)"
check "P0-4 file-ref types" 1 "$(grep -Fc 'Promise.resolve(fiber.dispose())' "$PROF/dsh-file-reference-local/lib/types/index.js" 2>/dev/null || true)"
check "P0-4 checkout tool-subagent" 1 "$(grep -Fc 'Promise.resolve(fiber.dispose())' "$CORE/dsh-tool-subagent/lib/index.js" 2>/dev/null || true)"
check "P0-4 checkout file-ref index" 1 "$(grep -Fc 'Promise.resolve(fiber.dispose())' "$CORE/dsh-file-reference-local/lib/index.js" 2>/dev/null || true)"
check "P0-4 checkout file-ref types" 1 "$(grep -Fc 'Promise.resolve(fiber.dispose())' "$CORE/dsh-file-reference-local/lib/types/index.js" 2>/dev/null || true)"

# ---- P0-5 记忆 ----
check "P0-5 Noema 真实 ok" 1 "$(grep -Fc 'const { ok, ...status }' "$NOEMA/lib/status-route.js" 2>/dev/null || true)"
check "P0-5 Noema 原子写" 1 "$(grep -Fc 'rename(tmpPath, path)' "$NOEMA/lib/import-service.js" 2>/dev/null || true)"
check "P0-5 LingShu python3" 1 "$(grep -Fc "darwin' ? 'python3'" "$LING/lib/index.js" 2>/dev/null || true)"
check "P0-5 LingShu depth 过滤" 1 "$(grep -Fc 'header?.delegationDepth' "$LING/lib/hooks.js" 2>/dev/null || true)"
check "P0-5 dbPath 绝对化" 1 "$(grep -c 'dbPath:' "$DSH_HOME_DIR/profiles/desktop/cordis.patch.yml" 2>/dev/null || true)"

# ---- P0-6 权限/隐私 ----
check "P0-6 .dmp 已排除" 0 "$(grep -c 'endsWith(".dmp")) entries.push' "$CHK/diagnostic-export-worker.js" 2>/dev/null || true)"

# ---- P0-7 首启 profile 占位替换（main.js，R2b 内嵌兜底路径） ----
check "P0-7 首启兜底 hook（v2/v2c 重锚后）" 1 "$(grep -c 'P0-7v2 LUTE 首启兜底' "$CHK/main.js" 2>/dev/null || true)"

# ---- P0-8 pi-ai lazy import 磁盘化（dsh-llm-pi-ai；客户机器 request extension preparation failed）----
check "P0-8 pi-ai lazy import 磁盘化" 1 "$(grep -c 'P0-8 补丁：pi-ai lazy 模块强制从 unpacked 磁盘加载' "$CORE/dsh-llm-pi-ai/lib/index.js" 2>/dev/null || true)"

# ---- 界面完整性：chatui 修复（加载更早 + 按钮门 + recall 回填） ----
check "chatui 加载更早（session-controller）" 1 "$(grep -Fc 'loadOlder: history page request timed out' "$CORE/dsh-api-session-controller/lib/client.js" 2>/dev/null || true)"
check "chatui 按钮门（client-ui-chat）" 1 "$(grep -Fc 'hasMore && openState === "open"' "$CORE/dsh-client-ui-chat/lib/client.js" 2>/dev/null || true)"
check "chatui recall 链路（conversation）" 2 "$(grep -Fc 'recallPrevious' "$CORE/dsh-client-ui-conversation/lib/client.js" 2>/dev/null || true)"

# ---- 界面完整性：skill 中文标题（title 字段透传） ----
check "skill-title dsh-skill" 1 "$(grep -Fc 'skill.title !== void 0 ? { title: skill.title }' "$CORE/dsh-skill/lib/index.js" 2>/dev/null || true)"
check "skill-title filesystem" 2 "$(grep -Fc 'parsed.title !== void 0 ? { title: parsed.title }' "$CORE/dsh-skill-filesystem/lib/index.js" 2>/dev/null || true)"
check "skill-title tool-skill" 1 "$(grep -Fc 'entry.title ?? null' "$CORE/dsh-tool-skill/lib/index.js" 2>/dev/null || true)"

# ---- 界面完整性：剪贴板 execCommand 兜底 ----
check "clipboard execCommand 兜底" 1 "$(grep -Fc 'document.execCommand === "function" ? document.execCommand.bind(document)' "$CORE/dsh-client-ui-primitives/lib/index.js" 2>/dev/null || true)"

# ---- 附加：profile override 版本胜出检查（防静默失效） ----
# ---- 退役（2026-09-11）：override「版本胜出」判据测的是已不存在的机制 ----
# 实测：dsh-llm / dsh-tool-subagent / dsh-file-reference-local 的 app 侧与 profile 侧
# 文件**逐文件零差异**（diff -rq 差异文件数 = 0）——rc 迁移后补丁直接打进应用 bundle，
# profiles/desktop/node_modules 的 override 副本不再承担作用，故该判据永不成立。
# 保留它只会制造假 DRIFT、训练人忽略输出。
# 覆盖缺口：P0-3 与 P0-4 已由上方内容锚点覆盖；dsh-file-reference-local 无对应内容锚点，
# 是否补一个见 dsh-patches/loop2-4-anchor-drift-evidence.md 的「待决策」节。

echo
if [ "$missing" != 0 ]; then
  echo
  echo "注意：有锚点因目标目录缺失而无法判定——这类锚点**不等于通过**。"
fi

if [ "$fail" = 0 ]; then echo "ALL PATCHES VERIFIED"; else echo "DRIFT DETECTED — see above"; fi
exit $fail
