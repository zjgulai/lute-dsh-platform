# p2s 恢复区缺陷取证（2026-09-12）

**只读目录**：这里的脚本全部不写 `data/` 或 `generated/`，只产 `*.json` / `*.pkl` 取证物。
结论落在 [ADR-0051](../../docs/adr/ADR-0051.md) 与
[Note](../../docs/notes/implemented/capability/2026-09-12-paper2skills-parse-defects.md)。

## 这一轮要回答的问题

上一版 README 把「1,317 张已恢复里 20 张 `ast.parse` 不过」归成
「源码本身写坏（全角 `（`、`：`）」，并据此提了下一入口
「很像一次批量的中文化替换误伤了代码」。本轮要判这个归因对不对。

## 结论

**归因错了一半。** 20 张是两个不同的东西：

| 分类 | 张数 | 含义 |
| --- | ---: | --- |
| 源码写坏 | 5 | 围栏之后只剩收栏，终点**唯一确定**，取到的就是全部 |
| 判据未定终点 | 15 | 无 oracle 时终点不唯一，恢复区**把卡正文圈了进来**，那段不是实现 |

且 5 张源码缺陷形态各不相同，**没有一条来自全角标点**（全角 `（` 出现在 1,110 张卡的
恢复区里，其中 1,091 张正常 `ast.parse`；它们都在字符串与注释里）。

## 脚本（按依赖顺序）

| 脚本 | 干什么 | 产出 |
| --- | --- | --- |
| （内联）`git cat-file --batch` | 一次取齐 1,338 张卡在 `4a4fa0d4` 的明文（18.9 MB，0.1 s） | `vault-blobs.pkl` |
| `recon1.py` | 1,338 张的围栏落单 / 恢复区散文命中统计 | `recon1.json` |
| `recon2.py` | 四把尺子：卡内结构、断尾指纹、围栏后残留、仓内真源 | `recon2.json` |
| `recon3.py` | 按卡自述的「代码路径」对齐仓内真源 | `recon3.json` |
| （内联）全量对齐 | 1,288 个真源 py 逐卡行签名覆盖率 | `canonical.pkl` |
| `probe-defects.py` | 逐卡缺陷定位（控制字符 / 嵌套三引号 / 非法模块名 / 括号 / 三引号） | `probe-defects.json` |

复现：

```sh
cd /Users/lute/project/Magpie-Horch
python3 -u .scratch/p2s-parse-audit/recon1.py
python3 -u .scratch/p2s-parse-audit/recon2.py
python3 -u .scratch/p2s-parse-audit/recon3.py
python3 -u .scratch/p2s-parse-audit/probe-defects.py
```

### 两个中间物已删除，且**必须**删除

`vault-blobs.pkl`（18.9 MB，1,338 张卡的未脱敏明文）与 `canonical.pkl`（5.7 MB，仓内
真源码原文）**已在收尾时删掉**，理由与上一轮同一个：

- 两者合计 24.6 MB，是可由脚本一键重建的中间物；
- `vault-blobs.pkl` 实测带 **3 处**真实凭证（`sk-aae11f…`，与 ADR-0049 记的「vault 完整
  代码里有 3 张带同一个 key」是同一批）；
- `.gitignore` 第 25 行是 `!.scratch/**` —— **`.scratch/` 是白名单**，留着就会随
  `git add -A` 进仓库。

本目录现存 9 个文件全部**实测 0 处凭证命中**（用 `lib/secret-scrub.js` 的同一套模式扫的）。
要重建中间物，跑上表第一行 / `recon3.py` 即可；重建后**不要留在盘上过夜**。

## 判据的三档可信度

1. **可复算**：上面四个脚本，只读，随时可重跑。
2. **可复现的红测**：拆掉 `defect_of()` 的嵌套三引号分支 → `--selftest` 2 条断言失败、
   exit 1；把索引里任一张的分类或行号改掉 → 单测相应红（实测 A/B/C 三组，
   分别红 5 / 3 / 4 条）。
3. **只能人工确认的**：`longest_parseable` 在 5 张 oracle 上给出的「最长可 parse 前缀」
   是 199 / 61 / 164 / 56 / 0 行，与残缺位置无关 —— 这是「不能用前缀法截断」这条结论的
   唯一依据，数字已抄进 ADR 备查。

## 三条被证伪的假设（别再走一遍）

- 「20 张都因全角标点写坏」——假。1,110 张卡带全角 `（`，1,091 张能 parse。
- 「这批卡被一次批量中文化替换误伤」——假。五种形态、五种成因，且换成合法写法只有
  1 张（`Skill-TimeCMA`，把 `from paper2skills-code.…` 改成 `from time_cma_llm_2025.model import …`
  即可 parse）。**修的是语料，本包只读，不在本包落地。**
- 「卡里的实现就是仓里那个文件」——假。1,288 个真源文件里只有 **1 张**卡（0.989）对得上；
  其余 19 张最高覆盖率 ≤0.10。

## 一条方法教训

`ast.parse` 的报错行**不是缺陷行**。`Skill-CodeXEmbed` 的报错指在第 204 行
（`"code": """`），而真正的问题在第 208 行（内层 docstring 又写三引号）。
按报错行建判据会稳定地指错位置；`probe-defects.py` 用字符级扫描才定位到真行。
