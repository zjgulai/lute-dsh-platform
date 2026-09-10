# 二次开发全景代码诊断与优化方案

> 2026-09-10 定稿 · 4/4 包级深度评审 + 平台自查（全程只读）
> 决策记录：D1–D10（详见 §3），全部采用推荐项
> 范围：~/.dsh/profiles/desktop 在装 17 个本地包 + apply-patches 补丁层 + skill 数据链路 + UI（技能中心 fork 2.0）
> 上游输入：docs/research/01–08（LUTE 2.0.0 / DSH 2.0.5 基座链）

## 1. 诊断结论

### 1.1 健康基线（成立）
- 平台：startup finalStage=health-commit、renderer healthy；近 3 天错误仅历史案例（白屏 9-09 已自愈 / ECONNRESET 9-08）；技能 264·硬伤 0
- skill-center fork：tsc 0 错 · 73 测试 · 双 bundle · check_plugin 0 错误 · 硬链接同步
- 数据链路：user_summary 81/81、user_try 15→源 15→装 15→API 0 缺失；title 251/265

### 1.2 包级发现总表
| 包 | 发现 | 一句话 | 测试 |
|---|---|---|---|
| 灵枢 dsh-memory-local | **P0**+2P1+P2 | src 修复未进运行 lib（delegationDepth/dbPath 漂移）；不可构建（缺 tsconfig）；CWD 锚定 | 无，链断 |
| dsh-agent-team-gui-local | 3P1+3P2 | lib 落后 src+补丁幂等误报；宿主文案驱动导航；rubric 四案例全合规 | 26 套件 |
| dsh-browser-local | 3P1+3P2 | 心跳只发不查；navigate 无 host 白名单；invariant.ts 缺失致 0 tests | 11 套 0 tests |
| dsh-deepresearch-local | 2P1+2P2 | runnerCwd 加载期 CWD；addEvidence 吞错；无 build/test 脚本 | 链断 |
| dsh-theme-local | 1P1+2P2 | :root 全量重定义依赖 head 顺序 | 3 单测+门 |
| dsh-root-brand-local | 1P1+2P2 | 哈希类钉 2.0.4 直改宿主 DOM | 2 单测+门 |
| dsh-skill-center-local（fork） | 1P1-UX+3P2 | 其他组 69% 淹没；telemetry 死文件/死键/health 字段 | 73 全绿 |
| 薄包×8（my-quotes/loopx/preset-lint/skill-subset/overseas-tools/rename-conversations/file-upload/wanzh） | 0 | inject/ctx 全合规（案例#2 主角已修复在位） | 形态免 |

### 1.3 四大横切模式（本方案的主对象）
| 模式 | 证据 | 本质 |
|---|---|---|
| ① 源/产物管线断裂 | 灵枢 P0（同 inode 假同步）· team-gui lib 落后 src · browser 测试瘫 · deepresearch 无构建脚本 | 「改了即生效」直觉在 4 包上失效 |
| ② 与宿主升级赛跑 | brand 哈希类 · team-gui 文案导航 · theme :root · 补丁#4 | 2.0.5 升级日集中爆发 |
| ③ CWD 锚定同构缺陷 | deepresearch runnerCwd · 灵枢 dbPath（均取加载期 CWD=/） | 缺统一约定 |
| ④ 静默假健康 | browser 心跳单向 · addEvidence 吞错 · 补丁双 no-op 报 [patched] | 降级路径无观测面 |

### 1.4 事实更正
- diagnose.sh「dsh-im node_modules=无」为 scoped 包名 grep 误报（三件套实齐全）
- dsh-memory-local=灵枢（@furongjun1999/dsh-memory）；noema 为独立 npm 包（@zseven-w/dsh-noema），apply-patches 两条 noema 补丁与灵枢无关

