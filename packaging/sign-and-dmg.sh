#!/bin/bash
# sign-and-dmg.sh —— Phase 3：payload → 可安装 dmg（hdiutil，含挂载后终验）
# 用法: ./sign-and-dmg.sh <payload-dir> <version> [--force]
# 产物: packaging/release/<version>/DSH-Desktop-LUTE-<version>-mac-arm64.dmg + SHA256SUMS + VERSION + manifest.json
#       （+ 仓库根 release/<version>.sha256 入库清单，见文末 §7 与 ADR-0058）
#
# ── 发布语义（ADR-0057）──────────────────────────────────────────────────────
# release/<version>/ 只允许两种状态：**不存在**，或**一份完整且已通过终验的产物集合**。
# 没有「构建到一半」的中间态，也没有「先清空再重制」的窗口：
#   1. 构建与全部终验都在 release/.staging.XXXXXX 内完成，期间 $REL 一个字节都不动；
#   2. 全部通过后才 mv 原子改名就位——目录要么缺席，要么完整；
#   3. 旧产物仅在 --force 下改名归档到 release/.archive/，**永不删除**。
# 于是：构建失败、验签失败、磁盘写满、中途 Ctrl-C，都不会损坏已发布的产物。
#
# 为什么改（此前第 35 行是 `rm -rf "$REL"; mkdir -p "$REL"`）：
# 那一行每次重跑都先毁掉上一份产物，而且毁在「新的一份还没做出来之前」——一旦后续
# 任一步失败，得到的是「旧的没了、新的也没有」。注意：2026-09-12 那次「DMG 从版本
# 目录消失」经查**不是**本脚本所为（manifest/SHA256SUMS/VERSION 保留了原始 mtime，
# 可证 rm -rf 未执行）；但它把这条风险摆到了明面上——只要有人重跑一次，上一份已交付
# 的产物就会无声消失且无法找回。
# ── 入库清单（ADR-0058）──────────────────────────────────────────────────────
# 仓库里有两个 release/，别混：packaging/release/ 是**产物的家**（几百 MB 二进制，被
# packaging/.gitignore 忽略，不进 git）；仓库根 release/ 是**清单的家**（几百字节，
# 必须进 git）。产物走出仓库之后（飞书直传、GitHub Releases 附件），仓库侧唯一还能
# 认领它的东西就是这份清单——它能回答「客户手上那串字节是不是我们发的」。
# 但它**证明不了**「这份字节从哪个提交来」：那个答案在 source_commit 字段里，由
# assemble.sh 在**装配**时刻记下（源是那一刻被读走的；制 dmg 时再取 HEAD 会记错）。
set -euo pipefail
PKG_ROOT="$(cd "$(dirname "$0")" && pwd)"   # 本脚本位于 packaging/ 根
REPO_ROOT="$(cd "$PKG_ROOT/.." && pwd)"     # 仓库根：入库清单落在 $REPO_ROOT/release/

# ── 参数 ────────────────────────────────────────────────────────────────────
FORCE=0
ARG_PAYLOAD=""
ARG_VERSION=""
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    -h|--help)
      cat >&2 <<'EOF'
用法: sign-and-dmg.sh <payload-dir> <version> [--force]

  --force  重制已存在内容的 release/<version>
           （旧产物归档到 release/.archive/，不删除）
EOF
      exit 0 ;;
    -*) echo "[dmg] 未知选项: ${a}（用 -h 看用法）" >&2; exit 2 ;;
    *)
      if [ -z "$ARG_PAYLOAD" ]; then ARG_PAYLOAD="$a"
      elif [ -z "$ARG_VERSION" ]; then ARG_VERSION="$a"
      else echo "[dmg] 多余参数: $a" >&2; exit 2
      fi ;;
  esac
