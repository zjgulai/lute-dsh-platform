# dsh-paper2skills — 论文技能库

把 [paper2skills](https://github.com/zjgulai/paper_to_skills) 语料的 **1338 张技能卡**，按 **LUTE 岗位矩阵的三层分类**（4 面 / 8 责任域 / 151 细分业务）适配为 DSH skill 并安装进 `~/.dsh/skills/`，供 50 个岗位 preset 逐显式装配。

## 为什么分类维度要和岗位矩阵同构

平台的「技能供给」与「岗位责任」是两套账。只有让 skill 的分类**严格取自**岗位矩阵的拓扑（而不是另造一套技术分类），两张表才能对账：某个 L3 细分业务有没有技能供给、哪个岗位缺、缺多少，都能机械算出来。

分类骨架原样取自材料 D-021：

| 级别 | 名称 | 数量 | 编码 |
| --- | --- | ---: | --- |
| **L1** | 面（plane，第一视角） | 4 | `PLN-MGT` 经营管理 / `PLN-OPS` 业务运营 / `PLN-CTL` 独立控制 / `PLN-PLT` 数据与Agent平台 |
| **L2** | 责任域（domain view，第二视角） | 8 | `DOM-01` 经营与组织 … `DOM-08` 数据与AI运行 |
| **L3** | 细分业务 | 151 | `DOM-0X-NN`，逐字取自每个岗位 `role-catalog.skills[]` |

一张卡可挂 1–3 个 L3；**L1/L2 由 L3 唯一导出，不允许跨面多挂**。

## 目录

```
data/taxonomy.json          4 面 / 8 责任域 / 151 L3（入库的判据唯一来源）
data/classification.json    1338 张卡的分类落点（入库）
data/code-availability.json ⑦ 段节选的实测值（入库）：是否顶到源站 60 行上限、能否 ast.parse
data/code-recovery.json     完整实现的**索引**（入库）：分层 / 行数 / sha256 / 校验方式
generated/                  派生产物，可重建，不入库
  cards.json                从 playbook HTML 抽出的 1338 张卡全文
  source-code.json          每卡的**完整实现正文**（7.7 MB，含未脱敏原文，**不得入库**）
  coverage.json             151 个 L3 的供给覆盖表 + 空白登记
  batches/S2-NN.json        S2 适配批次的输入
staging/                    适配中间产物（不入库）
  <L2>/<slug>/references/implementation.py   完整实现（安装器会递归拷进技能库）
scripts/                    构建期脚本：见「命令」
eval/                       效果实测（L6 路由 / L7 SkillOpt），产物落 eval/out/（不入库）
docs/                       adaptation-spec / classification-spec / loop-protocol / synthesis-spec
                            test-report（结构保真面）· eval-report（效果面）
lib/taxonomy.js             共享判据：加载、校验、slug、缺口认领分层
lib/card-render.js          卡面渲染纯函数（⑦ 段口径、占位判定、出处分档）
lib/secret-scrub.js         **凭证脱敏的唯一出口**（装配器与安装校验共用）
test/taxonomy.spec.mjs      判据单测
```

## 命令

```sh
node scripts/build-taxonomy.mjs     # 岗位矩阵材料 → data/taxonomy.json
node scripts/extract-cards.mjs      # playbook HTML → generated/cards.json（断言 1338 张）
node scripts/classify-check.mjs     # S1 分类门禁（逐域 id 同序同集 / L3 逐字命中 / 不跨面）
node scripts/merge-classification.mjs  # 合并 → data/classification.json + coverage.json
node scripts/build-batches.mjs      # 切 S2 适配批次
node scripts/import-paper2skills.mjs [--dry]  # staging → ~/.dsh/skills
node scripts/verify-install.mjs     # 安装后结构 + 分类一致性校验
npm test                            # 判据单测

node eval/static-routing.mjs        # L6-A 静态路由面（全量 1338，零模型调用）
node eval/build-cases.mjs           # L6-B 抽样与用例（确定性，种子 20260912）
node eval/l6-report.mjs             # L6-B 汇总 → eval/out/l6-report.json
node eval/build-l7-cases.mjs        # L7 高价值卡选卡与用例（确定性，种子 20260913）
```

效果实测的跑批要走 `workflow` 工具（真实 subagent），产物落 `eval/out/l7-rollout/`；
判据、数字与已知边界见 [`docs/eval-report.md`](docs/eval-report.md)，
过程教训见 [Note](../../../docs/notes/implemented/capability/2026-09-12-paper2skills-effect-eval.md)。

数据源：`$P2S_PLAYBOOK`（默认 `/Users/lute/project/paper_to_skills/playbook`，**只读**）、
`$ROLE_MATERIAL_ROOT`（默认 `/Users/lute/project/AI组织变革`）。

## 四条容易踩的坑

1. **缺口认领必须与分类落点自洽**。9 个平台缺口本身就是 L3 名（`数据管道` = AGT-046 清源的一个细分业务，`容量管理` = AGT-049 稳行的细分业务）。因此「这张卡补上某缺口」必须与「这张卡被分到了哪些 L3」对得上，否则会出现「工厂产能卡认领 AI 运行容量缺口」这类虚报。判据与三档分层（strong / adjacent / dropped）见 `docs/adaptation-spec.md` §4。

2. **全局可见性必须关**。1338 张全部装进技能库，但一律 `disable-model-invocation: "true"` —— 现有 272 技能的全局目录已占约 7.2 万字符，模型目录不能再涨。可见性只经 preset 的 `skill-subset` 逐岗白名单开放（`packages/contract/dsh-skill-subset`）。

3. **接线成功不等于有效果**。缺口关闭 8/9、本岗可达 134/151、越岗暴露 0 是**接线面**的成绩；
   而实测（L6 路由 40 例 + L7 轨迹 20 卡）显示：路由准确率 97.4% / 89.7%，错选全是同 L3 孪生卡；
   **调用技能卡后业务交付物得分反而更低**（holdout Δ −0.95）。两件事必须分开说——
   把「装了 1338 个技能」顺口说成「提升了能力」被这份实测直接证伪。
   判据与数字见 [docs/eval-report.md](docs/eval-report.md)，纪律见 [ADR-0035](../../../docs/adr/ADR-0035.md)。

4. **语料 vault 的工作区已经不是文本了**。`paper_to_skills/paper2skills-vault/**.md` 有
   **1,353/1,545 个**已被改写成二进制容器（32 字节头 + 零填充 + 高熵正文），
   且 **`mtime` 被保留成原值**——只看时间戳会误判成「一直就是这样」。
   任何读这些 `.md` 的脚本都会拿到乱码，**必须走 git 历史**（`git cat-file`）。
   判据、守卫与恢复口径见下一节与 [ADR-0049](../../../docs/adr/ADR-0049.md)。

## 语料重建（2026-09-12，[ADR-0047](../../../docs/adr/ADR-0047.md)）

1338 张卡的第一轮全量体检发现：**缺陷不在那 1338 个文件里，在流水线的三行源码里。**

| # | 一行 | 实测后果 |
| --- | --- | --- |
| A | `strip()` 里 `.replace(/[ \t]+/g, ' ')` 对整段生效（含 `<pre><code>`） | 1338/1338 张卡代码最大缩进恒为 **1** → 23% 语料不可解析，而卡上印着「可运行复制」 |
| B | 实体表只列 `&#39;`，源站写的是 `&#x27;` | 689/1338 张代码残留 HTML 实体 |
| C | `isPlaceholder()` 里 `if (t.length < 40) return true` | **1,440 处真内容被判为占位**并替换成假话；其中 1,041 处是论文出处 |

改三行 + 补回归测试 + 重跑，**不手改 1338 个文件**。两个纯函数拆到 `lib/html-text.js`
与 `lib/card-render.js` 以便测试 —— 这两个脚本此前测试覆盖为 0。

```
$ node --test test/*.spec.mjs      → 48/48（旧实现上跑，新增判据红测 5/5 红）
$ pnpm run gate                    → ok 15/15
$ pnpm run verify:provenance       → ✓ provenance 一致（1338 张）
$ pnpm run verify:code-availability → ✓ 代码节选可得性表一致
```

装后读数（详见 Note）：

| 指标 | 旧 | 新 |
| --- | ---: | ---: |
| 假占位句 | 4,514 | **0** |
| ⑦ 代码最大缩进（中位） | 1 | **12** |
| 残留 HTML 实体的卡 | 699 | **0** |
| ⑦ 代码可 `ast.parse` | 105（8%） | **818（64%）** |
| 卡面「可运行复制」（已被证伪） | 1,283 | **0** |

**457 张仍不可解析，且不是本流水线的责任**：源站对代码预览设了 **60 行硬上限**
（1,150/1,338 张正顶在上限），断点切在语句中间。见下一节。

## 代码节选口径（`data/code-availability.json`，入库）

卡页管 ⑦ 段叫「代码模板」、标签写「N 行 · **可运行复制**」、并附一个
`路径：paper2skills-code/…`。**三处都能证伪**，所以卡面按实测口径渲染，不转发源站的自述：

| 卡页自述 | 实测 |
| --- | --- |
| 「代码模板」 | 是**节选**：源站上限 60 行，1,150 张顶在上限，无一超过 |
| 「可运行复制」 | 457/1,279 张 Python 节选 `ast.parse` 失败 —— 复制即 `SyntaxError` |
| 「代码块数量：N · 路径：…」 | 806 张在承诺一个代码位置；该代码树**不在本包内** |

> **路径那条要特别说**：路径在作者机器上**能解析**（全量树 838/838），但那份代码与
> 本卡节选**同名不同物** —— 90.7% 是通用脚手架，预览里的 `def`/`class` 名全树召回仅 25.0%，
> **746 张卡零命中**。同名不同物比悬空更危险：悬空会响亮报错，同名会静默给错。
> 故卡面把它降级为「仅转述源站记录」。（**路径那条**说的是 `code_path` 指向的两棵树；
> 那两棵树是 vault 的**下游**，见下一节——实现来源是 vault 本身，与它们无关。）

每张卡现在自带答案（实测已装 1,338 张）：1,140 张明说已顶上限、133 张明说未到上限、
814 张明说语法完整、455 张明说不能直接运行、4 张标注非 Python、55 张明说未附代码、
10 张代码移入 `references/code.md`。

```sh
python3 scripts/build-code-availability.py            # 重新编译
python3 scripts/build-code-availability.py --check    # 断言产物与判据一致（门禁用）
```

两处守卫：有卡自述 > 60 行 → `exit 1`；**没有任何卡顶到上限** → `exit 1`（判据失效，
不是「真没截断」）。`verify-install.mjs` 另守一层：卡面不得再出现「可运行复制」。

## 完整实现（`data/code-recovery.json` 入库 + `generated/source-code.json` 派生）

**上一节那条「完整实现不在本包内」已作废**（[ADR-0049](../../../docs/adr/ADR-0049.md) 订正
[ADR-0048](../../../docs/adr/ADR-0048.md)）。完整实现一直在语料 vault 的卡里，
只是 iCloud 工作区的 `paper2skills-vault/**.md` 有 **1,353/1,545 个**已被改写成二进制容器，
只看工作区就什么都看不到；**同一仓库的 git 历史里 1,338/1,338 张卡都是明文**。

```sh
python3 scripts/build-source-code.py            # 读 $P2S_VAULT_GIT@$P2S_VAULT_REV → 完整实现
python3 scripts/build-source-code.py --check    # 重算并与入库索引逐卡对账（不写盘）
python3 scripts/build-source-code.py --selftest # 判据回归用例 36 条（不写盘）
```

判据自测**必须能报「否」**才算数：本轮实测把 `defect_of` 里的嵌套三引号分支拆掉后，
自测以 2 条断言失败退出 1（干净报错，非崩溃）。

**绝不读工作区**：读到二进制容器即 `exit 1`（`looks_like_container()`），不静默产乱码。

选取口径以**卡面节选为 oracle**（判定「节选是否为某个候选块的连续行前缀」），据此分三档：

| tier | 张数 | 含义 |
| --- | ---: | --- |
| `oracle` | **1,277** | 卡面节选已校验为候选块的开头（`prefix@1`） |
| `unverified` | 40 | 卡面无节选，无 oracle 可校验，取最长的 Python 成对块 —— **必须标注「未经交叉核对」** |
| `unrecovered` | 21 | 15 张围栏不闭合；4 张首块是 bash「运行方式」；2 张源站独有（非本包可修） |

**候选是「宽松枚举」的，语言标注不设限**（[ADR-0050](../../../docs/adr/ADR-0050.md)）：
每个行首 ```` ``` ```` 行都是边界，相邻边界之间即一个候选块 —— 因为源站发布的是卡里**第一个**块，
不问语言（`Skill-MAS-Orchestrator` 首块就是 ```` ```bash ```` 的 `cd … && python orchestrator.py`）。
但交付物是 `.py`，**只有 Python 块能当结果**；命中非 Python 块的卡记
`EXCERPT_MATCHES_NON_PYTHON_FENCE`，不伪装成「没找到」。

**起点由 oracle 定，终点由 `ast.parse` 定**：卡里的 Python 会把整张 markdown 卡塞进三引号字符串，
那串里的 ```` ``` ```` 会被当成边界；只取「到下一个边界为止」会把实现截在字符串中间
（实测 `Skill-Skill-Card-API-Serving` 只取到 66 行，真身 **443 行**）。

完整实现（落盘 1,317 张 / **259,365 行**）落各技能的
`references/implementation.py`：**5 行 `#` 溯源抬头 + 正文**（正文首行 = 第 6 行，
与语料编号树 `model.py` 同形状）。不内联进 SKILL.md —— 那是约 2.0M tokens，而 SKILL.md 有 12KB 硬上限。

已恢复的 1,317 张里 **1,297 张正文可 `ast.parse`**，余下 20 张带 `defect` 字段。
**这 20 张不是一类**（本包自己下一轮就会忘掉这件事，所以写死在这里，并由
`test/source-code.spec.mjs` 逐张点名锁住）：

| `defect` | 张数 | 是什么 | 取到的正文算不算实现 |
| --- | ---: | --- | --- |
| `UNLABELED` | **5** | 卡里的**源码本身写坏**。这 5 张的围栏之后只剩收栏，正文终点**唯一确定**，取到的就是全部 —— 解析失败只能来自源码 | 算，但跑不起来 |
| `WINDOW_TRUNCATED` | **15** | 无 oracle 可定时终点**不唯一**，恢复区一路吃到卡正文，末行常是 `## ④ 技能关联` 这类散文 | **不算** —— 这段不是实现 |

5 张源码缺陷逐张定位（`defect_line` / `defect_detail` 就是这行字）：

| 卡 | 行 | 病 |
| --- | ---: | --- |
| `Skill-CodeXEmbed-Code-Semantic-Embedding` | 208 | 第 204 行 `"code": """` 开串，串体里 docstring 又写三引号 —— Python 的串不嵌套，外层在**内层开引号**处被提前收尾 |
| `Skill-Model-Performance-Monitor` | 62 | `health_` 后跟控制字符 `U+0001`（全语料只此 1 处会造成失败） |
| `Skill-RFM-Segment-Campaign-Dispatcher` | 170 | 第 168 行开 `(`，第 170 行用 `}` 收 —— 括号种类不匹配 |
| `Skill-Real-Time-Competitive-Repricing` | 58 | 三引号开串到末尾仍未收尾 |
| `Skill-TimeCMA-LLM-Forecasting` | 1 | `from paper2skills-code.03-时间序列…` —— 连字符不在标识符字符集里，逐字抄了文件系统路径当模块名 |

**「源码写坏」与「全角标点」无关**：全角 `（` 出现在 **1,110 张**卡的恢复区里
（共 9,768 次），其中 1,091 张正常 `ast.parse` —— 它们都在字符串与注释里，合法。
真正让这 20 张倒下的都不是全角标点。上一版 README 把归因写成「全角 `（`、`：`」，
是本轮实测推翻的。

出口脱敏只有一个地方：`lib/secret-scrub.js`。实测卡页八段里只有 1 张卡带真实 API Key，
而 vault 的完整代码里有 **3 张**（同一个 key）——两条写盘路径各留一份模式表必然会漏。

## 出处分档（`data/provenance.json`，入库）

⑧ 段的 arXiv ID 混着四类东西：真出处、查无此号、一号被十几张卡共用、以及
**指向一篇与卡片主题毫不相干的论文**。实测 3D 装箱优化卡的 `2406.12089` 是凝聚态物理论文。

**还原一个指向别处的号，比留空更危险** —— 它看起来像一个可点开的出处。故按档位渲染：

| grade | 卡数 | ⑧ 段怎么写 |
| --- | ---: | --- |
| VERIFIED | 272 | 给出号 + 论文标题 |
| LIKELY | 117 | 号 + 标题，并注明「未达已核验线，引用前自行确认」 |
| UNDECIDABLE | 143 | **不做断言**，交人工（卡片英文 token 少于 2 个，比值不可判） |
| MISMATCH | 515 | 点名「这个号其实是哪篇」并判**无论文来源** |
| NOT_FOUND | 2 | 查无此号 |
| NO_ID | 289 | 源站就没抽出来 |

另有独立旗标：`fake_pattern` 81、`shared_by_N`（`2305.12345` 被 19 张卡共用）、
`id_vs_named_conflict` 176（② 段点名的论文与这个号指的不是同一篇）。

> **判据自测**：真值取 `paper2skills-vault/` 41 张过了逐字引文门禁的 `paper_id` —— 判对 38（93%），
> 假阴性 7%，故 MISMATCH 的**真值约 485，计数 515 偏高**。随机 12 张 MISMATCH 逐个人判
> 12/12 判对；随机 8 张 VERIFIED 8/8 判对。

```sh
python3 scripts/build-provenance.py            # 重新编译
python3 scripts/build-provenance.py --check    # 断言产物与判据一致（门禁用）
```

判据改动必须重编译，否则 `--check` 报红。
