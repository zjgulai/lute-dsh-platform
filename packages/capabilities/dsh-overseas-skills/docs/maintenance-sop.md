# 出海技能体系 · 维护 SOP（脱手手册）

> 目标：体系不依赖作者记忆。所有操作可复制粘贴执行。
>
> 近两日变更与坑位（分类 v3、硬链接双杀、图标防抹、重复 `---`）：见 [recent-changes-2026-09-08.md](recent-changes-2026-09-08.md)。

## 1. 文件地图

| 对象 | 路径 | 说明 |
| --- | --- | --- |
| 技能运行时目录 | `~/.dsh/skills/` | 250+ 个技能目录（~/.dsh/skills 顶层口径）（SKILL.md + references/scripts/examples/assets/tests…），文件层实时生效 |
| 81 技能源码 | `~/project/81-Skills/`（**仓库外**，2026-09-11 迁出） | 中文目录源（转换源，含 4 个加密暂缓）；路径可用 `LUTE_81SKILLS_SRC` 覆盖 |
| 插件工程 | `~/project/Magpie-Horch/dsh-overseas-skills/` | catalog/图标/卡面/管线脚本 |
| 预设 | `~/.dsh/.agent-presets/brand-marketing-growth/` | 三件套，gen_bmg_preset.mjs 可复现 |
| 头像资产 | `~/.dsh/skills/lute-brand-icons/` | LUTE 头像生成器（manifest 176 条目，含 83 枚卡片图标映射） |
| 子集插件 | `~/project/Magpie-Horch/dsh-skill-subset/` | respectFileFlags 严格语义（I3） |
| 回滚备份 | `dsh-overseas-skills/backup/pre-81/` | 23 个被替换技能原文件 |

## 2. 常规操作速查

```bash
cd ~/project/Magpie-Horch/dsh-overseas-skills

# 一键管线：转换安装(可选) → 头像 → 目录 → 目录统一 → 静态闸门 → 同步 → lint
bash scripts/pipeline.sh            # 非破坏
bash scripts/pipeline.sh --import   # 含 81 转换安装（幂等，保留开关）

# 单步
node scripts/import-81skills.mjs            # 81 转换安装（dry 加 --dry）
python3 scripts/assign_lute_icons.py        # 头像分配（改映射就改这个脚本）
node scripts/unify-directories.mjs          # 存量目录统一（幂等）
node scripts/normalize-zh.mjs              # AI全栈中英排版归一（幂等，ADR-0008）
node scripts/soften-clarify.mjs            # 指令分级措辞软化（幂等，审计 F1）
node scripts/gen_bmg_preset.mjs             # 预设再生成（白名单随 81-mapping）
node scripts/verify_static.mjs              # 静态闸门（名字唯一/图标覆盖/悬空引用）
bash scripts/verify_p7.sh                   # 运行时验收（需 DSH 运行中）
bash scripts/preset_mount_probe.sh          # 预设挂载探测
```

**改目录/图标/摘要/catalog 后**：管线同步 → 重启 DSH Desktop（catalog 数据在宿主进程内存）。
**只改技能 SKILL.md 正文/子文件**：无需重启，实时生效。

## 3. DSH 升级后必做（顺序）

1. `node scripts/patch-cn-slash.mjs` — 重打中文斜杠补丁（锚点未命中会显式报告，核对后手动修）
2. `bash scripts/verify_p7.sh` — 运行时验收
3. 白屏排查先查 `~/Library/Application Support/DSH Desktop/lifecycle-events/startup.jsonl` 尾事件：
   - 期望 `finalStage: health-commit`、`rendererStatus: healthy`
   - 出现 `declares no dsh.bundle` → 新装 bundle 缺声明（1.5 硬规则）
4. 日志：`~/Library/Application Support/DSH Desktop/logs/`；预期告警仅两类（安全跳过）：
   - `dsh-skill-subset: <名> 注册失败: ENOENT`（4 个暂缓白名单占位）
   - `skill file … ignored: missing YAML frontmatter`（非本体系技能，单独修复）