done
[ -n "$ARG_PAYLOAD" ] || { echo "用法: sign-and-dmg.sh <payload-dir> <version> [--force]" >&2; exit 2; }
PAYLOAD="$(cd "$ARG_PAYLOAD" && pwd)"
VERSION="${ARG_VERSION:-1.0.0}"
REL="$PKG_ROOT/release/$VERSION"
DMG_NAME="DSH-Desktop-LUTE-$VERSION-mac-arm64.dmg"
DMG="$REL/$DMG_NAME"
MANIFEST="$REPO_ROOT/release/$VERSION.sha256"   # 入库清单（ADR-0058）
VOLNAME="DSH Desktop LUTE $VERSION"
MOUNT="/Volumes/$VOLNAME"
say(){ echo "[dmg] $*"; }

# ── 资源清理（单一出口；所有临时物都登记在这里）──────────────────────────────
# 只清理**本进程创建**的东西。$REL 不在管理范围内——它只在最后那一次 mv 里被写入。
LOCK="$PKG_ROOT/release/.build.lock"
LOCK_HELD=0
STAGING=""
VERIFY_TMP=""
MANIFEST_TMP=""
MOUNTED=0
cleanup(){
  set +e
  [ "$MOUNTED" = 1 ] && hdiutil detach "$MOUNT" >/dev/null 2>&1
  [ -n "$VERIFY_TMP" ] && rm -rf "$VERIFY_TMP"
  [ -n "$MANIFEST_TMP" ] && rm -f "$MANIFEST_TMP"
  [ -n "$STAGING" ] && rm -rf "$STAGING"
  [ "$LOCK_HELD" = 1 ] && rm -rf "$LOCK"
  return 0
}
trap cleanup EXIT

# ── 竞态锁：dmg/pkg 共用 release 目录，串行执行防互踩 ─────────────────────────
# 锁放在版本目录**之外**（release/ 根）。理由随本版语义变化：版本目录现在是「整份
# 原子改名就位」的单元，锁若放在里面，会随发布/归档一起被搬走，互斥窗口退化。
# 旧版把锁放在 $REL 内、靠 mkdir 那几毫秒互斥——2026-09-12 实测等于没有锁。
# 锁内记 pid：持有者已消失时自动回收，避免一次 SIGKILL 永久挡住后续构建
# （2026-09-12 的构建就留下过一个无主锁，它会让下一次构建直接以「另一构建进行中」退出）。
mkdir -p "$PKG_ROOT/release"
if [ -d "$LOCK" ]; then
  LOCK_PID="$(cat "$LOCK/pid" 2>/dev/null || true)"
  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "[dmg] 另一构建进行中（pid ${LOCK_PID}，锁 ${LOCK}），请串行执行" >&2
    exit 1
  fi
  if [ -n "$LOCK_PID" ]; then
    say "回收无主锁：原持有者 pid $LOCK_PID 已不存在"
  else
    say "回收无主锁：锁内无 pid 记录（旧版脚本遗留）"
  fi
  rm -rf "$LOCK"
fi
mkdir "$LOCK"
echo $$ > "$LOCK/pid"
LOCK_HELD=1

[ -f "$PAYLOAD/install.sh" ] || { echo "[dmg] payload 不完整: $PAYLOAD"; exit 1; }
[ -d "$PAYLOAD/LUTE Setup.app" ] || { echo "[dmg] 缺少 LUTE Setup.app"; exit 1; }

# ── 发布守卫：已发布过的版本号默认拒绝覆盖 ──────────────────────────────────
# 先于一切重活执行（秒级失败，不浪费一次数分钟的构建）。
# 为什么默认拒绝：本项目的契约是「版本号 = git tag = 打包版本」。同号不同字节一旦
# 流出去，「客户手上那版对应哪份源码」就无法回答。要重制必须显式 --force 表态。
if [ -d "$REL" ] && [ -n "$(ls -A "$REL" 2>/dev/null)" ]; then
  if [ "$FORCE" -ne 1 ]; then
    echo "[dmg] 拒绝覆盖：release/$VERSION/ 已存在已发布产物" >&2
    ls -la "$REL" | sed 's/^/        /' >&2
    if [ -f "$DMG" ]; then
      echo "        现有产物 SHA256：$(shasum -a 256 "$DMG" | awk '{print $1}')" >&2
    fi
    cat >&2 <<EOF

        为什么拒绝：版本号 = git tag = 打包版本，同号不同字节会让「客户手上那版
        对应哪份源码」无法回答。两个选择：

          a) 换版本号重跑（推荐）
          b) 确实要重制同一版本：加 --force
             旧产物会归档到 release/.archive/，不会被删除

