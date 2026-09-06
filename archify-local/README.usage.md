# archify · 本地安装说明（@tt-a1i/archify-dsh 0.1.0，npm bundle）

> 本文件是本机安装说明。上游：https://github.com/tt-a1i/archify（MIT，33k★，2026-08-30 仍活跃）。上游 README/SKILL.md 保留不动。

## 一、使用方法

- **触发**：直接说「用 archify 画一张 XX 架构图/流程图/时序图/数据流图/生命周期图」，或贴 Mermaid（flowchart/sequenceDiagram/stateDiagram）让它美化转换
- **五种图**：architecture / workflow / sequence / dataflow / lifecycle，输出**自包含 HTML**（内联 SVG、暗/亮主题、可选动效、PNG/JPEG/WebP/SVG/WebM 导出）
- **关键命令**（skill 内部工作流，由 agent 执行）：
  - `node bin/archify.mjs validate <type> <candidate.json> --quality showcase --json`（9 项检查 0 错 0 警 = 通过）
  - `node bin/archify.mjs deliver <type> <candidate.json> <output.html> --quality showcase --json`
- **注意**：命令行生成的 JSON/HTML 是普通工作区文件，不会自动出现在 Produced Files 条——让 agent 返回**确切路径**后打开

## 二、相关说明

- **形态**：Agent skill（本机注册为「archify」技能，2.14 快照）+ DSH skill-only bundle（`@tt-a1i/archify-dsh@0.1.0`，patch 插入 `archify-skill-filesystem` provider 行，指向包内 skills 目录）
- **版本观察**：bundle 官方 target `@deepseek-ai/dsh@0.1.0-rc.6`（实验兼容声明）；本机 0.1.2-alpha.1——安装前逐项实测：宿主服务 `dsh-skill-filesystem` 存在且配置面（providerName/includeDefaultRoots/bundledSkillDir）三键齐全、loader `baseUrl` 作用域可用、Node v26 满足 engines（^22.19||>=24）→ **实测通过**
- **安全性**：无遥测/网络客户端/凭据/后台服务；无 prepare/install/postinstall 脚本；patch 纯 insert 无宿主行替换
- **更新**：上游 release 政策 immutable——0.1.0 载荷钉在 `archify-dsh-v0.1.0` tag，新版本发布后换精确版本号 + pnpm install + 重启桌面端（不直接从 Git 装）
- **回滚**：从 package.json 移除 `@tt-a1i/archify-dsh`（依赖 + bundles 两条目）→ pnpm install → 重启；快照 `package.json.bak-1788094779`
- **许可证**：MIT

## 三、迭代优化方向

1. **版本追赶**：bundle 是 2.14 快照，仓库 main 已 2.16（delta/故事分镜等新功能）——上游出新 DSH 版后跟进；如需立即用 2.16 可走 skill 目录直装（~/.dsh/skills/archify，B 方案）
2. **真机全流程**：让 agent 从真实代码仓库取证画一张架构图（SKILL.md 的 repository-evidence 流程），验证「取证→JSON→deliver」端到端
3. **监控**：package.json 静默回滚前科（dsh-im 曾发生）——若 archify 技能消失，检查 package.json 条目 + 用 dsh-desktop-diagnostics 深挖