## 4. 验收清单（任何发布/迭代后）

- [ ] `verify_static.mjs` 全绿（25 组/228 行/图标/悬空引用）
- [ ] `verify_p7.sh` 全绿（分组数/新分组/B 类标题/installed/防白屏）
- [ ] 设置页：卡面摘要无空白、LUTE 头像渲染
- [ ] 斜杠命令：中文候选/填入/触发 + 英文回归（五步清单见 docs/cn-slash-commands.md）
- [ ] 品牌营销增长官：挂载正常、开关语义生效（I3）

## 5. 故障排查表

| 症状 | 首查 | 处置 |
| --- | --- | --- |
| 启动白屏 | startup.jsonl 尾事件 + `declares no dsh.bundle` | 补 dsh.bundle 声明 + cordis.patch.yml 自插行（1.5 硬规则） |
| 设置页卡片不显示 | client load report + slot abdication（active:false=渲染崩溃） | 检查 client.js 注入服务与 hooks 顺序 |
| 卡片数据旧 | profile 硬链接同步 | `pipeline.sh` 重跑（-ef 守卫逻辑内置） |
| 技能开关不生效（非预设会话） | frontmatter disable-model-invocation | 设置页 toggle 直接写文件 |
| 预设内开关不生效 | agent.cordis.yml 是否含 `respectFileFlags: true` | 未含=现状语义（全部可调用）；含=严格语义 |
| 路由引用悬空 | verify_static.mjs | 改 unify-refine-batch*.json 或 81-mapping.json 后重跑 |

## 6. 回滚

- 技能内容回滚：`backup/pre-81/<名>/` 覆盖回 `~/.dsh/skills/<名>/`
- 中文斜杠补丁回滚：`node scripts/patch-cn-slash.mjs --restore`（自动用 .bak-cn-slash）
- 预设回滚：`~/.dsh/.agent-presets/brand-marketing-growth/` 删除即卸载；白名单由 gen_bmg_preset.mjs 重建
- I3 回滚：删 agent.cordis.yml 中 `respectFileFlags: true` 一行

## 7. 待办留痕

- 4 个加密技能（上市策略/市场可行性审计/竞品情报/电商季度战略）补齐 → `pipeline.sh --import`
- DSH 升级后跑 §3

## 8. AnySearch 技能（用户级实时搜索）

- 位置：`~/.dsh/skills/anysearch/`（SKILL.md + scripts/ 4 语言 CLI + .env 600 权限 + runtime.conf）
- 来源：github.com/anysearch-ai/anysearch-skill v3.1.0（Apache-2.0）
- 升级：重新下载 release → 覆盖 SKILL.md/scripts/ → 保留 .env 与 runtime.conf
- 运行时：`python3 ~/.dsh/skills/anysearch/scripts/anysearch_cli.py <search|batch_search|extract|get_sub_domains> …`
- Key：`~/.dsh/skills/anysearch/.env`（ANYSEARCH_API_KEY，chmod 600）；优先级 --api_key > .env > 环境变量 > 匿名
- 目录行：manifest/extra-skills.json（extensible 清单，接入 build_preset_catalog.py）

## 9. AI全栈技能（mattpocock/skills 稳定集 29 个）

- 决策与背景：docs/adr/（ADR-0001~0007）、docs/ai-fullstack-analysis.md
- 管线：`node scripts/import-fullstack.mjs`（幂等；译文取 staging/translations/<name>.body.md，缺则英文回退）
- 验收：`node scripts/verify-fullstack.mjs`（29/29 解析/开关/路由冒烟/脚本语法/预设副本）
- 页面：设置页第二 section「AI全栈技能」+ 卡片墙双组（lib/index.js fullstack-list 端点 + lib/client.js 参数化）
- 图标：lute 生成器 sk-fs-* / fs-cat-* 条目 → assign_lute_icons.py 双档分配
- 升级源仓库：重新 clone mattpocock/skills → 覆盖 /tmp/mattpocock-skills → 重跑 import + verify
- 撞名注意：tdd/to-spec/grill-me 全局新版与「AI 产品开发工程师」预设旧版共存（预设层优先，ADR-0002）