EOF
    exit 1
  fi
  say "--force：release/$VERSION/ 将被重制，旧产物归档（不删除）"
fi

# ── 0. payload 无 quarantine 断言（防打包侧混入隔离属性——客户 Operation not permitted
#    的历史坑；若检测到则就地清除并提示）
QA_HITS="$(find "$PAYLOAD" -maxdepth 1 \( -name '*.tar.gz' -o -name 'install.sh' \) -exec sh -c 'xattr -p com.apple.quarantine "$1" 2>/dev/null && echo "$1"' _ {} \; 2>/dev/null)"
if [ -n "$QA_HITS" ]; then
  say "⚠ payload 检测到 quarantine（打包侧混入），就地清除：$QA_HITS"
  find "$PAYLOAD" -maxdepth 1 \( -name '*.tar.gz' -o -name 'install.sh' \) -exec xattr -d com.apple.quarantine {} \; 2>/dev/null || true
else
  say "payload 无 quarantine ✓"
fi

# ── 1. 临时构建区（只有全部通过后才会改名就位）───────────────────────────────
STAGING="$(mktemp -d "$PKG_ROOT/release/.staging.XXXXXX")"
STAGE_DMG="$STAGING/$DMG_NAME"
say "临时构建区: $STAGING"
say "终验全部通过前，$REL 不会被触碰"

# ── 2. 制 dmg（UDZO 压缩，卷名即产品名）──────────────────────────────────────
say "制作 dmg（约 665M 源 → UDZO，数分钟）…"
hdiutil create -volname "$VOLNAME" -srcfolder "$PAYLOAD" -ov -format UDZO "$STAGE_DMG"
say "dmg 完成: $STAGE_DMG ($(du -sh "$STAGE_DMG" | cut -f1))"

# ── 3. 挂载终验：Setup.app 签名 + 载荷内 app 签名 + 关键文件可见 ─────────────
hdiutil attach -readonly -nobrowse "$STAGE_DMG" >/dev/null
MOUNTED=1
say "挂载终验 @ $MOUNT"
codesign --verify --deep --strict "$MOUNT/LUTE Setup.app" && say "Setup.app 签名 OK"
[ -f "$MOUNT/install.sh" ] && say "install.sh 可见"
[ -f "$MOUNT/DSH Desktop.app.tar.gz" ] && [ -f "$MOUNT/profile.tar.gz" ] && say "载荷可见"

# 载荷内 app 的签名终验（此前只验了 Setup.app，而用户实际运行的是载荷里的 DSH Desktop.app）。
# 解到临时目录再验，验完即删——dmg 是只读卷，不能在卷内展开。
say "载荷内 DSH Desktop.app 签名终验（解包后校验，约 30s）…"
VERIFY_TMP="$(mktemp -d)"
tar -xzf "$MOUNT/DSH Desktop.app.tar.gz" -C "$VERIFY_TMP"
bash "$PKG_ROOT/scripts/verify-app-signature.sh" "$VERIFY_TMP/DSH Desktop.app" "dmg 载荷终验" || {
  echo "[$(basename "$0")] 载荷内 app 签名无效——dmg 不可发布（${STAGE_DMG}）" >&2
  exit 1
}
say "载荷内 app 签名 OK"
rm -rf "$VERIFY_TMP"; VERIFY_TMP=""
ls "$MOUNT"

# 终验已全部通过，卸卷（改名就位前先脱离，避免移动一个仍被挂载的镜像文件）
hdiutil detach "$MOUNT" >/dev/null 2>&1 || true
MOUNTED=0

