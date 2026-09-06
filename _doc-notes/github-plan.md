# LUTE Agentic System · GitHub 管理方案（盘点 + 分析 + 决策稿 v1）

> 目标：当前目录（Magpie-Horch）的 DSH 二次开发项目 → 发布到新仓库 https://github.com/zjgulai/lute-dsh-platform，含 README、ADR、PR、DMG 与版本管理。状态：讨论稿，未执行 git 操作。

## 1. 盘点结果（现状事实）

| 类别 | 内容 | 判断 |
| --- | --- | --- |
| 核心插件源码（二开成果） | dsh-overseas-skills（出海技能页+模板引擎）、dsh-overseas-tools、dsh-wanzh-hulian（万物互联 P0-P4）、dsh-skill-subset、dsh-patches（宿主补丁集，**唯一有 .git 的目录**） | ✅ 必入库 |
| 支撑插件（profile 依赖） | dsh-loopx-plugin、dsh-memory-local、dsh-noema-local、dsh-auto-compact-local、dsh-deepresearch-local、dsh-agent-team-gui-local、dsh-bridge-protocol-local、dsh-browser-*-local、dsh-file-upload-local、dsh-preset-lint-local、dsh-rename-conversations、dsh-renderer-heal、dsh-reverse-skill-local、dsh-root-brand-local、dsh-skill-title-fix、dsh-theme-local、archify-local、explore-unknowns-local、write-spec-local、deepseek-harness-studio-presets 等 ~25 个 | 视决策（全入 / 精选） |
| 技能源 | 81-Skills（85 个目录，**用户私有技能集**） | ⚠️ 需单独决策（私有内容） |
| 打包工程 | packaging/（assemble.sh、sign-and-dmg.sh、installer、release、PLAN、CHANGELOG）——**DMG 打包流水线已存在** | ✅ 必入库（DMG 发布基础） |
| 文档站/笔记 | doc/（HTML 文档站）、_doc-notes/ | 建议入库（文档资产） |
| 一次性脚本/预览/临时 | 25+ 个 patch-*.js、build-*-avatars.js、*-preview.html、recovery.html、*.shn#、Agent、lark-auth-qr.png 等 | ❌ 默认不入库（保留本地或归档） |
| 生成物/产物 | generated/、dist/、uploads/、assets/ | ❌ .gitignore（generated 是插件构建输出） |
| 敏感文件 | 项目内未发现 .env/credentials（anysearch .env 在 ~/.dsh/skills 不在项目） | ✅ 仍需 .gitignore 兜底 + 推送前 secret 扫描 |
| 旧远程 | 仅 dsh-patches 有 .git 且**无远程**（旧 push 链接已不存在，无需删除） | 说明即可 |

## 2. 深度洞察（三个结构性问题）

1. **这是「工作台」不是「仓库」**：源码、一次性补丁脚本、预览 HTML、构建产物混居。直接全量 push = 把 60 个顶层条目原样公开，既污染仓库又暴露临时决策痕迹。
2. **无版本历史**：核心插件都无 .git，无法重建历史 → 新仓库只能是 **initial commit + 从 v0.1.0 起** 的基线发布（dsh-patches 的旧历史并入时剥离）。
3. **DMG 发布已有工程**：packaging/ 自带 assemble/sign-and-dmg/CHANGELOG——方案只需把它对齐到 GitHub Releases 流程（二进制不进 git，进 Releases + sha256 清单），而不是重新发明。

## 3. 方案（monorepo · 供决策）

```
lute-dsh-platform/
├── README.md                  # 平台总览/安装/架构/快速开始
├── LICENSE · .gitignore · CHANGELOG.md
├── docs/
│   ├── adr/                   # ADR 索引 + 模板 + 编号规则（overseas 已有 ADR-0001~0008 迁入重编号）
│   ├── architecture.md        # DSH 基座契约与红线
│   └── release-process.md     # 版本/发布/DMG 流程 SOP
├── plugins/                   # 核心 + 支撑插件源码（按决策范围）
│   ├── dsh-overseas-skills/ · dsh-overseas-tools/ · dsh-wanzh-hulian/
│   ├── dsh-skill-subset/ · dsh-patches/ · …
├── skills-src/                # 81-Skills（若决策入库）
├── packaging/                 # DMG 构建脚本与清单
└── release/                   # 版本 manifest + DMG sha256（二进制走 GitHub Releases 附件）
```

**版本与发布流程（拟）**：
- 单平台版本 vX.Y.Z（package.json 各插件同版本对齐）+ git tag `v0.1.0` 起；CHANGELOG 汇总各插件变更（overseas 与 wanzh 的 delivery 文档继续各自维护）。
- DMG：`packaging/sign-and-dmg.sh` 产出 → GitHub Releases 上传 + `release/<version>.sha256` 清单；release/ 目录只存 manifest 与哈希，**不存二进制**。
- ADR：docs/adr/README.md 索引 + ADR-NNNN 模板（背景/决策/后果）；新决策必须走 ADR，PR 引用。
- PR：main 分支保护（不可直推）+ PULL_REQUEST_TEMPLATE + Conventional Commits + 提交前 secret 扫描（git-secrets 或手写 grep 检查 .env/token/credentials）。
- .gitignore：node_modules、dist、generated、uploads、assets、*.tgz、.env*、credentials*、.DS_Store、*.shn#、临时脚本与预览 HTML（默认排除清单）。

## 4. 待决策问题

1. **仓库范围**：A 全平台 monorepo（核心+全部支撑插件+packaging+doc，推荐）/ B 仅核心 5 个+packaging，其余不进？
2. **81-Skills**：A 不进公开仓库（私有技能，推荐）/ B 作为独立子目录入库 / C 单独私有仓库+submodule？
3. **一次性脚本与预览 HTML**：A 排除（默认 .gitignore，本地保留，推荐）/ B 归档到 _legacy/ 入库？
4. **版本起点**：A v0.1.0 initial（推荐，无历史可重建）/ B 直接 v1.0.0？
5. **DMG 发布方式**：A GitHub Releases 附件 + release/ 哈希清单（推荐）/ B 直接 git 存 DMG（不建议，仓库膨胀）？
6. **执行时机**：决策后我执行 git init → .gitignore → 首次提交 → 连接新远程 → push → 建 main 保护与模板文件？
