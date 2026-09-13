# 签名身份：为什么「TCC 重新授权一次」在 2.0.0 到 2.2.0 之间变成了每版一次

- 日期：2026-09-13
- 状态：decided（ADR-0063 已 accepted；**签名改造本身未实施**，判据见 Consequences）
- 决策记录：ADR-0063
- 相关：[2026-09-12-release-atomic-publish.md](2026-09-12-release-atomic-publish.md)（ADR-0057；「靠人记得不是工程解」的原始出处）、[2026-09-12-shipping-surface.md](2026-09-12-shipping-surface.md)（ADR-0056；出货面机读判据的同一条方法论）、[2026-09-13-release-manifest.md](2026-09-13-release-manifest.md)（ADR-0058；同一轮里另一件「产物流出去之后仓库认领不回来」的事）

## Problem

### 起点是一个与签名无关的问题

用户问：能否把当前二开的项目重新打包成 DMG，替换掉本机正在运行的 `DSH Desktop.app`。查证过程中先撞到的却是另一件事——**本机的 `macos-harness` 已经坏了两天多，而它看起来一切正常**。

### 现象：技能活着，能力死了

`macos-harness`（uv tool 0.1.2，2026-08-30 装入）在会话技能目录里可见、`skill` 工具能正常解析到 `~/.dsh/skills/macos-harness`，全量会话里有 456 次真实调用记录。但两条互相独立的探针都指向同一结论：

| 探针 | 读数 |
| --- | --- |
| `macos-harness doctor` | `accessibility: false` · `screen_recording: false` · `post_events: false` |
| `screencapture -x /tmp/x.png`（与 harness 无关的独立路径） | `could not create image from display`，exit 1，无文件产出 |

失败本身是**可检测**的（stderr 文案明确、退出码 1），但没有任何东西会主动告诉你——只有当你真的去调 `mac.see` / `mac.click` / `mac.ax` 时才会撞上。

### 读数序列把时间钉死了

把全量会话里 `doctor` 的历史输出解出来按时间排序（`tool/call` 与 `tool/result` 按 `callId` 配对），得到一条没有歧义的曲线：

| 时段 | `accessibility` / `screen_recording` |
| --- | --- |
| 08-30 11:07 → 18:48 | true / true |
| 08-30 20:05 → 21:20 | **false / false** |
| 08-30 21:23 → 09-10 18:54 | true / true |
| 09-11 00:34 → 09-13 11:44 | **false / false（此后再未恢复）** |

同时，按同一方法统计的**成功截图帧**计数为：08-30 共 4 次、08-31 共 1 次、09-10 共 5 次、**09-11 起为 0**。两件事对上了：`09-11 00:34` 之后，这个 harness 再没有成功截过一次图。

### 根因：adhoc 签名的指定要求就是 CDHash

第一轮排查得到的两个假设**都被实测推翻**，这一步值得写下来：

- 假设「macOS 26 废弃了 `CGWindowListCreateImage`」——实测该 API 在本机正常返回 3160×1920；而且 harness 的窗口捕获根本走 `/usr/sbin/screencapture`（`macos.py:999`），不用这个 API。
- 假设「`mac.see("访达")` 失败是权限问题」——实测那时权限**已经修好了**，失败原因是访达当时**没有窗口**（layer 0 窗口里只有 LUTE / 系统设置 / 飞书 / 终端 / 微信）。

真正的证据是一条只读命令的输出对比：

| app | 签名 | `codesign -d -r-` 的指定要求 |
| --- | --- | --- |
| `/Applications/DSH Desktop.app` | adhoc | `cdhash H"595283898d…"` **or** `cdhash H"3d09f5a3…"` |
| `~/Applications/DSH Desktop RC.app` | Developer ID | `identifier "ai.deepseek.dsh.desktop" and anchor apple generic and … certificate leaf[subject.OU] = "UM3Z9G5DNH"` |

adhoc 的指定要求**字面上就是二进制哈希**。TCC 为一次授权保存的代码要求（`csreq`）取自这条指定要求，因此「换一版 app 二进制」在系统看来等于「换了一个 app」，此前全部授权立即失配。这与两次事故逐字吻合：

- **08-30 19:10** 装了 2.0.4 → 20:05 权限全丢 → 21:23 `tccutil reset` + 手工重授权后恢复。
- **09-10 23:57** `Contents/MacOS/DSH Desktop` 被 2.0.5-lute 替换，CDHash `91d9cc0c` → `595283898d` → 09-11 00:34 权限再丢，且再未恢复。

### 需要写准的一处更正：D2 的「一次」是「每版一次」

`packaging/PLAN.md` §1 的 D2 原文是「adhoc 签名；目标机右键打开 / `xattr -cr` 绕过 Gatekeeper；**TCC 重新授权一次**」。按上面两条事故，这句话描述的是**单次安装**视角；在**持续发版**视角下它是「每发一版一次」。这个差别是本 Note 存在的理由：D2 的理由（改写内容后原签名必然失效，必须重签）完全成立，被低估的只有代价，而代价恰好在外部不可见。

### 顺带查实的第二条：本机没有身份可切

`security find-identity -v -p codesigning` → `0 valid identities found`（无 Developer ID、无 Apple Development）。所以「改用证书签名」不是切换一个已有身份，而是**先建一个**。

### 与「换 app」这件事的关系

用户真正想做的事是替换 app。本次取证说明**替换动作本身就是致害动作**——在 D2 未修订前换 app，等于把刚修好的权限再打掉一次。同时另有两项与替换相关的读数，也一并记录，它们是「先改 D2 再换 app」这个排序的依据：

