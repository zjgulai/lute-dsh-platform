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
