#!/bin/bash
# pkg-postinstall.sh —— DSH Desktop LUTE .pkg 安装后脚本（由 Installer 以 root 运行）
#
# 职责拆分（防 root 属主污染 ~/.dsh——客户机器历史坑）：
#   1. root 落位 app 到 /Applications（Installer 已获管理员授权，无需二次密码框）
#   2. 切回登录用户跑 install.sh（LUTE_INSTALL_APP=0 跳过 app 段），
#      profile/skills/aeis 全部用户属主落盘，后续升级可正常覆盖
#
# 载荷位置：/Library/Application Support/LUTE/payload（pkg 组件包 install-location=/ 写入）
set -euo pipefail
PKG_PAYLOAD="/Library/Application Support/LUTE/payload"
APP_TARGET="/Applications/DSH Desktop.app"
INSTALL_SH="$PKG_PAYLOAD/install.sh"
STAMP="$(date +%Y%m%d-%H%M%S)"
say(){ echo "[lute-pkg] $*"; }

# 登录用户探测（无 GUI 登录会话时回退到 $HOME 属主）
USER_NAME="$(stat -f %Su /dev/console 2>/dev/null || true)"
if [ -z "$USER_NAME" ] || [ "$USER_NAME" = "root" ] || [ "$USER_NAME" = "loginwindow" ]; then
  USER_NAME="$(ls -l /dev/console | awk '{print $3}')"
fi
if [ -z "$USER_NAME" ] || [ "$USER_NAME" = "root" ]; then
  say "未检测到登录用户，中止（pkg 必须由已登录用户安装）"; exit 1
fi
USER_HOME="$(dscl . -read "/Users/$USER_NAME" NFSHomeDirectory 2>/dev/null | awk '{print $2}')"
[ -n "$USER_HOME" ] && [ -d "$USER_HOME" ] || { say "用户 $USER_NAME 的 home 不可用: $USER_HOME"; exit 1; }
say "登录用户: $USER_NAME ($USER_HOME)"

# ── 1. app 落位（root）────────────────────────────────────────────────────────
if [ ! -f "$PKG_PAYLOAD/DSH Desktop.app.tar.gz" ]; then
  say "载荷缺失: $PKG_PAYLOAD/DSH Desktop.app.tar.gz"; exit 1
fi
if [ -d "$APP_TARGET" ]; then
  say "已有 $APP_TARGET → 备份为 $APP_TARGET.pre-lute-$STAMP"
  mv "$APP_TARGET" "$APP_TARGET.pre-lute-$STAMP"
fi
tar --no-same-owner -xzf "$PKG_PAYLOAD/DSH Desktop.app.tar.gz" -C /Applications
xattr -dr com.apple.quarantine "$APP_TARGET" 2>/dev/null || true
say "app 就位 $APP_TARGET"

# ── 2. profile/skills/aeis（切登录用户，保证 ~/.dsh 用户属主）────────────────────
# 以登录用户身份运行 install.sh；环境变量经 env 传入，su 引号安全
su - "$USER_NAME" -c "env DSH_HOME='$USER_HOME/.dsh' APP_TARGET='$APP_TARGET' LUTE_INSTALL_APP=0 bash '$INSTALL_SH'"
RC=$?
if [ $RC -ne 0 ]; then
  say "profile 安装失败（install.sh exit=$RC）——app 已落位，请修复后重跑：LUTE_INSTALL_APP=0 bash '$INSTALL_SH'"
  exit $RC
fi
say "LUTE $USER_NAME 安装完成：app + profile + 技能/预设 + 灵枢均已落位"
say "提示：重启 DSH Desktop 后重新授权 TCC（录屏/辅助功能/自动化）"
exit 0
