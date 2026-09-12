# 本轮取证 · 代码围栏判据（对应 ADR-0050）

入口：「那 21 张『源站卡 ≠ vault 卡』的代际差异值不值得统一」。
**结论：入口的归因错了 —— 21 张里 19 张的实现一直在 vault 的 HEAD 里**，
是选围栏的正则漏读了它们。只有 2 张是真正的源站独有。

## 文件

| 文件 | 干什么 | 怎么用 |
| --- | --- | --- |
| `recon.py` | 复核 21 张在 vault 各版本里的落点，**含阳性/阴性两组对照** | `python3 recon.py` |
| `recon2.py` | 与路径无关的判据：扫全历史 7,385 个 blob | `python3 recon2.py` |
| `recon3.py` | 检验「节选来自 `paper2skills-code/`」这条假设（**已否决**） | `python3 recon3.py` |
| `recon4.py` | 检验「只认 python 标注导致漏读」这条假设（**成立，19/21**） | `python3 recon4.py` |
| `recon5.py` | 在本地那棵可读树里找 2 张源站独有卡的节选 | `python3 recon5.py` |
| `diff-before-after.py` | 改前/改后**逐卡**对账，变化必须逐类可解释 | `python3 diff-before-after.py` |
| `self-proof.py` | 把对外报的每个数**逐条重算**（35 条断言） | `python3 self-proof.py` |
| `before/code-recovery.before.json` | 改前的索引快照（对账基线，无凭证） | 上面两个脚本自动读 |

## 纪律（本轮新加两条）

1. **先证明判据能报「否」，再相信它报的「是」。**
   本轮第一次跑出的结论是「20/21 在 vault 历史里命中」——**那是错的**：
   自己写的节选提取与管线口径不一致，退化成「匹配一个空行」，几乎命中任何围栏。
   补了阳性对照（oracle 抽样须全中，修正后 20/20）与阴性对照（节选尾接垃圾行须全不中，
   第一次那版是 20/20 误命中）才抓出来。
2. **改前的正文快照不留档。**
   `source-code.before.json`（10.7 MB）含 **3 处未脱敏凭证**，而 `.scratch/**` 是
   gitignore 白名单（`.gitignore:25` 的 `!.scratch/**`）——留着就会随 `git add -A` 进仓库。
   已删除，对账脚本改为只报读数不打印旧正文。