## 2. 决策记录（D1–D10，均选推荐项）
| # | 议题 | 决议 |
|---|---|---|
| D1 | 修复路线 | **按横切模式分组治理**（非逐包） |
| D2 | 灵枢 P0 路径 | **先补构建链再同步**（tsconfig+scripts→重建→验证→硬链接复核） |
| D3 | 升级赛跑组时机 | **并入 2.0.5 升级窗口**（本文 §5 另立方案；本次仅 README 约束补全+治理铺垫） |
| D4 | browser 3×P1 | **全修**（顺序：测试基线→心跳失活→白名单^https?:// 仅 http(s)） |
| D5 | 抽屉淹没 | **默认折叠「其他能力」组**（计数徽标+点击展开；8 业务域照常全展开） |
| D6 | 补丁层 | **分类退役**：#4 theme no-op 删；memory/deepresearch 两补丁待 D2 后退役；team-gui 幂等判定补 src 原生形态；其余维持 |
| D7 | CWD 锚定 | **一并修**（哨兵默认+apply 期解析；deepresearch 加测试） |
| D8 | 观测面+P2 | **全进**（browser 断连事件 / addEvidence 告警+warning / fetchRecipe 代次守卫 / note 入词典 / void update catch / diagnose.sh 误报 / fork P2 批） |
| D9 | 休眠资产 | **归档目录集中+gitignore**（不删；清单先经用户确认） |
| D10 | 排程 | **五段执行**（§3） |

## 3. 执行方案（五段）

### 段① 灵枢 P0 链（先决：可构建性）
1. dsh-memory-local：补 tsconfig.json / 修复 package.json scripts（build/typecheck）与 files（去 .orig）；src 落 P1 修复：dbPath 默认 `~/.dsh/data/lingshu.db`（哨兵+apply 期解析，D7）、mutual.ts ensureHarness 用 config.python
2. `pnpm build` 重建 lib → 断言 delegationDepth 守卫与 dbPath 默认入 lib 产物
3. profile 硬链接同步复核（cat 新内容覆盖或重装）+ `ls -i`/`cmp` 验证 + 重启验证 lingshu_service_info
4. 验收：lib 与 src 零漂移（mtime+内容双查）；apply-patches memory 两补丁变为可退役状态

### 段② browser 测试基线 → 运行时双 P1
1. 恢复 tests（invariant.ts 或删 setup-invariant+files 项）→ `pnpm test` 全套可跑绿
2. server.ts 心跳：记 last-pong，N=3 次未回应 terminate→replaceConnection 清挂起；新增失活检测测试
3. tools.ts browser_navigate host 侧 `^https?://` 白名单（纵深防御）+ 协议校验测试；purge 改 fail-closed；/ext/bridge-config 限 loopback
4. 验收：新增回归测试全绿；断连恢复场景人工验证一次

### 段③ fork UX + deepresearch 双 P1
1. dsh-skill-center-local：其他组默认折叠（渲染态+durable 状态）；删 telemetry 死文件/entry.badge 死键；health 字段 plugin:"skill-explorer"→"skill-center-local"（保持路由族不变）；73+新增折叠测试；重建+profile 同步+重启
2. deepresearch：runnerCwd 哨兵默认+apply 期解析（D7）；addEvidence 限流时告警+criteria.warning 而非静默；补 build/test 脚本；void update 补 catch
3. 验收：折叠交互测试绿；deepresearch 新增默认值测试绿

### 段④ 假健康观测 + P2 杂项批
1. team-gui：fetchRecipe 补代次守卫；role 模板 note 入 i18n；apply-patches 第 3 段幂等判定补 src 原生形态（消 [patched] 误报）；lib 重建（消灭落后 src）
2. diagnose.sh：scoped 包名 grep 修正（@xmanrui/dsh-im 类）
3. apply-patches：删 theme #4；memory roleplay/deepresearch fetchProvider 若段①② 已重建产物则退役对应补丁
4. 验收：apply-patches 全程无 [patched] 误报；重装演练一次

### 段⑤ 升级赛跑组 → 并入 2.0.5 窗口（另立方案执行）
- 见 docs/upgrade-2.0.5-window-plan.md（本报告 §5）

