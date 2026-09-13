#!/bin/bash
# tcc-grant-status-test.sh —— tcc-grant-status.sh 的反向自测
#
# 为什么必须有它：本仓库已经两次栽在同一件事上——判据看起来在判，其实是空转
# （`csreq -t` 从不读目标，恒以 0 退出；`codesign -d -r- <相对路径>` 静默失败但退出码 0）。
# 「死授权检出」这条判据如果永远不会说不，那它就是一张安慰纸。
#
# 本自测用**合成库 + 合成 app** 造出三种夹具（系统库里造不出「死授权」那一行：造它需要一次
# 真实的授权动作），逐一断言退出码；最后再做一次**恒真桩突变**——把实现里喊「死授权」的那
# 一支改成 `exit 0`，R1 必须因此失败。突变那一步才真正证明前三条断言有牙。
#
# 用法: bash packaging/scripts/tcc-grant-status-test.sh
# 退出码: 0 = 全绿；1 = 有断言失败
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SUT="$HERE/tcc-grant-status.sh"
IDENTITY="${LUTE_SIGN_IDENTITY:-LUTE Code Signing}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); printf '  [PASS] %s\n' "$1"; }
no(){ FAIL=$((FAIL+1)); printf '  [FAIL] %s\n' "$1"; }

[ -f "$SUT" ] || { echo "[自测] 找不到被测脚本: $SUT" >&2; exit 1; }
if ! security find-identity -v -p codesigning 2>/dev/null | grep -qF "\"$IDENTITY\""; then
  echo "[自测] 本机没有签名身份「${IDENTITY}」——夹具需要一个**稳定身份**的 app（adhoc 的 DR 是 cdhash，"
  echo "       无法造出「身份型但被顶掉」的那一行）。跳过：本次未判定。"
  exit 0
fi

# ── 夹具构造 ────────────────────────────────────────────────────────────────
mkapp(){ # $1=路径 $2=bundle id
  mkdir -p "$1/Contents/MacOS"
  printf '#!/bin/sh\nexit 0\n' > "$1/Contents/MacOS/payload"
  chmod +x "$1/Contents/MacOS/payload"
  cat > "$1/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>$2</string>
<key>CFBundleName</key><string>fixture</string>
<key>CFBundleExecutable</key><string>payload</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
</dict></plist>
PLIST
  codesign --force --sign "$IDENTITY" --identifier "$2" "$1" >/dev/null 2>&1
}

dr_of(){ codesign -d -r- "$1" 2>&1 | sed -n 's/^#* *designated => //p'; }

mkdb(){ # $1=db 路径
  rm -f "$1"
  sqlite3 "$1" 'create table access(service text, client text, auth_value integer, csreq blob);'
}

putrow(){ # $1=db $2=service $3=client $4=auth_value $5=要求文本
  printf '%s' "$5" > "$TMP/req.txt"
  csreq -r "$TMP/req.txt" -b "$TMP/req.bin" >/dev/null 2>&1
  sqlite3 "$1" "insert into access(service,client,auth_value,csreq) values('$2','$3',$4,readfile('$TMP/req.bin'));"
}

run(){ # $1=脚本 $2=db $3=app $4=bundle id [其余参数原样转发给被测脚本] → 回显退出码，正文落 $TMP/out
  LUTE_TCC_DB="$2" LUTE_TCC_APP="$3" LUTE_TCC_BUNDLE_ID="$4" bash "$1" "${@:5}" >"$TMP/out" 2>&1
  echo $?
}

echo "== tcc-grant-status.sh 反向自测 =="
mkapp "$TMP/a.app" com.lute.rv-a
mkapp "$TMP/b.app" com.lute.rv-b
mkapp "$TMP/c.app" com.lute.rv-c

# ── R1 死授权：auth_value=2，但要求钉的是**另一段身份** ──────────────────────
mkdb "$TMP/r1.db"
putrow "$TMP/r1.db" kTCCServiceAccessibility com.lute.rv-a 2 'identifier "com.lute.someone-else" and certificate leaf = H"0000000000000000000000000000000000000000"'
rc="$(run "$SUT" "$TMP/r1.db" "$TMP/a.app" com.lute.rv-a)"
if [ "$rc" = "3" ] && grep -q '死授权' "$TMP/out"; then ok "R1 死授权 → 退出 3 且点名「死授权」"
else no "R1 期望「退出 3 + 死授权」，实得 rc=$rc / $(head -c 200 "$TMP/out" | tr '\n' ' ')"; fi