- **install.sh 会把 live profile 从开发态翻转成出货态。** 本机 live profile 有 23 个 `file:/Users/lute/project/Magpie-Horch/packages/...` 依赖；`staging/2.2.0/payload/profile.tar.gz` 里是 22 个 `file:./vendor/...`。`install.sh` 第 2/6 步整体替换 `package.json` / `node_modules` / `vendor` / `cordis.patch.yml`（`data/` 不动），装完「改源码 → 同步 → 重启」的开发闭环即断开。
- **恰好丢 1 个条目。** 用 install.sh 自己的判据（旧 profile 声明过、新包未声明）做差集，结果是 `dsh-kol-hunter-local` 一项——与 ADR-0033 / ADR-0061「外部产品不出货」一致，属预期，但本机需按本地装配补回。

## Decision

已在 ADR-0063 固化，要点：出货 app 由 adhoc 改为固定身份的证书签名；本 ADR 只管身份稳定、不管 Gatekeeper 体验；换签是一次性迁移；签名身份成为「签不出来即失败」的受门禁保护构建输入；私钥不进仓库；以 2.3.0 为首个稳定签名版本并附四条机读判据。

本节补上 ADR 里指向的操作步骤。**注意：以下步骤本次未执行**（本机尚无签名身份，D2 改造未动工），状态是「待实施」，不是「已验证」。

### 建自签代码签名证书（钥匙串访问，主路径）

1. 打开「钥匙串访问」→ 菜单「钥匙串访问 → 证书助理 → 创建证书…」。
2. 名称填 `LUTE Code Signing`；**身份类型：自签名根证书**；**证书类型：代码签名**。
3. 展开「让我覆盖默认值」→ 有效期填 `3650` 天（默认 365 太短，会在某一版突然以「签不出来」的形式暴露）。
4. 创建后，在钥匙串里双击该证书 → 展开「信任」→「使用此证书时」选 **始终信任** → 关闭并输入密码确认。
5. 验证身份已可用：

   ```bash
   security find-identity -v -p codesigning
   # 期望：列出 1) <hash> "LUTE Code Signing"
   ```

### 改签名行并加断言

```bash
# packaging/assemble.sh:315 —— 由
codesign --force --deep --sign - "$APP_STAGE/DSH Desktop.app"
# 改为（并把证书名提为可覆盖变量，缺失即非零退出）
codesign --force --deep --sign "${LUTE_SIGN_IDENTITY:?签名身份未设置：见 ADR-0063}" "$APP_STAGE/DSH Desktop.app"
```

`${VAR:?}` 的作用正是 ADR-0063 决策第 4 条要的那个方向：**缺失即失败，而不是静默回退 adhoc**。

### 验收（ADR-0063 决策第 6 条的机读判据）

```bash
APP="packaging/staging/<VERSION>/payload/DSH Desktop.app"
codesign -d -r- "$APP"            # ① 输出中不得出现 cdhash
codesign -dv --verbose=2 "$APP"   # ② Authority= LUTE Code Signing（而非 adhoc）
# ③ 跨一次重建：改一处无关文案重打，比对上面第一条输出应逐字节不变
macos-harness doctor              # ④ 装机后三项仍为 true
```

### 一条 CLI 备选路径（未实测，仅记备选）

若要求无 GUI 可复现，也可用 `openssl` 生成自签证书再 `security import` 进钥匙串；但**必须额外建立信任**（`security add-trusted-cert`，用户域可能需要输密码），否则 `security find-identity -v` 不列出它、`codesign` 可能产出无效签名。因未实测，此处只记思路，不作为推荐路径。

## Alternatives considered

详见 ADR-0063 的「备选方案」节（保持 adhoc 改走 SOP 人工步骤 / 追求可复现构建使 CDHash 恒定 / 直接上 Developer ID / 去掉 TCC 依赖能力 / 用 entitlement 规避）。此处只补两条本次排查中被实际排除的错误方向，它们对后续维护者有价值：

- **「macOS 26 废弃了窗口捕获 API」**：实测 `CGWindowListCreateImage` 正常，且 harness 不走它——这是一条**看起来很像**的假设，若不复核就会写进一份错误的结论里。
- **「访达歧义/无窗口 = 权限没修好」**：`mac.see("访达")` 与 `mac.see("微信")` 的两种报错（窗口不存在 / 同名多实例歧义）都是**设计内行为**，容易与权限失败混为一谈。三者的区分方式：权限失败走独立探针（`screencapture` 全屏）即可一刀切开。

## Consequences

- **正面**：ADR-0063 落地后，TCC 授权与字节解耦，发版不再静默打断能力；客户升级不再被要求反复重授权；「装完先重授权」由人工记性升格为结构保证。
- **负面**：首次换签仍需重授权一次；私钥成为构建机资产（丢失即换身份）；自签证书到期日必须登记，否则到期后以「签不出来」的形式暴露——但这正是决策第 4 条要的失败方向（显式失败优于静默失效）。
- **实施状态（如实）**：**未实施**。`packaging/assemble.sh:315` 仍是 `--sign -`；本机 `security find-identity` 仍为 0；2.3.0 未构建；`packaging/PLAN.md` §1 的 D2 行**尚未回改**（按 ADR-0009，回改时须加指向 ADR-0063 的交叉链接，避免同一事实两个说法）。
- **后续动作**：按 ADR-0063「后果 · 后续动作」①~⑤ 执行；其中 ⑤（2.3.0 首次以稳定身份出包并按四条判据验收）是本决策从 accepted 变成 completed 的唯一凭据。
