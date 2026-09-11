# dsh-role-matrix-local

**岗位矩阵**：把 50 个 AI 岗位分身 preset 渲染成**两层分类的卡片矩阵**（组织平面 → 责任域），
带搜索与卡片详情展开。侧边栏入口 + 抽屉面板，**只读**。

## 为什么需要这个插件

官方两处 UI 都表达不了这套分类：

| 官方界面 | 实际形态 | 为什么不够 |
| --- | --- | --- |
| 新会话选择器（`conversation.hero.agentPreset`） | chip + 扁平下拉菜单，每项只渲染 `itemName`/`itemDesc` | 无分组、无搜索；50 个岗位落进来就是 54 项无搜索扁平菜单 |
| 设置 → 预设管理页（`AgentPresetSection`） | 已是**卡片矩阵**（`grid auto-fill minmax(268px,1fr)`） | 但分组键**硬编码为 `row.trust` 二分**（内置/自定义），本机 preset 无法影响它；且卡片不渲染图标 |

官方 `@deepseek-ai/dsh-agent-presets` 的 `compositionInventory()` 自述为
"for plugin-listing surfaces **beside the roster's own picker**" —— 本插件就是那个 surface。
它只读预设目录（因为分类信息在各自的 LUTE `manifest.json` 里，官方 roster 不投影该字段）。

## 只读是刻意的

预设的**创作、删除、设默认**都由官方 roster 拥有（`agentPresets/copy` / `deletePreset` /
settings 支撑的默认项）。本插件**不复制这些写操作**：两个 owner 争"哪个是默认预设"，
roster 迟早会开始说谎。本插件补的正是官方 picker 不渲染的那一件事——两层分类。

## 数据来源

```
~/.dsh/.agent-presets/agt-NNN/
├── preset.yml      ← 官方显示元数据（只有 name/description/order 三个字段）
└── manifest.json   ← LUTE 自有旁车：分类、编队契约、技能清单、材料溯源
```

`preset.yml` 严格只读官方三字段——`icon` 不在 `PresetMetadata` 里（原注释："carries display
text ONLY"），官方 UI 对它零消费，写进去是死数据。

**降级路径**：缺 `manifest.json` 的预设**不丢行**，而是归入「未分类」并标红——预设坏掉时
正是用户要去面板里找它的时候，藏起来最糟。

## 结构

| 文件 | 作用 |
| --- | --- |
| `src/index.ts` | 宿主插件：注入 `webServer`，注册路由，`mountOnce` 防重复注册 |
| `src/collect.ts` | 扫描预设根，读 `preset.yml` + `manifest.json`，按平面→责任域分组 |
| `src/routes.ts` | `/api/dsh-role-matrix/list` 与 `/health`（只读） |
| `src/http.ts` `loopback.ts` `pair-access.ts` `mount-once.ts` | 共享层生成副本（与 skill-center 同源） |
| `src/client/index.ts` | 浏览器入口：注册文案 + 挂载侧边栏入口与面板 |
| `src/client/RoleMatrixPanel.tsx` | 面板：平面分区 → 责任域子区 → 卡片，搜索 + 详情展开 |
| `src/client/sidebar-entry.ts` | 侧边栏入口行（DOM 注入，绕过无对外 Slot 的 shell） |
| `src/client/role-matrix.module.css` | 唯一 CSS Surface；颜色只走语义 Token（明暗主题自动适配） |

## 构建与验证

```sh
npm run typecheck
npm run test
npm run build
```

### 实测（2026-09-11）

```
typecheck  OK（含变异探针：故意加类型错误 → 被捕获；还原 → 干净）
test       27/27 通过（collect 8 / routes 8 / contract 11）
build      lib/index.js 18.2 kB · lib/client.js 40.1 kB
```

`tests/contract.spec.ts` 专门盯三种**运行时静默失败**：

1. **两半路由字面量不一致** —— 客户端硬编码 fetch 路径，宿主改名后浏览器只得到 404，两边都不红。
   断言方式：客户端字面量必须属于宿主 `ROUTES` 表（不是表的副本）。
2. **bundle require 不在冻结模块表里** —— 运行时必 `require is not a function`。
   断言方式：`lib/client.js` 的真实 `require(...)` 集合必须 ⊆ `PLATFORM_MODULES`。
3. **缺防白屏声明** —— 进 `dsh.profile.bundles` 的包若缺 `dsh.bundle` 或 patch 里没有 `insert`，
   桌面进恢复窗口。三条一起断言。

## 装到 profile

```sh
# 1) 防白屏硬校验（失败即禁止继续）
node -e "const p=require('./package.json'); if(!p.dsh||!p.dsh.bundle) throw new Error('missing dsh.bundle')" && echo OK
test -f cordis.patch.yml && grep -q 'insert' cordis.patch.yml && echo PATCH-OK

# 2) profile 声明（dependencies file: + dsh.profile.bundles 两条目）+ 重启
```

重启后 / 刷新页面，侧边栏出现「岗位矩阵」入口。
