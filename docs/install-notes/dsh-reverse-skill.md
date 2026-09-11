# dsh-reverse-skill · 本地安装说明（@dhicoc/dsh-reverse-skill 1.0.5，npm bundle）

> 本文件是本机安装说明。上游：https://github.com/dhicoc/dsh-reverse-skill（MIT，97★，2026-08-26 活跃；内容源自 zhaoxuya520/reverse-skill 27k★ 原样封装）。上游 README/SKILL.md 保留不动。

## 一、使用方法

- **触发**：安全研究类需求自动路由——`reverse-skill-router` 总管分发，87 个技能按需启用：
  - **逆向工程**：ghidra-reverse / ida-reverse / radare2 / js-reverse / dsl-vm-reverse / go-rust-reverse / dotnet-reverse / mobile-reverse / apk-reverse / macos-reverse / firmware-pentest / browser-extension-reverse / protocol-reverse / patch-diff-exploit / binary-diff…
  - **渗透测试**：src-hunter（SRC/众测 5 阶段方法论 + 19 类 playbook）、pentest-tools、pwn-chain、attack-chain、windows-ad、cloud-k8s、api-security、thick-client、wifi-wireless、radio-sdr、hardware-security…
  - **防御与情报**：code-audit（SAST）、malware-analysis、threat-intelligence、threat-hunting、digital-forensics、email-security、supply-chain-security、llm-security…
  - **CTF 赛道**：ctf-sandbox / ctf-sandbox-orchestrator + 42 个 competition-* 专项技能
- **授权护栏（技能自带）**：正式开工前要求 case 的 `scope.md` 存在且 `auth.status=granted`，未授权不自动开工
- **重要**：本包仅用于**授权的**逆向工程、渗透测试与安全研究，使用者须对目标拥有合法授权

## 二、相关说明

- **形态**：DSH bundle 插件（数据驱动技能提供者：递归扫描包内 `skills/`（45）+ `CTF-Sandbox-Orchestrator/`（42）共 87 个 SKILL.md，经 `ctx.skills.registerProvider` 注册，source=bundled）
- **评估全绿**：零依赖（仅 peerDeps cordis/dsh-skill，`autoInstallPeers:false` 下不落盘、从 app vendored 解析）→ 无遮蔽；host 仅 node 内置导入 → 无命名导出风险；`skills` seam 实测匹配（registerProvider + 候选 shape 键全在 vendored dsh-skill）；patch 纯 insert；无 install 钩子；自带 87 技能自检通过
- **安装**：npm 精确版 1.0.5 入 desktop profile（依赖+bundles），快照 `package.json.bak-1788176958`；重启后 package.json 持久未回滚
- **冗余**：本机此前无任何安全/逆向技能——填补能力空白，无冲突
- **更新**：`npm view @dhicoc/dsh-reverse-skill versions` 看新版 → 换精确版本号 + pnpm install + 重启
- **回滚**：移除依赖 + bundles 两条目 → pnpm install → 重启
- **许可证**：MIT

## 三、迭代优化方向

1. **真机走查**：拿一个授权靶场/自有样例跑一次 src-hunter 或 reverse-engineering 全流程，验证路由与护栏
2. **技能中心管理**：87 个技能较多，如需收缩可在「技能中心」按需启停
3. **上游追踪**：上游 reverse-skill 27k★ 更新频繁，注意同步新技能
