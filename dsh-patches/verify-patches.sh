#!/bin/bash
# ⚠️ 已退役（2026-09-11）——请使用 packaging/verify-patches-v2.sh
#
# 退役理由（实测，见 dsh-patches/loop2-4-anchor-drift-evidence.md）：
#   1. 本脚本把 electron-runtime bundle 的**内容哈希文件名**写死
#      （electron-runtime-DS52LbUW.js），而上游每次构建都会改哈希
#      （当前为 DLNj0vyk）→ 4 个 P0-1 锚点返回空值，其中两个期望值正好是 0
#      因而**假通过**。
#   2. 它只有 30 个锚点，而 v2 有 35 个（含 P0-1v2/P0-2v2/P0-7v2 等重锚后的项）。
#   3. 两个脚本并存会产生**假 DRIFT**：本脚本报 6 处漂移，v2 同一环境全绿
#      （OK=35 FAIL=0 exit=0）。假阳性会训练人忽略输出，真正的漂移就藏进噪音里。
#
# 「重锚 3-5 人日/窗口」的一部分成本，正是来自维护这个已被取代的脚本。
#
# 权威校验：packaging/verify-patches-v2.sh（已用 glob 解析哈希名，并带文件缺失的
# MISSING 语义）。本文件保留仅为指向新位置，不再维护锚点。
echo "本脚本已退役——请运行 packaging/verify-patches-v2.sh" >&2
echo "用法：DSH_APP=\"/Applications/DSH Desktop.app\" ./packaging/verify-patches-v2.sh" >&2
exit 2