# ── 4. 在临时区组装发布集合（改名前先摊平，保证「要么缺席、要么完整」）───────
cp "$PAYLOAD/VERSION" "$PAYLOAD/manifest.json" "$STAGING/" 2>/dev/null || true
( cd "$STAGING" && shasum -a 256 "$DMG_NAME" > SHA256SUMS )
# mktemp -d 给的是 0700；就位后它要顶替原先 `mkdir -p` 建的 0755 目录，权限不该
# 在重构里悄悄变（同级的 2.0.1 / 2.2.0 都是 0755——可预测性优先于「顺手的更严」）。
chmod 755 "$STAGING"
say "发布集合已就绪（未就位）："
ls -la "$STAGING" | sed 's/^/        /'

# ── 5. 归档旧产物（改名，不删除）────────────────────────────────────────────
if [ -e "$REL" ]; then
  # 已发布产物是 uchg 锁定的（见 §8）：不先解锁就 mv 不动。这里是**唯一**的解锁点——
  # 锁的意义就是让别处的删除/搬移在这里失败，而不是在别处悄悄成功。
  chflags -R nouchg "$REL" 2>/dev/null || true
  mkdir -p "$PKG_ROOT/release/.archive"
  ARCHIVE="$PKG_ROOT/release/.archive/$VERSION-$(date +%Y%m%d-%H%M%S)"
  [ -e "$ARCHIVE" ] && ARCHIVE="$ARCHIVE-$$"
  mv "$REL" "$ARCHIVE"
  say "旧产物已归档（未删除）: $ARCHIVE"
fi

# ── 6. 原子就位 ─────────────────────────────────────────────────────────────
mv "$STAGING" "$REL"
STAGING=""   # 已属于 $REL，不再由 cleanup 管理
say "发布完成: $REL"
ls -la "$REL"
say "SHA256SUMS 复核："
( cd "$REL" && shasum -a 256 -c SHA256SUMS )

# ── 7. 入库清单（ADR-0058）：把「哪个提交 → 哪份字节」写成能跑的文件 ──────────
# 位置在就位**之后**。失败方向必须是「产物完好、清单缺失」，绝不能是「清单描述了一份
# 并不存在的产物」——为此宁可放弃两者一起原子就位（它们分属两个父目录，本来也没法用
# 一次改名同时落位）。
# 为什么是脚本而不是 SOP 里的一句话：SOP 自 2026-09-06 起就写着「计算 shasum → 写入
# release/<version>.sha256 清单（入库）」，十天里一次也没执行过——因为「算哈希 → 写
# 文件 → 提交」每一步都得靠人记得。现在哈希由脚本算，人只剩「提交」一个动作。
field(){ grep -m1 "^$1=" "$REL/VERSION" 2>/dev/null | cut -d= -f2- || true; }
M_BUILD="$(field BUILD)"
M_SRC="$(field SOURCE_COMMIT)"
M_DIRTY="$(field SOURCE_DIRTY)"
M_SNAP="$(field PROFILE_SNAPSHOT)"
[ -n "$M_BUILD" ] || M_BUILD="unknown"
[ -n "$M_SRC" ]   || M_SRC="unknown"
[ -n "$M_DIRTY" ] || M_DIRTY="unknown"
[ -n "$M_SNAP" ]  || M_SNAP="unknown"
DMG_SHA="$(shasum -a 256 "$DMG" | awk '{print $1}')"

mkdir -p "$REPO_ROOT/release"
MANIFEST_TMP="$MANIFEST.tmp.$$"
{
  printf '# LUTE 发布清单（ADR-0058）—— 由 packaging/sign-and-dmg.sh 生成，勿手改\n'
  printf '# 校验（DMG 与本文件同目录时）：shasum -a 256 -c %s\n' "$(basename "$MANIFEST")"
  printf '# version=%s\n'          "$VERSION"
  printf '# dmg=%s\n'              "$DMG_NAME"
  printf '# build=%s\n'            "$M_BUILD"
  printf '# source_commit=%s\n'    "$M_SRC"
  printf '# source_dirty=%s\n'     "$M_DIRTY"
  printf '# profile_snapshot=%s\n' "$M_SNAP"
  printf '%s  %s\n' "$DMG_SHA" "$DMG_NAME"
} > "$MANIFEST_TMP"
mv "$MANIFEST_TMP" "$MANIFEST"
MANIFEST_TMP=""
say "入库清单已就位: $MANIFEST"
sed 's/^/        /' "$MANIFEST"
if [ "$M_DIRTY" = "1" ]; then
  echo "[dmg] ⚠ source_dirty=1：本次载荷含未提交源码，source_commit 不足以重建它" >&2