### 休眠资产归档（D9）
- 清单（拟）：dsh-bridge-protocol-local、dsh-browser-extension-local(89M)、dsh-chatui-fix-backup(1.4M)、dsh-noema-local、dsh-loopx-plugin.tgz、dsh-memory-local-patch.shn#、archify-local、deepseek-harness-studio-presets、dsh-overseas-tools/lib/index.js.orig-*、dsh-rename-conversations/package.json.bak-*
- 动作：建 `_attic/`（或用户命名）→ 归档 + gitignore 登记 → 清单先经用户确认再移动

## 4. 风险与红线
- 本方案全部改动前先建测试（段②③ 均含回归）；任何包改动后必须重建 lib+profile 同步+restart 三验
- 不碰红线：main.js / Info.plist / 原生二进制 / 官方 asar
- 升级窗口段绝不提前吸收进段①–④（D3 决议）
- 白名单仅 http(s)：如后续需 file:// 预览，按 D4 备注白名单扩展（localhost 保留）

## 5. 升级窗口（2.0.5）关联清单（预告，段⑤另立文档执行）
- brand：_37cUPa/_q2FAPq 哈希锚点重探测/迁移 + README 补 q2FAPq 记录
- theme：:root 注入面在 data-dsh-skin 出现后的迁移路径（overrideTokens 契约扩面观察）
- team-gui：文案驱动导航→申请宿主官方 API/slot 属性；styles .atg-* → [data-plugin] 作用域
- 补丁层：verify-patches 漂移探测纳入重锚 SOP（07-patches-manifest-v2）
- CWD：若 2.0.5 变更加载期 cwd 语义，重验段①③ 修复

## 6. 明确不做（本轮）
- 不迁移 theme overrideTokens / 不作用域化 brand 哈希类（并入段⑤）
- 不删除任何休眠资产（只归档）
- 不动 skills 数据链（81-Skills/import 为独立已验收域）
- 不改 4 条 bundle 稳定语义（路由族 /dsh/*、loopback 围栏、.trash 模型）

## 7. 重启验收记录（2026-09-10 15:0x · 段①–④ 终态）
启动终态 healthy（renderer-startup → health-commit 全完成）：
- **灵枢（dsh-memory-local）**：`db_path` 锚定 `profiles/desktop/data/lingshu.db`（252 天数据连续性保持）；索引 integrity_ok（10 节点 / 0 孤儿边 / 77 工具 / 召回链可用）；AEIS venv 解释器活进程（python 硬编码修复达阵）。
- **fork（dsh-skill-center-local）**：health 实报 `"plugin":"skill-center-local"，skills:265`（D5 落地）；list 路由 200。
- **browser（dsh-bridge-browser）**：`/ext/bridge-config` loopback 放行正常；43120 监听面 127.0.0.1-only（第一层围栏；路由 handler 围栏覆盖 0.0.0.0 部署形态）。
- **错误签名**：本 profile 无回归项；`.dsh-rc-eval`（独立 RC 评测档）的 overseas-skills templates.js 缺失与此无关。
- **域外事件（非回归，留痕不动）**：重启期间外部操作将 dsh-agent-team-gui 移出 desktop profile deps（备份 `.bak-c-remove-agentteam-20260910-150024`）；fetchRecipe 代次守卫等修复仍留在包源与构建产物内，重装即恢复。
- **apply-patches**：8/8 `[ok]` 零误报（[patched] 误报消除）；diagnose.sh 三路证据全 `有`（dsh-im scoped 修正生效）。
- 待办转出：fork 折叠 UI 与 browser 断连恢复为用户侧视觉验项（外源 headless 被认证围栏拦截属设计行为）。
- **D9 已执行（2026-09-10 用户确认）**：`_attic/` 建立并归档 10 项（93M：bridge-protocol-local、browser-extension-local、chatui-fix-backup、noema-local、loopx tgz、patch 残片、archify-local、studio-presets、overseas-tools .orig、rename-conversations .bak），含恢复说明 `_attic/README.md` + `.gitignore` 登记；活跃包本体 `dsh-overseas-tools`/`dsh-rename-conversations`/`dsh-loopx-plugin` 未动（profile `file:` 依赖保持）。
