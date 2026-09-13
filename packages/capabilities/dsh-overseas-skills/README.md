# dsh-overseas-skills

DSH Desktop 设置页「出海技能」插件：从 Accio 导入的跨境电商技能目录（8 大场景 / 28 细分 /
223 项），按 **L1 场景 → L2 面 → L3 责任域 → L4 岗位 → 技能卡** 四级下钻呈现，
并提供搜索与「模型可见 + `/` 菜单可见」开关。

页面要回答的是**「这些技能服务于组织里的谁」**——组织骨架（4 面 / 8 责任域 / 50 岗位）来自
《AI组织变革》材料的 50 个 preset，归位判定来自本包的 `manifest/role-assignments.json`
（[ADR-0044](../../../../docs/adr/ADR-0044.md)）。

> 页面位于 设置 → 出海技能（侧边导航 order 26）。AI全栈技能（order 27）共用同一个组件但**不带
> `org` 属性**，因此保持原有分组视图——那 30 条没有场景轴。

## 结构

| 文件 | 职责 |
| --- | --- |
| `lib/index.js` | Host：`/api/dsh-overseas-skills/{list,fullstack-list,org,toggle,credential,prompt-template}`（全部 loopback 栅栏）；toggle 写 frontmatter 的 `disable-model-invocation` + `user-invocable` |
| `lib/catalog.js` | 场景 / 细分 / 223 项目录 + AI全栈 30 项（由 `scripts/build_preset_catalog.py` 从 `manifest/*.json` 生成） |
| `lib/org-tree.js` | **纯函数**：把场景目录 × 归位表 × 岗位骨架拼成四层树（含计数、诊断、接线索引）；有单测 |
| `lib/preset-roles.js` | 读 `~/.dsh/.agent-presets/agt-*/manifest.json` 的 `x_lute`（面 / 责任域 / order / 责任名 / 接线 subset / 头像）——组织骨架的运行时家 |
| `lib/role-map.js` | **构建产物**：`manifest/role-assignments.json` → 宿主可 import 的归位表，由 `scripts/build_role_map.py` 生成（`--check` 供门禁用） |
| `lib/layer-icons.js` | **构建产物**：4 面 + 8 责任域的 12 枚头像，由 `scripts/gen-layer-icons.mjs` 从 lute-brand-icons 烘焙；与算法技能页**逐字节相同**（有跨包测试） |
| `lib/client.js` | settings.section 页面（id `overseas-skills`、order 26）与输入框胶囊（`ovp*`）：四层下钻 + 搜索 + 开关，全部 `dsw-*` 语义 Token |
| `manifest/role-assignments.json` | **归位判定的唯一事实源**：253 条技能 → 岗位（含 `source` / `confidence` / 逐字证据 / 删除理由） |
| `manifest/skills.json` 等 | 目录的权威映射（name / 中文 title / 场景 / 细分 / toolBadcked） |
| `scripts/build_role_map.py` | 编译归位表（`--check` 断言 lib 与 manifest 一致） |
| `scripts/gen-layer-icons.mjs` | 烘焙 12 枚层头像 |
| `scripts/build_preset_catalog.py` | 重建 `lib/catalog.js` |
| `scripts/import-accio.mjs` | 一次性幂等导入器：`/Users/lute/.accio/accounts/1786471462/skills` → `~/.dsh/skills`（工具型跳过，frontmatter 归一化 + 中文 title） |

## 页面报什么数（三个数必须分开读）

> **本表每一行都由 `test/doc-counts.spec.mjs` 对着代码实测断言**（2026-09-13 建立）。
> 改 `lib/catalog.js` 或 `manifest/role-assignments.json` 而没同步本表 ⇒ `npm test` 会红。
> 这张表此前是**手写的**，于是漂移了 1–2 条却无人发现 —— 那些数字是页面读数的上游。

| 事实 | 数字 | 页面怎么说 |
| --- | --- | --- |
| 技能卡 | 223 | 「技能卡 223」 |
| 归位 / 未归岗 | 209 / 14 | 「归位 209　未归岗 14」；未归岗按场景成组，带分型计数 |
| **行数** | **319** | 「行数 319」+ 一句话解释：一张卡归多个岗位就会在多处出现，**行数 ≠ 卡片数**，开关按卡走 |
| 岗位 | 50（有卡 47） | 零卡的 3 个岗位（AGT-013 / AGT-005 / AGT-049）在诊断条里逐个点名 |
| 接线 | 逐卡三态 | 「本岗已接线」/「接线到 AGT-0xx」/「未接线」；另有「preset 挂了但未归本岗」的独立账 |

**归位 ≠ 接线**：归位来自 `manifest/role-assignments.json`（技能属于哪些岗位），
接线来自各 preset 的 `x_lute.skills.subset`（preset 实际挂载了哪些技能）。
两者不一致是事实，不是错误——页面把它们分列。

## 两条命令

```sh
python3 scripts/build_role_map.py --check   # 只断言 lib/role-map.js 与 manifest 一致（**一致性**）
python3 scripts/build_role_map.py           # 重新编译（改了 manifest 之后）
python3 scripts/validate_assignments.py     # 断言判定本身对不对（**正确性**，见下）
python3 scripts/validate_assignments.py --check-roles-live   # 岗位快照 vs 运行时 preset 漂移
node scripts/gen-layer-icons.mjs            # 重新烘焙 12 枚层头像（改了品牌技能之后）
npm run typecheck && npm test               # tsc + node --test（44 项）
```

### `--check` 与 `validate_assignments.py` 不是一回事（R4，2026-09-13）

