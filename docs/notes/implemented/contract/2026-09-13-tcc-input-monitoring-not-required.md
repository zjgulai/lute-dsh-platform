# 「输入监控」不是必需项：一次判定实验，与三条被它推翻/确立的读数

- 生命周期：implemented
- 类别：contract
- 日期：2026-09-13
- 关联：[ADR-0069](../../../adr/ADR-0069.md)（本记录对应的决策）、[ADR-0068](../../../adr/ADR-0068.md)、
  [ADR-0063](../../../adr/ADR-0063.md)、[2026-09-13-tcc-dead-grant-detection.md](2026-09-13-tcc-dead-grant-detection.md)、
  [2026-09-13-tcc-persistence-machine-check.md](2026-09-13-tcc-persistence-machine-check.md)

## Problem

`macos-harness doctor` 的第三项 `post_events`（键盘/鼠标事件投递，`mac.key` / `mac.click` 依赖它）
究竟由哪个系统面板授权，一直是「未定」：早先的 Note 明确写着「未定之前指引保持三项」，
而这句自我约束被同一次改动里的门禁规则（「凡提到授权与面板名的行必须含『输入监控』」）
翻译成了强制校验，于是六个出货面 + 它的单测一起把一条**未经验证**的事实钉死了。

要判定的命题只有一句：**「输入监控」是必需项吗？**

## Decision

用一次**真实授权**做判定，而不是继续用探针推断（探针早已证明 `CGPreflightPostEventAccess()`
不往库里写行，因此映射关系无法由探针得出）。

**实验设计**：让用户只授予「辅助功能」+「屏幕录制」，**故意不碰**「输入监控」，然后同时读两处：

1. 运行时读数 `macos-harness doctor`；
2. 系统库 `/Library/Application Support/com.apple.TCC/TCC.db` 里 `kTCCServiceListenEvent` 的行。

**判据**：若库里**没有**该行而 `post_events` 仍为 `true`，则「输入监控」非必需（该读数不可能归因于
一个连授权记录都不存在的服务）。反向若 `true` 只在有该行时出现，则必需。

**结果（2026-09-13 15:41–15:44，同一分钟采样）**：

| 读数 | 值 |
| --- | --- |
| `doctor.permissions.accessibility` | `true` |
| `doctor.permissions.screen_recording` | `true` |
| `doctor.permissions.post_events` | **`true`** |
| `doctor.input_monitoring_required` | `false` |
| 系统库 `kTCCServiceListenEvent` | **无记录** |
| harness 源码引用 `kTCCServiceListenEvent` | 0 处（`post_events` 读 `CGPreflightPostEventAccess()`） |

**结论**：`post_events` 由「辅助功能」承载；「输入监控」**非必需**。
出货指引改为两项，并明确写出「不要去授『输入监控』」——老的文档已经让一部分用户授过了。

## Alternatives considered

- **继续「宁可多授一项」。** 在没有成本时稳健，在有成本时是欠债：这一项的成本是「读取全部按键」，
  而且它让用户以为不授就不工作。
- **用探针（`CGRequestPostEventAccess` / `CGPreflightListenEventAccess`）推断映射。**
  已证伪：这类调用**不往库里写行**，只能证明「调过」，证明不了「归哪个面板」。
- **靠第三方资料（社区说法「post events 要辅助功能」）。** 与本次实测结论一致，但作为出货指引的依据
  不足够——指引会写进用户手册，必须有本机读数。
- **改文档而不改门禁。** 旧门禁会立刻把改对的文档判红，故两者必须同一次改。

## Consequences

### 被推翻的

- 「第三项在『输入监控』下」——`docs/notes/implemented/contract/2026-09-13-tcc-persistence-machine-check.md`
  与 `docs/sop/dmg-release.md` 的表格、`INSTALL-GUIDE` 第 6 节、`packaging/README.md`、
  `INSTALL-CARD.md`、两个 `README.md`、`assemble.sh` 生成的出货 README、`install.sh`/`pkg-postinstall.sh`
  的提示语，全部改为两项。门禁规则与单测同批改（旧单测正在逐字断言那条错的事实）。

### 被确立的（同一次实验的副产物）

- **自签身份的授权要求会被 tccd 原样保存**。用户在界面上重授后，库里存下的两条要求逐字为
  `identifier "ai.deepseek.dsh.desktop" and certificate leaf = H"ba3372a3…"`——**身份型、无 cdhash**。
  这是 ADR-0063「绑证书不绑字节」缺的那条先例，判据④ 因此通过、判据⑤ 具备前提。
- **判据的三种缺失形态必须分开**：无记录（从未授权）/ 有行但要求解不出（判不了）/ 有行且要求失配（死授权）。
  混在一起会产出错误处置建议（本次实测：把「从来没有授权」报成「需重授一次」）。

### 实现中踩到并修掉的两个坑（本地事实，值得留在案卷里）

1. **工具的错误文本被当成了数据**：`verify-tcc-runtime.sh` 自带的读库实现里，
   `csreq -r "$blob" -t 2>&1` 在文件不存在时把 `No such file or directory` 打到 **stdout**，
   那份实现把它当成「库里存的要求」打印，并据此给出「授权绑定在旧字节上，需重授一次」。
   修法不是补一个 if，而是删掉这份重复实现，改为调唯一实现（ADR-0009）。
2. **`IFS=$'\t'` 会折叠空字段**：制表符属于 IFS 空白，连续分隔符算一个，于是「要求为空」的那一行
   后面的列集体左移——判定列读到了形态列的值，一个「判不了」的行被算成「1 项授权有效」。
   修法：TSV 任何一列都不许是空串，缺值用 `<解不出>` 这类占位符；并加一条断言钉住「没有空字段」。
3. **本机 awk 的中文串比较是坏的**：`awk 'BEGIN{print ("非必需"=="必需")?"EQ":"NE"}'` 输出 **EQ**
   （`LC_ALL=C` 下才输出 NE）。用中文当过滤键的判据会把非必需项当成必需项。
   修法：机读列一律 ASCII（`required`/`optional`），中文只出现在给人看的散文里。

### 后续

- 出货文本改对后需**重制产物**（当前归档的 2.3.2 载荷里仍是三项说法），否则用户手册与实际不一致
  —— **已完成**：2.3.3（`packaging/release/2.3.3/`）的载荷是两项说法，本机已装着它。
- 判据⑤（升级不重置授权）**已结（2026-09-13 16:14）**：装 2.3.3 并重启后跑
  `verify-tcc-runtime.sh --diff`，与基线 `20260913-155315.json` 逐项相同（三项 true → true），
  而 CDHash 确实换了（`ac1cf7e38fef` → `ad4eaff2d742`）——非空测试，结论成立。