# ── R2 有效授权：要求 = app 自己的指定要求（必须绿，否则检出器会制造假警报）──
mkdb "$TMP/r2.db"
putrow "$TMP/r2.db" kTCCServiceAccessibility com.lute.rv-b 2 "$(dr_of "$TMP/b.app")"
rc="$(run "$SUT" "$TMP/r2.db" "$TMP/b.app" com.lute.rv-b)"
if [ "$rc" = "0" ] && grep -q '授权有效' "$TMP/out"; then ok "R2 有效授权 → 退出 0 且判「有效」"
else no "R2 期望「退出 0 + 有效」，实得 rc=$rc / $(head -c 200 "$TMP/out" | tr '\n' ' ')"; fi

# ── R3 封条破损：破损的封条对任何要求都返回不满足，绝不能被说成「死授权」──────
mkdb "$TMP/r3.db"
putrow "$TMP/r3.db" kTCCServiceAccessibility com.lute.rv-c 2 'identifier "com.lute.someone-else"'
printf '\n# 签名后追加一个字节 → 封条破损\n' >> "$TMP/c.app/Contents/MacOS/payload"
codesign --verify --deep --strict "$TMP/c.app" >/dev/null 2>&1 \
  && { no "R3 夹具无效：预期封条破损，实测仍通过"; } \
  || {
    rc="$(run "$SUT" "$TMP/r3.db" "$TMP/c.app" com.lute.rv-c)"
    if [ "$rc" = "4" ] && ! grep -q '死授权' "$TMP/out"; then ok "R3 封条破损 → 退出 4（判不了），且**不**误报死授权"
    else no "R3 期望「退出 4 且不报死授权」，实得 rc=$rc / $(head -c 200 "$TMP/out" | tr '\n' ' ')"; fi
  }

# ── R4 无记录：新机器形态，不是错误 ─────────────────────────────────────────
mkdb "$TMP/r4.db"
rc="$(run "$SUT" "$TMP/r4.db" "$TMP/b.app" com.lute.rv-b)"
if [ "$rc" = "0" ] && grep -q '尚未授权' "$TMP/out"; then ok "R4 无记录 → 退出 0 且判「尚未授权」（不制造假警报）"
else no "R4 期望「退出 0 + 尚未授权」，实得 rc=$rc"; fi

# ── R5 有记录但要求解不出：既不能说满足，也不能说死授权 ─────────────────────
# 真实形态：该行的 csreq 为 NULL（某些服务确实会这样）。此时 csreq 会在 stderr 抱怨
# 「No such file or directory」。早先的实现把**这条错误文本**当成了「库里存的要求」，
# 于是打印出一行假的要求、并给出「授权绑定在旧字节上，需重授一次」这个错误处置。
mkdb "$TMP/r5.db"
sqlite3 "$TMP/r5.db" "insert into access(service,client,auth_value,csreq) values('kTCCServiceAccessibility','com.lute.rv-b',2,NULL);"
rc="$(run "$SUT" "$TMP/r5.db" "$TMP/b.app" com.lute.rv-b)"
# 断言里不能直接 grep '死授权'：判「判不了」那段正文里就有「也不能判它是死授权」这句话
# ——第一版断言就是这么被自己的措辞绊倒的。要断言的是**没走到死授权那一支**，即以 ✗ 开头的判决行。
if [ "$rc" = "4" ] && grep -q '解不出' "$TMP/out" && ! grep -q '✗' "$TMP/out" && ! grep -q 'No such file' "$TMP/out"; then
  ok "R5 要求解不出 → 退出 4，且不把工具错误文本当要求、不谎报死授权"
else no "R5 期望「退出 4 + 解不出 + 无死授权 + 无工具错误文本」，实得 rc=$rc / $(head -c 240 "$TMP/out" | tr '\n' ' ')"; fi

# R5b：同一情形下 TSV 不得出现空字段。`IFS=$'\t' read` 会把连续制表符之间的空字段折叠掉
# （制表符是 IFS 空白，空白分隔符的连续段算一个），后面的列会集体左移——这一条正是 R5
# 抓出来的第二个缺陷：判定列读到了形态列的值，「判不了」被算成「1 项授权有效」。
run "$SUT" "$TMP/r5.db" "$TMP/b.app" com.lute.rv-b --format=tsv >/dev/null
empty="$(awk -F'\t' '{for(i=1;i<=NF;i++) if($i=="") n++} END{print n+0}' "$TMP/out")"
if [ "$empty" = "0" ] && [ "$(awk -F'\t' 'NF!=6' "$TMP/out" | wc -l | tr -d ' ')" = "0" ]; then
  ok "R5b 解不出的行在 TSV 里仍占满 6 列（空字段已用占位符，列不左移）"