`build_role_map.py --check` 比的是**导出物与源文件**：两边一致它就绿。
于是 `evidence.from_skill` 一旦被改成一句**技能原文里根本没有**的话，
`--check` 照样绿 —— 它看的是「有没有变形」，不是「是不是真的」。

`scripts/validate_assignments.py` 只做后者，六条判据（词表 / 证据连续子串 /
多岗不得 high / 无岗必留痕 / 去重 / 删除留痕），全部确定性、无模型参与。
它**先报复核覆盖率**，语料覆盖不到的按「不可复核」计数、**绝不计入通过**；
输入为空时退出码 **2**（「没东西可查」不等于「查过了没问题」）。
`--selftest` 用构造样本证明每条判据都会打红（含「两碎片拼接」这种
两边都在原文里、拼起来不是的伪造）。

依赖两份**标注了来历的快照**（`manifest/role-records.json`、
`manifest/skill-evidence-corpus.json`）：它们是**复核基线，不是事实源** ——
岗位的事实源是各 preset 的 manifest（页面运行时读它），技能目录的事实源是 `lib/catalog.js`。

归位判定的生成链（一次性，产物已入库）：`.scratch/overseas-skills-refactor/`
——`PROTOCOL.md`（判定规则）、`merge-assignments.py`（合并成 manifest）、
`probe-client-render.mjs`（真负载 + 真组件渲染实测）。
⚠️ 该目录里的 `validate-assignments.py` 是**当年的一次性脚本**，只吃 `.scratch` 的批次输入；
可复跑的那份已按上述搬进包内 `scripts/validate_assignments.py`。

## 安装（已完成）

- profile `~/.dsh/profiles/desktop/package.json`：`dependencies` 加 `"dsh-overseas-skills": "file:../../../project/Magpie-Horch/dsh-overseas-skills"` + `dsh.profile.bundles` 加条目；`pnpm install --no-frozen-lockfile`；重启。

## ⚠️ 修改 lib/ 后的同步方式（重要）

pnpm 的 `file:` 安装是**硬链接**；但 AI 编辑工具（edit/write）是原子替换（新 inode），会**断开硬链接**，
profile 里的副本将停留在旧内容，宿主热更检测不到。

每次改完 `lib/*.js`，必须**原地覆写** profile 副本（保留 inode）；**先判断是否同一 inode**（硬链接同 inode 时 `cat >` 会自截断为 0 字节）：

```bash
SRC=/Users/lute/project/Magpie-Horch/dsh-overseas-skills
DST=~/.dsh/profiles/desktop/node_modules/dsh-overseas-skills
for f in lib/index.js lib/catalog.js lib/client.js lib/org-tree.js lib/preset-roles.js lib/role-map.js lib/layer-icons.js; do
  if [ "$SRC/$f" -ef "$DST/$f" ]; then
    echo "skip (same inode): $f";
  else
    ln -f "$SRC/$f" "$DST/$f";   # 新文件用硬链接接进来；已存在的用 cat > 亦可
  fi
done
# package.json 的 files 清单变了要单独同步（门禁会拦）：
node scripts/sync-profile.mjs --apply --only-metadata
```

`node scripts/gen-layer-icons.mjs` 与 `build_role_map.py` 用的是 `writeFileSync`（**原地写、不换 inode**），
因此重新生成不会断链；`edit`/`write` 工具会。

## 开关语义（A1 · 已生效）

- 页面开关 = **模型调用开关**：开 → `disable-model-invocation: false`；关 → `true`。
- `user-invocable` 恒 true：`/` 菜单始终全量可见，用户显式 `/调用` 不受模型开关影响。
- 默认策略（O1）：导入技能默认 `disable-model-invocation: true`（仅用户侧）；业务员在页面手动开启后才进入模型目录。
- 卡片 `toolGap` 徽标：「需外部工具」= 本机未接入对应 API/MCP（Exa/Jungle Scout/Klaviyo/Printify 等），技能正文含降级说明。
- 工具型 20 项（cli.py/scripts）按决策不导入，页面不显示。

- 客户端 bundle（`lib/client.js`）：覆写后宿主 `client-hmr` 500ms 轮询自动 rebuilt（rev 从随机 nonce
  变 12-hex 内容哈希），渲染器热更；必要时 Cmd+R。
- 宿主入口（`lib/index.js`）：需重启桌面 app 才生效（宿主无热更）。

## 开关语义（A1 · 已生效）

- 页面开关 = **模型调用开关**：开 → `disable-model-invocation: false`；关 → `true`。
- `user-invocable` 恒 true：`/` 菜单始终全量可见，用户显式 `/调用` 不受模型开关影响。
- 默认策略（O1）：导入技能默认 `disable-model-invocation: true`（仅用户侧）；业务员在页面手动开启后才进入模型目录。
- 卡片 `toolGap` 徽标：「需外部工具」= 本机未接入对应 API/MCP（Exa/Jungle Scout/Klaviyo/Printify 等），技能正文含降级说明。
- 工具型 20 项（cli.py/scripts）按决策不导入，页面不显示。

## 优化脚本

| 脚本 | 作用 |
| --- | --- |
| `scripts/optimize_data.py` | O1 默认关闭 + O2 互斥边界（description 尾部 + whenToUse）+ O3 环境说明块 + 描述压缩（幂等） |
| `scripts/route_bench.mjs` | O4 路由基准快筛（词法档）；基准集在 `eval/routing-benchmark.json`（44 条，含簇内负例） |
| `scripts/import-accio.mjs` / `build_manifest.py` / `apply_summaries.py` | 导入、目录、中文简介 |