## 10. 技能卡片结构化引导（Prompt 模板）

- 模板引擎：`lib/templates.js`（L1 人工 30 个高频技能 + L2 解析「## 输入」章节 + L3 通用兜底；mtime 缓存）
- 数据流：/list 每行附 `template` 字段 + `GET /prompt-template?name=&title=`；卡片单击填结构化模板，hover「简」按钮填简短版
- 斜杠选择器：patch-cn-slash.mjs 6 处补丁（中文标题×2/卡片墙/P4 候选挂模板/P5 onPick 模板/P6 缓存）
- 增改模板：改 lib/templates.js 的 L1 表即可（mtime 缓存自动失效）；分析文档 docs/skill-prompt-templates-analysis.md
- 维护注意：补丁脚本锚点为精确原文（缩进敏感），改动前先看目标文件；--restore 会回滚**所有** 6 处补丁（含海外 client.js），restore 后需重跑 palette 模板改动（历史教训 2026-09-06）

## 11. 万物互联插件（dsh-wanzh-hulian）同步与红线

- 位置：`/Users/lute/project/Magpie-Horch/dsh-wanzh-hulian/`（profile file: 硬链接；编辑工具重写源文件会打破 inode → 改后必须 `cat lib/<f>.js > ~/.dsh/profiles/desktop/node_modules/dsh-wanzh-hulian/lib/<f>.js`）
- 文档索引：`dsh-wanzh-hulian/docs/README.md`（产品形态总览 + 版本状态 + 导航）
- 关键事实：/open 白名单（biji + shopify 域）、connections.json/mcp-servers.json（0600）、CREDENTIAL_REFS 动态收集、probe 注册表、MCP 宿主直挂 dsh-mcp-client（静态挂载重启生效）、getnote 19 工具 + 真移动语义（≤20/批）
- 验收节奏：宿主变更需重启；客户端变更刷新即可；补丁变更重启/刷新

## 12. 第三方技能入库 SOP（分类 → 归位 → 生效）