else no "R5b TSV 有 $empty 个空字段 / 列数异常：$(head -c 200 "$TMP/out" | tr '\n' ' ')"; fi

# ── R6 非必需项的假死授权，不得污染结论 ─────────────────────────────────────
# 「输入监控」在 2026-09-13 被实测排除在必需项之外（post_events 由辅助功能承载）。
# 若把非必需项算进结论，一条残留的旧授权就会让安装收尾对用户喊「死授权、去重授」——
# 而那一项授了也没有任何用。必需项全绿时，结论必须是绿。
mkdb "$TMP/r6.db"
putrow "$TMP/r6.db" kTCCServiceAccessibility com.lute.rv-b 2 "$(dr_of "$TMP/b.app")"
putrow "$TMP/r6.db" kTCCServiceScreenCapture com.lute.rv-b 2 "$(dr_of "$TMP/b.app")"
putrow "$TMP/r6.db" kTCCServiceListenEvent  com.lute.rv-b 2 'identifier "com.lute.someone-else" and certificate leaf = H"0000000000000000000000000000000000000000"'
rc="$(run "$SUT" "$TMP/r6.db" "$TMP/b.app" com.lute.rv-b)"
if [ "$rc" = "0" ] && grep -q '2 项授权有效' "$TMP/out" && grep -q '非必需' "$TMP/out"; then
  ok "R6 非必需项的死授权不影响结论（仍判 2 项有效）"
else no "R6 期望「退出 0 + 2 项有效」，实得 rc=$rc / $(head -c 240 "$TMP/out" | tr '\n' ' ')"; fi

# ── R7 TSV 契约：verify-tcc-runtime.sh 靠它取数，列义漂移必须当场暴露 ────────
mkdb "$TMP/r7.db"
putrow "$TMP/r7.db" kTCCServiceAccessibility com.lute.rv-b 2 "$(dr_of "$TMP/b.app")"
rc="$(run "$SUT" "$TMP/r7.db" "$TMP/b.app" com.lute.rv-b --format=tsv)"
bad=""
[ "$(printf '%s\n' "$(cat "$TMP/out")" | grep -c .)" = "4" ] || bad="行数不是 4"
[ "$(awk -F'\t' 'NF!=6' "$TMP/out" | wc -l | tr -d ' ')" = "0" ] || bad="有行不是 6 列"
[ "$(awk -F'\t' '$2!="required" && $2!="optional"' "$TMP/out" | wc -l | tr -d ' ')" = "0" ] || bad="kind 列不是 ASCII required/optional"
[ "$(cut -f2 "$TMP/out" | grep -c '^required$')" = "2" ] || bad="required 行数应为 2（辅助功能 + 屏幕录制）"
[ "$(cut -f2 "$TMP/out" | grep -c '^optional$')" = "2" ] || bad="optional 行数应为 2"
[ "$(sed -n '1p' "$TMP/out" | cut -f1)" = "kTCCServiceAccessibility" ] || bad="首行不是必需项"
grep -q '结论' "$TMP/out" && bad="stdout 混进了散文"
if [ "$rc" = "0" ] && [ -z "$bad" ]; then ok "R7 --format=tsv 输出 4 行 × 6 列、必需在前、stdout 只有数据"
else no "R7 期望「退出 0 + 干净 6 列 TSV」，实得 rc=$rc / ${bad:-ok}"; fi

# ── M1 恒真桩突变：证明 R1 有牙 ─────────────────────────────────────────────
# 把实现里唯一那一处 `exit 3` 改成 `exit 0`，再跑 R1。R1 必须因此失败——
# 否则它测的就不是实现，而是别的东西。
n=$(grep -c '^  exit 3$' "$SUT")
if [ "$n" != "1" ]; then
  no "M1 突变锚点不唯一（'  exit 3' 出现 $n 次）——自测的牙齿本身失效了，请同步更新突变锚"
else
  sed 's/^  exit 3$/  exit 0/' "$SUT" > "$TMP/stub.sh"
  rc="$(run "$TMP/stub.sh" "$TMP/r1.db" "$TMP/a.app" com.lute.rv-a)"
  if [ "$rc" != "3" ]; then ok "M1 恒真桩下 R1 失败（rc=${rc}）→ 前三条断言有牙"
  else no "M1 恒真桩下 R1 仍判死授权（rc=3）→ R1 与实现无关，是空转"; fi
fi

echo
echo "== 结果: ${PASS} 通过 / ${FAIL} 失败 =="
[ "$FAIL" -eq 0 ] || exit 1
exit 0
