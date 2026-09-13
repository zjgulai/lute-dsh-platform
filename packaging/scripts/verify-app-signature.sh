#!/bin/bash
# 签名完整性守卫（assemble.sh 在签名后与归档前各调用一次）
#
# 为什么需要它：assemble.sh 在签名后立即 `codesign --verify`（自验），但随后还有
# `say "压缩 app…"` 与 `tar` —— **这两步之间任何对 app 的写入都会让 seal 失效，且无声**。
# 实测（2026-09-11）：签名后追加一个字节 → `codesign --verify --deep --strict` 退出码 1
# 并报 "a sealed resource is missing or invalid"；而当前装配链在该位置没有任何断言，
# 于是被改坏的 app 会被静默打进 payload。开发机上「已安装 app 的 seal 破损」正是这类形态的极端版本。
#
# 用法: verify-app-signature.sh <app 路径> [场景说明]
# 退出码: 0 = 签名有效；1 = 签名无效或 app 不存在；2 = 用法错误
set -u

APP="${1-}"
CONTEXT="${2:-归档前}"

if [ -z "$APP" ]; then
  echo "用法: verify-app-signature.sh <app 路径> [场景说明]" >&2
  exit 2
fi

if [ ! -d "$APP" ]; then
  echo "[签名守卫] 失败（${CONTEXT}）：app 不存在: $APP" >&2
  exit 1
fi

REPORT="$(mktemp -t sig-guard)"
trap 'rm -f "$REPORT"' EXIT

# 判定必须用**不带 --verbose** 的形式：adhoc 签名没有证书，`codesign --verify --verbose=N`
# 会因「does not satisfy its designated Requirement」返回 3 —— 那会同时掩盖「好」与「坏」两种情况。
# 注（2026-09-13，ADR-0063）：本仓库的 app 已从 adhoc 改为固定证书签名，上面这条返回 3 的
# 现象对本包不再出现；但「判定不带 verbose」仍是正确选择——它把判定与报告分开，对两种
# 签名形态都成立，换成证书签名后若改回 verbose，反而会让判据依赖签名形态。
# 实测矩阵（2026-09-11，adhoc 签名的最小 bundle）：
#   --verify / --verify --strict / --verify --deep / --verify --deep --strict
#       → 未改=0、改一字节=1（可区分）
#   上述任一再加 --verbose=2 或 =4
#       → 未改=3、改一字节=1（不可区分）
if codesign --verify --deep --strict "$APP" > /dev/null 2>&1; then
  exit 0
fi

# 仅在失败时单独取明细（verbose 只用于读报告，不参与判定）。
# 注意 verbose 形式本身也会以非零退出（adhoc 无证书 → 3），故此处不能用 `|| true` 之外的短路，
# 直接把 stdout+stderr 一并收进报告。
codesign --verify --deep --strict --verbose=4 "$APP" > "$REPORT" 2>&1 || true

echo "[签名守卫] 失败（${CONTEXT}）：codesign --verify --deep --strict 未通过——app 的 seal 已破损。" >&2
echo "            常见成因：签名之后又被写入（补丁重放、图标替换、profile 注入、手工改动）。" >&2
echo "            处置：回到签名步骤重签（assemble.sh 的 adhoc 深签名），不要在签名后改 app。" >&2
if [ -s "$REPORT" ]; then
  # 只挑有诊断价值的行：verbose 输出的绝大多数是 `--prepared:`/`--validated:` 噪音，
  # 真正的成因是 `file modified:` / `file missing:` / 汇总行。若不筛，前 12 行会被噪音占满。
  MEANINGFUL="$(grep -E 'file modified|file missing|sealed resource|does not satisfy|invalid|not signed|^[^ ].*:$' "$REPORT" | head -12)"
  echo "            明细（筛后，最多 12 行）：" >&2
  if [ -n "$MEANINGFUL" ]; then
    printf '%s\n' "$MEANINGFUL" | sed 's/^/              /' >&2
  else
    head -12 "$REPORT" | sed 's/^/              /' >&2
  fi
else
  echo "            明细：codesign 未输出报告（app 可能已被删除或不可读）" >&2
fi
exit 1
