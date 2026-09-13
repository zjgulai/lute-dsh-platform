#!/bin/bash
# 自签代码签名身份：一次性建立，之后长期复用（ADR-0063）
#
# 为什么需要它：adhoc 签名的指定要求就是 CDHash 本身，于是「换一版 app」在 macOS 看来
# 等于「换了一个 app」，TCC 授权（辅助功能 / 屏幕录制 / 事件投递）随字节全部失配。改用
# 固定身份的证书签名后，指定要求变成 `identifier + certificate leaf`，与字节无关，
# 重建 / 重发不再重置授权——代价从「每版一次」变成「总共一次」。
#
# 本机实测（2026-09-13，临时钥匙串）：不设信任时 codesign 报 "no identity found"；
# 设信任后同一命令产出 `identifier X and certificate leaf = H"…"`（**无 cdhash**）。
#
# 用法: ensure-signing-identity.sh [身份名]        # 默认 "LUTE Code Signing"
# 退出码: 0 = 身份可用（含「本来就有」）；1 = 建立失败
set -u

IDENTITY="${1:-${LUTE_SIGN_IDENTITY:-LUTE Code Signing}}"
KEYCHAIN="${LUTE_SIGN_KEYCHAIN:-$HOME/Library/Keychains/login.keychain-db}"

# 幂等：已经是有效身份就直接返回，绝不重建（重建＝换身份＝又要重授权一次）
if security find-identity -v -p codesigning "$KEYCHAIN" 2>/dev/null | grep -qF "\"$IDENTITY\""; then
  echo "[身份] 已存在且有效，未做任何改动：$IDENTITY"
  security find-identity -v -p codesigning "$KEYCHAIN" | grep -F "\"$IDENTITY\"" | sed 's/^ *//; s/^/       /'
  exit 0
fi

# 注意（bash 3.2 陷阱，本仓库 afe641c 修过同类三处）：变量后紧跟全角字符必须写成 ${VAR}，
# `$IDENTITY」` 会被解析成变量名 "IDENTITY」" 并报 unbound variable。
echo "[身份] 未找到「${IDENTITY}」，开始建立（自签代码签名证书，有效期 3650 天）…"
WORK="$(mktemp -d -t lute-signing)"
trap 'rm -rf "$WORK"' EXIT

# 1) 自签证书。必须带 codeSigning 的 EKU，否则 codesign 不把它当代码签名身份。
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout "$WORK/key.pem" -out "$WORK/cert.pem" \
  -subj "/CN=$IDENTITY" \
  -addext "basicConstraints=critical,CA:false" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=critical,codeSigning" >/dev/null 2>&1 \
  || { echo "[身份] 失败：openssl 生成证书失败" >&2; exit 1; }

# 2) p12 必须用 -legacy。OpenSSL 3.x 默认 AES 加密，macOS Security 框架读不了，
#    实测报 "MAC verification failed during PKCS12 import (wrong password?)"——
#    错误信息指向密码，实际成因是算法，这一步最容易误判。
P12PW="lute-$(openssl rand -hex 8)"
openssl pkcs12 -export -legacy -out "$WORK/id.p12" \
  -inkey "$WORK/key.pem" -in "$WORK/cert.pem" -passout "pass:$P12PW" >/dev/null 2>&1 \
  || { echo "[身份] 失败：openssl 导出 p12 失败" >&2; exit 1; }

# 3) 导入钥匙串。-T 只把私钥访问权授给 codesign；**不加 -A**（那等于放开给任何程序）。
security import "$WORK/id.p12" -k "$KEYCHAIN" -P "$P12PW" -T /usr/bin/codesign >/dev/null 2>&1 \
  || { echo "[身份] 失败：security import 未成功" >&2; exit 1; }

# 4) 建立信任。这一步跑不掉：不设信任时 find-identity -v 为空、codesign 报 no identity found。
#    用户信任域通常不要密码；仍加 30s alarm 守卫，避免万一弹框把无人值守的构建挂死。
if ! perl -e 'alarm shift; exec @ARGV' 30 \
     security add-trusted-cert -r trustRoot -k "$KEYCHAIN" "$WORK/cert.pem" 2>/dev/null; then
  echo "[身份] 警告：建立信任的调用返回非零（可能弹了授权框并被 30s 超时中断）。" >&2
fi

if security find-identity -v -p codesigning "$KEYCHAIN" 2>/dev/null | grep -qF "\"$IDENTITY\""; then
  echo "[身份] 建立成功，请把下面三项登记进 SOP（ADR-0063 决策第 5 条）："
  security find-identity -v -p codesigning "$KEYCHAIN" | grep -F "\"$IDENTITY\"" | sed 's/^ *//; s/^/       /'
  openssl x509 -in "$WORK/cert.pem" -noout -fingerprint -sha256 | sed 's/^/       /'
  openssl x509 -in "$WORK/cert.pem" -noout -enddate | sed 's/^/       有效期至 /'
  exit 0
fi

echo "[身份] 失败：信任未生效，codesign 仍无法使用该身份。" >&2
echo "       改走 GUI：钥匙串访问 → 证书助理 → 创建证书…（身份类型：自签名根证书；" >&2
echo "       证书类型：代码签名），建好后双击该证书 → 信任 → 使用此证书时选「始终信任」。" >&2
exit 1