fi

# ── 8. 不可变归档 + 锁定（「发布的版本不允许被删除」）───────────────────────────
# 背景：发布过的 dmg 已经**两次**从 release/<版本>/ 里消失（2026-09-12、2026-09-13 的 2.3.1），
# 每次都只剩 manifest/SHA256SUMS/VERSION——即「清单还在、清单描述的字节没了」。两次都没查出
# 是谁删的（本脚本经 mtime 取证已排除；本机无 APFS 本地快照，也无法回滚找回）。既然查不出人，
# 就让它**删不掉**，而不是继续加一句「请注意不要删」：
#
#   ① 仓库外归档：$HOME/Library/Application Support/LUTE/releases/<版本>/
#      —— 与构建树分离，`git clean -xdf`、`rm -rf packaging/release`、重装仓库都碰不到它；
#   ② uchg 锁定（用户不可变标志）：两处副本一起锁。删除/改名/覆盖一律 EPERM 失败，
#      要动它必须显式 `chflags nouchg`——把「误删」变成「必须表过态才可能发生」；
#   ③ 归档后**回读校验**：归档那份的 sha256 必须与已发布那份逐字节相同，否则本次发布算失败。
#
# 判据侧由 `scripts/gate.mjs` 的 `release-artifacts-intact` 守着：清单在而产物缺，就是红灯。
# 找回用 `packaging/scripts/release-restore.sh <版本>`（从归档恢复并核对清单哈希）。
ARCHIVE_ROOT="${LUTE_RELEASES_ARCHIVE:-$HOME/Library/Application Support/LUTE/releases}"
ARCHIVE_VER="$ARCHIVE_ROOT/$VERSION"
mkdir -p "$ARCHIVE_ROOT"
if [ -e "$ARCHIVE_VER" ]; then
  chflags -R nouchg "$ARCHIVE_VER" 2>/dev/null || true
  OLD_ARCHIVE="$ARCHIVE_VER.superseded-$(date +%Y%m%d-%H%M%S)"
  mv "$ARCHIVE_VER" "$OLD_ARCHIVE"
  say "归档中旧的同版本副本已改名保留（未删除）: $OLD_ARCHIVE"
fi
mkdir -p "$ARCHIVE_VER"
cp "$REL/$DMG_NAME" "$REL/SHA256SUMS" "$REL/VERSION" "$REL/manifest.json" "$ARCHIVE_VER/"
ARCH_SHA="$(shasum -a 256 "$ARCHIVE_VER/$DMG_NAME" | awk '{print $1}')"
if [ "$ARCH_SHA" != "$DMG_SHA" ]; then
  echo "[dmg] ✗ 归档副本与已发布产物哈希不一致——归档不可信，本次发布视为失败" >&2
  echo "      发布：$DMG_SHA" >&2
  echo "      归档：$ARCH_SHA  ($ARCHIVE_VER/$DMG_NAME)" >&2
  exit 1
fi
say "归档完成并回读校验一致: $ARCHIVE_VER"

# 锁定（两处一起）。锁不上就是机制失效，必须响亮——不能出现「以为锁了其实没锁」。
for target in "$REL" "$ARCHIVE_VER"; do
  chflags -R uchg "$target" || {
    echo "[dmg] ✗ 无法锁定 ${target}（uchg）——发布产物仍可被删除，本次发布视为失败" >&2
    exit 1
  }
done
say "已锁定（uchg）：${REL} 与 ${ARCHIVE_VER}（删除/改名会失败；显式解锁：chflags -R nouchg <路径>）"

cat <<EOF

        下一步（顺序不能换，ADR-0058）：
          1) git add release/$VERSION.sha256 && git commit
          2) git tag v$VERSION && git push origin v$VERSION    # tag 必须指向含清单的提交
          3) DMG 上传 GitHub Releases 附件；清单内容一并贴进 release 说明
EOF
