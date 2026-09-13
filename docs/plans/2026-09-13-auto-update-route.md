# 自动更新路线（前提：Developer ID）

- 日期：2026-09-13
- 状态：**待前提**（未开工；动手的前置条件是拿到 **Apple Developer ID Application 证书**，付费账号）
- 相关：ADR-0063（固定自签身份与 TCC 授权延续）、ADR-0058（入库清单）、ADR-0067（产物不可删除）、ADR-0065（替换运行中 app bundle 会白屏）、`docs/sop/dmg-release.md`

> 这份文档回答一个问题：**有了 Developer ID 之后，版本自动更新按什么顺序做，以及现在就动手会不会白做。**

---

## 0. 先记住一件会被忽略的代价：换 Developer ID = 再付一次 TCC 重授

ADR-0063 把签名身份从 adhoc 换成了固定自签证书 `LUTE Code Signing`，代价是**一次性**重授 TCC
（辅助功能 / 屏幕录制两项；第三项能力 `post_events` 由「辅助功能」承载，见 ADR-0069）。Developer ID 是**另一个身份**：TCC 库里存的授权要求是
`identifier "…" and certificate leaf = H"…"`，leaf 变了，三项授权就与当前 app 不再匹配——
**换 Developer ID 那一版，用户必须再重授一次**（三项关掉再打开）。

所以：

- **越早换越省事**：每多一版自签发布，就多一批要重授的用户。
- 换的那一版要在安装卡/手册里把这一步写成显式引导（现成文案在
  [INSTALL-GUIDE.md](../../packaging/INSTALL-GUIDE.md) §6），并在发布说明里提前告知。
- 换完之后的每一版**不再需要**重授——这正是自动更新能做起来的前提：更新不该让用户去动系统设置。

## 1. 换身份与公证（一次性，约半天）

1. 申请 Developer ID Application 证书（付费账号 → 钥匙串里装好私钥）。
2. 打包侧签名改为：
   ```bash
   codesign --force --deep --options runtime --timestamp \
     --sign "Developer ID Application: <团队名> (<TEAMID>)" "DSH Desktop.app"
   ```
   `--options runtime`（hardened runtime）是公证的硬性前提。
3. 公证与装订（app 与 dmg 都要）：
   ```bash
   xcrun notarytool submit <dmg> --keychain-profile <profile> --wait
   xcrun stapler staple <dmg>
   xcrun stapler staple "DSH Desktop.app"     # 打 dmg 之前对 app 做
   ```
4. 落到 `packaging/sign-and-dmg.sh` 里成为流水线的一步，并让 `spctl -a -vv` 的输出成为验收读数
   （现在这条对自签包必然是 rejected，公证后应变成 accepted）。
5. 手册里「右键 → 打开」那一整节可以删掉——那是未公证的产物才需要的绕行。

**注意**：`LUTE_SETUP` 与 app 必须是同一个 Team ID；否则更新器/Squirrel 会拒绝更新包。

## 2. 自动更新的两条路

### A. 官方 Electron 更新通道（electron-updater + `app-update.yml`）

- 现状：**已被人为关闭**。产物里 `app-update.yml` 被清空，且有补丁 P0-1
  （`Update installation is disabled for security`）把更新安装拦住。
- 前提：Developer ID 之后，Squirrel.Mac 的签名校验才有意义（要求更新包与当前 app 同一 Team ID）。
- 代价：我们发的不是「只有 app bundle」——整包里还有 profile 投影、技能/预设、灵枢运行时。
  electron-updater 只认识 app bundle，装不了这些；两者混用会出现「app 更新了、profile 还是旧的」。
- 结论：**不作为主路径**；将来若要「app 本体增量更新」可作为补充。

### B. 自建更新器（推荐）

一个 profile 内的本地插件（暂定 `dsh-update-local`），职责四步：

1. **检查**：读 feed `https://<域名>/releases/latest.json`；
2. **下载**：把 dmg 取到临时目录；
3. **校验**：`sha256` 必须等于 feed 里声明的值，且 feed 本身可信（见 §3）；
4. **安装**：挂载 dmg → 调 **同一个** `install.sh`（幂等 / 回滚 / 保留数据 / 0b 自动退出运行实例）
   → 提示重启。

**为什么是这条路**：安装语义与人工路径**完全同一条**（同一份 `install.sh`），不会出现「自动装的」和
「手动装的」两套状态；而且整包（app + profile + 技能 + 灵枢）都能更新。

## 3. feed 与信任链（**这部分现在就能做，不必等 Developer ID**）

feed 文件 `latest.json` 由 `sign-and-dmg.sh` 在发布时生成——**内容就是已有的入库清单**
（`release/<版本>.sha256` 的字段：version / dmg / sha256 / build / source_commit / profile_snapshot），
外加 `min_os`、`notes`、`channel`。它应该：

- 与 dmg 一起进仓库外归档（ADR-0067），并被 `release-verify.sh` 一并核对；
- 上传到 GitHub Releases 附件或固定域名（发布动作里已有这一步）。

信任链按阶段升级：

| 阶段 | 清单的可信来源 |
| --- | --- |
| 现在 | HTTPS + 固定域名（能防篡改传输，防不住域名/服务器被拿下） |
| Developer ID 之后 | 给 `latest.json` 加 **Ed25519 离线签名**，公钥随 app 出厂——信任从「通道」搬到「签名」，且与代码签名解耦 |

## 4. 灰度与回滚（与 ADR-0067 配套）

- **通道**：feed 分 `stable` / `canary`，更新器只认自己所在通道。
- **回滚**：安装器每次升级都留 `*.pre-lute-<时间戳>` 备份；更新器要提供「回到上一版」入口，
  并允许**降级**（把旧版 dmg 再装回去）——只允许升级的更新器，在出事那天等于没有退路。
- **产物不许删**（ADR-0067）：回滚依赖旧版 dmg 还在，这正是那条 ADR 的直接动因之一。

## 5. 顺序建议

| 阶段 | 做什么 | 依赖 |
| --- | --- | --- |
| 现在 | ① `latest.json` 生成 + 归档 + 门禁核对；② 更新器骨架（只做「检查 + 提示有新版」，不做安装） | 无——**不白做**：这两步在人工交付阶段就有价值（用户能看到有新版本） |
| 拿到 Developer ID | ③ 换签名身份 + 公证 + 手册删掉「右键打开」；④ 这一版显式引导重授三项 TCC | 证书 |
| 换身份之后 | ⑤ 更新器接上「下载 + 校验 + 调 install.sh + 重启」；⑥ 通道与回滚 | ③④ 完成 |
| 之后 | ⑦ `latest.json` 的 Ed25519 签名；⑧ 评估是否需要 app 本体增量更新（路线 A） | 运行一段时间后的实际需求 |

**第 ⑤ 步之前不要开自动安装**：身份没换、公证没做之前，自动下载下来的包仍会撞 Gatekeeper，
用户会看到「更新完打不开」——比不自动更新更坏。