> 适用范围：**非 81 系自研**、从外部仓库/市场引入的技能。
> 自研 81 系的归位四步见 [skill-taxonomy-v2.md](skill-taxonomy-v2.md) 「新增技能归位 SOP」——两者判据不同，不要互相套用。
> 已入库实例：[§8 AnySearch](#8-anysearch-技能用户级实时搜索)（工具接入型）、`lieflat-charts`（内容渲染型，2026-09-12 入库）。

**硬规则：每一个进来的技能都必须落到「岗位归属」，或明确归为「通用型」。不允许既无岗位、也无通用分型的裸条目。**（用户 2026-09-12 定）

### 12.1 第一步 · 形态判定（决定后面全部落点）

| 形态 | 判据 | 安装去向 | 是否进 manifest |
| --- | --- | --- | --- |
| 纯文档 / 方法论参考 | 无 `SKILL.md` frontmatter | 不入技能目录 | 否 |
| **技能（Agent Skills 格式）** | 根目录 `SKILL.md` + frontmatter | `~/.dsh/skills/<name>/` | **是（本 SOP 主体）** |
| Python CLI / uv 工具 | `pyproject.toml` + `[project.scripts]` | `uv tool install`（可附技能） | 附带的技能才进 |
| DSH 打包插件 | `package.json` 含 `dsh.bundle` 或 `cordis.patch.yml` | profile 依赖 + bundles | **否** —— 走插件流程，勿混入技能目录 |

判据取自 frontmatter 而非目录名。**链接指向的仓库形态经常反直觉**（可能是发行版 monorepo、可能是工具而非插件）——判定结论要先与负责人对齐再动手。

### 12.2 第二步 · 来源留底（决定升级与回滚怎么做）

安装前必须记下三样，写进该技能的接口文档：

1. **锚定 commit SHA**（不是分支名）——`git ls-remote <url> refs/heads/main`
2. 上游仓库 URL
3. 许可证

**目录安装策略（2026-09-12 定，此前教训）**：技能目录**不要保留 `.git`**。

- 理由：入库必然改写 `SKILL.md` frontmatter（补 §12.3 四件套），带 `.git` 时 `git pull` 会在 frontmatter 处冲突，每次更新都要 stash + 重放本地字段，是个会持续咬人的坑。
- 代价：失去内置版本控制 → 用**锚定 SHA 写进文档 + 上游 tarball 版本化**替代。
- （`lieflat-charts` 原本是 git clone，已按此改为纯目录安装，释放 18MB。）

### 12.3 第三步 · 补齐元数据（四件套 + 溯源块）

两道**都要做**，缺一不可 —— 它们服务不同的消费者：

| 落点 | 字段 | 谁消费 |
| --- | --- | --- |
| `~/.dsh/skills/<name>/SKILL.md` frontmatter | `name`（kebab，必填）、`description`（必填）、`title`（中文显示名）、`user_summary`、`user_try` | DSH 会话技能目录、卡片「试试这样说」 |
| `manifest/skills.json` | `name`、`title`、`category`、`categoryTitle`、`scenario`、`subcategory`、`toolBacked`、`importable`、`summaryZh` | 出海技能页卡片 |
| `manifest/skill-icons.json` | `name` → LUTE 头像 data URI | 卡片头像 |

**两个已实测的坑（会静默失效，不报错）**：

- ⛔ **`manifest/skills.json` 里的 `icon` 字段对非 81 系技能无效**。构建器只认 `skill-icons.json`（及 81 系覆盖表），行内 icon 会被改写为 `""` 并回退到**分类默认头像**。表现是「卡片有头像但和同组其它技能一模一样」，容易误判为成功。**头像必须写 `skill-icons.json`。**
- ⛔ **只改 `SKILL.md` 不写 manifest 无效**。宿主 `buildScenarios` 用 `skill.subcategory` 过滤 `SKILLS` 才能匹配到分组，manifest 里没有条目 → 卡片根本不出现。

头像取值：`~/.dsh/skills/lute-brand-icons/assets/manifest.json` 的 `id → data URI`。
生成器 `assign_lute_icons.py` 会**保留**非 81 系的手工条目（`if name not in SKILL_ASSIGN`），因此写进 `skill-icons.json` 是防抹的；重跑管线不会丢。

### 12.4 第四步 · 场景归位（taxonomy v3）

在 `manifest/taxonomy-v3.json` 补两处：`mapping["<name>"] = <细分场景key>` 与 `overseasNames` 数组。

8 大场景 / 28 细分场景的 key 见该文件 `scenarios`。**判别口径是「这个技能的产出服务于出海链路哪个阶段」**，不是「它像哪类软件」。例：图表/报告生成 → `g-insight` / `g1-analytics`（与 `ecommerce-daily-report`、`ecommerce-sales-dashboard` 同格）。

### 12.5 第五步 · 岗位归属或通用分型（本 SOP 的核心）

写入 `manifest/role-assignments.json` 的 `skills{}`，`_meta` 明确它是「**归位**（技能属于哪些岗位，喂页面）」，与 `scripts/role-presets/skill-map.json` 的「**接线**（preset 实际挂载哪些技能）」是两件事，不要混。

**两条互斥路径，必须二选一：**

**路径 A · 挂岗** —— 技能的三条责任能对上《AI组织变革》某岗位的责任（词表见 `.scratch/overseas-skills-refactor/evidence/roles.json`）：

```json
{
  "catalog": "overseas", "scenario": "<key>", "sub": "<key>",
  "roles": [{ "id": "AGT-0NN", "responsibility": "<该岗三条责任之一，逐字>",
              "source": "assigned", "confidence": "high|medium|low",
              "evidence": { "from_skill": "<技能原文连续子串>", "from_role": "<岗位原文连续子串>" },
              "note": "<边界说明：只服务哪个环节、不含什么>" }]
}
```

硬约束：`responsibility` 必须**逐字**属于该岗三条之一；**≥3 岗时不得标 high**；`from_skill`/`from_role` 必须是两侧原文的连续子串（防伪造）。

**路径 B · 通用型**（不挂岗）—— `roles: []`，且**必须**同时给分型与理由：

| `no_role_kind` | 含义 | 典型 |
| --- | --- | --- |
| `GENERIC_METHOD` | 跨岗位通用的**方法论**：任何岗位都能用，但不承载某一岗的责任 | `tdd`、`code-review`、`doc-coauthoring`、`grilling` |
| `TOOL_ONLY` | **纯工具/格式处理形态**：无业务语义，只做转换或呈现 | `docx`、`pptx`、`xlsx`、`pdf`、`anysearch` |
| `OUT_OF_SCOPE` | 有明确业务语义，但不在本体系出海链路内 | `freemium-upgrade-optimizer`（面向 SaaS 付费墙） |
| `OTHER` | 兜底（需在 `no_role_reason` 说清） | — |

**判别要点：技能是「产出业务结论」还是「只做呈现/转换」。** 图表渲染输入任意数据、不选品不归因不做经营判断 → `TOOL_ONLY`；同组的 `ecommerce-sales-dashboard` 挂了 AGT-021/AGT-003，因为它**自带业务口径**——这是两者的分界，不能因为「都出报表」就抄同一个答案。

`no_role_reason` 要写成能独立读懂的一段话（现状体例见该文件既有条目）。

### 12.6 第六步 · 重建、验收、生效

```bash
cd ~/project/Magpie-Horch/packages/capabilities/dsh-overseas-skills

# 1) 改动落 manifest 后重建（catalog.js / role-map.js 是构建产物，不要手改）
python3 scripts/build_role_map.py            # manifest → lib/role-map.js
python3 scripts/build_preset_catalog.py      # manifest → lib/catalog.js（自带 preset-skills.json 防清空守卫）

# 2) 契约门（含 coverage 计数一致性）
node --test test/*.spec.mjs                  # 期望全绿

# 3) 重启桌面进程（catalog 在宿主内存里，不重启页面看不到新卡片）
osascript -e 'tell application "DSH Desktop" to quit'; sleep 5; open -a "DSH Desktop"

# 4) 运行层取证
curl -s http://127.0.0.1:43120/api/dsh-overseas-skills/list | \
  python3 -c "import json,sys;d=json.load(sys.stdin);[print(s['key'],len(x['items'])) for s in d['scenarios'] for x in s['subs'] if x['key']=='<细分场景key>']"
```

验收标准（四项缺一不可）：契约门全绿；目标细分场景条目数 **+1**；卡片 `title` 是中文名、`installed=true`、`modelEnabled=true`；头像与同组其它技能**不同**。

### 12.7 已知陷阱（实测，重复运行会踩）

| 陷阱 | 症状 | 处置 |
| --- | --- | --- |
| ✅ 已修（2026-09-12）：`build_preset_catalog.py` 曾无条件重写 `presets/preset-skills.json` | `PRESET_IDS` 里那 7 个 preset 已不在 `~/.dsh/.agent-presets`（现存 51 个 `agt-NNN`），重跑把它清成 `{"presets": []}`，混进提交 | 已加守卫：**本次解析出 0 个而文件已有内容时跳过写盘并告警**；确要清空用 `--force-empty-presets`。路径若再变，守卫会打印告警而非静默改写 |
| ⚠️ 改了 manifest 不重启 | 页面上卡片不出现，但 curl 磁盘产物却已正确 —— 像「改了没生效」 | 宿主在内存持有 catalog 模块，必须重启进程 |
| ⚠️ 启动「用 CLI 起隔离实例」验证 | `dsh --profile desktop` 在装载阶段即失败，**不是**忠实启动 | desktop profile 的启动合约含 Electron 壳侧步骤（package overlay、YAML `!!js` tag 解析）。实况验证只能在重启后的真实实例里做 |

### 12.8 准入前置检查（许可证与署名）

入库前必须核 `LICENSE` 与 `THIRD_PARTY_NOTICES`，把结论写进 §12.2 的来源留底：

- **非商业许可（如 PolyForm Noncommercial）**：个人研究/内部试验可用，**对外商业交付超范围**。需先取得授权或明确放弃用于商业交付——这是业务决策，不是技术决策，必须留档。
- **署名要求**：部分技能在 SKILL.md 里明文要求模型交付后署名。**照做，但不要写进产出物本身**（上游常明确禁止污染内容）。
- **第三方依赖**：模板/脚本引外部 CDN、字体、地图数据时，记明联网依赖与各自许可证。

### 12.9 变体 · AI 全栈技能入库（与出海路径的落点差异）

出海技能进 `overseasNames` + `manifest/skills.json`；**AI 全栈技能进 `fullstackNames` + 全栈管线**，落点清单不同（2026-09-12 `simplify-codebase` 入库实测）：

| 落点 | 出海路径（§12.3–12.4） | 全栈路径 |
| --- | --- | --- |
| 技能目录 | `~/.dsh/skills/<name>/`（tarball + 四件套 + metadata 溯源块） | 同左，但 **frontmatter 用全栈标准形态**（name/title/description/enabled/disable-model-invocation/user-invocable）——`verify-fullstack.mjs` 的正则**只允许纯标量行，metadata 块会报「非法fm行」**；溯源写进技能目录 `README.usage.md` |
| 汉译 | — | `staging/translations/<name>.body.md`（正文汉译，references 保真英文原文） |
| 安装管线 | 手动 tarball | `import-fullstack.mjs` 多根回退：`staging/third-party/<name>/` 优先（仓库内版本化缓存），`/tmp/mattpocock-skills/skills` 兜底 |
| 映射表 | `manifest/skills.json` | **两处**：`scripts/fullstack-mapping.json`（安装+图标管线事实源，src/name/title/cat/summaryZh）+ `manifest/fullstack-skills.json`（catalog 构建读） |
| taxonomy | `mapping` + `overseasNames` | `mapping["<name>"] = "h2-agent-skill"` + `fullstackNames` 数组 |
| 归位 | `catalog: "overseas"` + 细分场景 | `role-assignments.json`：`catalog: "fs"` + `scenario: fs-*`（8 组：clarify/spec/architecture/implement/quality/infra/collab/writing）+ 挂岗或 `GENERIC_METHOD`/`TOOL_ONLY` |
| 头像 | `skill-icons.json` | lute-brand-icons `scripts/catalog.js` 加 `sk-fs-<name>` 条目 → `node scripts/build.js` → `assign_lute_icons.py` 自动写 `skill-icons-fs.json` |
| 计数闸门 | — | `verify-fullstack.mjs` 硬编码「29/29」等计数**必须同步 +1**（易漏） |
| 验收接口 | `/api/.../list` | `/api/.../fullstack-list`：`groups[]` 目标 fs 组条目数 +1，卡片 installed/modelEnabled/icon 齐全 |

判 `GENERIC_METHOD` 的对照锚：`codebase-design`、`improve-codebase-architecture`、`tdd`——跨仓库通用的工程方法论，不承载任一岗位三条责任。
