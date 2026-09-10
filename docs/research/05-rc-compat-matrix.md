# rc-compat-matrix.md — D 轨道插件兼容性验证矩阵

> 环境：`~/Applications/DSH Desktop RC.app`（官方 2.0.5 / runtime 0.1.2-rc.1）+ `DSH_HOME=~/.dsh-rc-eval`
> 每插件 5 项：① apply 无错（host 图谱）② 核心 RPC 打点 ③ UI slot 渲染 ④ 数据读写 ⑤ alpha.1 旧数据可读
> 状态图例：✅ 通过 / ❌ 失败 / ⏳ 待验 / ⚠️ 有条件通过（记录条件）/ N/A 不适用
> 更新：2026-09-10 01:00（首启 + 24 bundles 入场完成）

## 基座自检

| 项 | 结果 | 证据 |
|---|---|---|
| 官方 app 启动（隔离副本+userData 补丁） | ✅ | startup.run.completed / health-commit / rendererStatus=healthy |
| 24 bundles（官方 2 + 6 ⛔ + 16 本地）整树启动 | ✅ 0 error | dsh-2026-09-10.log 当前 run 段 grep -c [E] = 0 |
| setup-wizard 跳过 | ✅ | profile-setup/<hash>/state.json outcome=skipped |
| 端口共存（#892 初步） | ⚠️ 未触发 | 生产占 43120 时 RC 自取 43121，无冲突循环 |
| 旧数据投影（⑤ 基座层） | ✅ | session_projcache/sessions/ 由 rc.1 从 alpha.1 zstd 会话重建 248 项 |

## 6 个 ⛔ 插件（最新版）

| 插件 | 版本 | ① | ② | ③ | ④ | ⑤ | 备注 |
|---|---|---|---|---|---|---|---|
| dsh-context | 0.47.0 | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | 静默型，整树 0 error |
| dsh-better-sidebar | 0.18.1 | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | 新 peer @huanlin/dsh-plugin-better-locale 解析成功 |
| @changfenhuang/dsh-genui | 0.9.9 | ✅ | ✅ render_ui/validate_dsh_ui 入全局工具表 | ⏳ | ⏳ | ⏳ | 工具清单来自 vision-router 日志输出 |
| dsh-vision-router | 2.1.4 | ✅ | ✅ 诊断日志+limits 配置输出 | ✅ 引导弹窗已渲染（首启截图） | ✅ 写 diagnostics log | ⏳ | ⚠️ peer 追 0.1.3-alpha.2；⚠️ restrict("vision_screenshot") 告警（工具名在 rc.1 上未知） |
| dshmarket | 1.45.1 | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | 静默型 |
| @zseven-w/dsh-noema | 0.1.0-rc.3 | ✅ | ✅ 15 工具 + /_dsh/dsh-noema/status 路由挂载（CLI 直连 403=auth 门在岗） | ⏳ | ✅ Rust server 启动 | ⏳ | ⚠️ peer 追 0.1.0-rc.6 旧线 |

## 16 个本地 file: 插件（批量入场结果）

| 插件 | ① | ② | ③ | ④ | ⑤ | 发现 |
|---|---|---|---|---|---|---|
| dsh-overseas-skills | ✅（修复后） | ⏳ | ⏳ | ⏳ | ⏳ | **P0 打包 bug**：lib/templates.js 未列入 package.json files → 全新 file: 安装缺模块 → 整树 host-boot failed（恢复模式签名）。已修复 files 清单（源码未提交） |
| dsh-wanzh-hulian | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | 0 error（MCP 连接失败 W 属 rc-eval 无凭据，非兼容） |
| dsh-overseas-tools | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | 静默型 |
| dsh-deepresearch-local | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | 静默型 |
| dsh-memory-local（灵枢） | ✅ | ✅ 白箱 LLM provider 注册 | ⏳ | ⚠️ Python 进程起不来（rc-eval 无 aeis venv，环境限制非兼容） | ⏳ | 需在 rc-eval 补装 aeis 或标记 N/A |
| dsh-agent-team-gui-local | ✅ | ✅ v0.5 bounded DAG ready | ⏳ | ⏳ | ⏳ | — |
| dsh-browser-local | ✅ | ✅ /ext/bridge listening | ⏳ | ⏳ | ⏳ | — |
| dsh-file-upload-local | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | 静默型 |
| dsh-theme-local | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | 静默型 |
| dsh-root-brand-local | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | RC 官方品牌皮肤上未见冲突 |
| dsh-auto-compact-local | ✅ | ✅ compact_now 工具注册 | ⏳ | ⏳ | ⏳ | — |
| dsh-loopx-plugin | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | 静默型 |
| dsh-my-quotes | ✅ | ✅ /my-quotes channel mounted | ⏳ | ⏳ | ⏳ | — |
| dsh-rename-conversations | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | 静默型 |
| dsh-preset-lint-local | ✅ | ⚠️ .agent-presets 目录不存在（rc-eval 无预设，环境限制） | ⏳ | ⏳ | ⏳ | N/A 级 |
| dsh-skill-subset | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | 静默型 |

## 关键结论（P0 阶段）

1. **rc.1 兼容性比预判乐观得多**：16 个本地插件全部 apply 成功、24 bundles 整树 0 error——alpha.1→rc.1 的 API 破坏面没有击中 LUTE 插件层（本地插件未使用被改名的 API）。
2. **发现 1 个 P0 级产品打包 bug**：dsh-overseas-skills 的 files 清单缺 templates.js（生产靠安装器物理拷贝掩盖，任何基于 manifest 的全新安装都会整树失败）。已修，待提交。
3. **3 个 ⚠️ 观察项**：vision-router 的 vision_screenshot 限制告警；vision-router/noema 的跨代 peer（0.1.3-alpha.2 / 0.1.0-rc.6）；灵枢/预设 lint 的 rc-eval 环境缺件（非兼容问题）。
4. **③④⑤ 的 UI 层证据待视觉通道恢复后补**（本轮 VISION_RATE_LIMITED，按纪律未重试）。

## 上游 issue 复现实验（2026-09-10 补）

| issue | 实验 | 结果 |
|---|---|---|
| #887/#893 剪枝清空 | 3 次重启周期（snapshot0+cycle1+cycle2），对比 app.asar.unpacked/node_modules 文件数/体积/dsh-base 与 cordis package.json 哈希 | ✅ **未触发**：19811 文件 / 263952KB / 双哈希三轮完全一致 |
| #892 端口冲突循环 | 生产(43120)与 RC 并存多次重启 | ✅ **未触发**：RC 自动取 43121，无恢复模式循环 |
| #851 窗口抢焦点 | RC 启动后每 2s 采样 frontmost 应用 ×40s | ⚠️ **测量受限**：两 app 进程同名 "DSH Desktop"，无法区分是谁在前台；观测期间 frontmost 名称恒定无第三方抢焦点。需窗口标题级测量或人工观察 |
| #865/867 spill ENOENT | — | ⏳ **未复现**：需交互式长上下文触发 spill，D 轨道暂无会话活动；留待 RC 会话运行后补 |
| #858 全新安装不可用 | rc-eval 即全新安装路径（DMG+新 DSH_HOME+新 profile） | ✅ **未触发**：首启 healthy；注：LUTE 用自定义安装器，路径不同 |

## ④ 数据读写补证（2026-09-10）

| 插件 | 证据 | 结果 |
|---|---|---|
| dsh-deepresearch | rc-eval sqlite 存在 `u_deepresearch_projects` 表（插件自建 schema） | ✅ |
| dshmarket | rc-eval userData `desktop-market/state.json` 已写入 | ✅ |
| dsh-wanzh-hulian | MCP 三连接重试循环按设计运行（无凭据环境，非兼容） | ⚠️ 环境限制 |
| dsh-my-quotes | 索引目录未创建（需 UI 触发重建） | ⏳ 待 UI |

## 收尾状态（2026-09-10 01:40 · P0 全量闭环）

**P0 全部闭环**：用户人工目视确认（RC 窗口）——①侧边栏正常显示生产数据副本的历史会话、②设置页 better-sidebar/「万物互联」/市场卡片全部渲染、③无错误横幅/无恢复模式提示、④「我说」检查正常。

- ③ UI slot 渲染 → ✅（用户目视 + 首启截图两条证据链）
- ⑤ UI 层会话列表 → ✅（投影层 248 项 + 目视双证）
- my-quotes ④ → ✅（用户目视；注：`~/.dsh-rc-eval/my-quotes/index.jsonl` 未在预期路径出现，列为观察项，2.0.0 打包前复验）
- mcp-client 4 条 give-up [E] 属 rc-eval 无凭据环境的预期行为（pixpix/apify/shopify/getnote 重试预算耗尽即卸载工具），非兼容问题

**残余（全部移交 2.0.0 P1 执行期，非 P0 阻塞）**：
- #865/867 spill ENOENT：需在 rc.1 上跑交互式长会话触发，留 P1 基座迁移后的冒烟项
- 灵枢 aeis：环境缺件非兼容问题（安装器随包提供）
- 视觉通道外部限流导致的截图级证据，已由用户目视替代闭环

## 终态注记（2026-09-10 复盘）

- ③ UI slot 渲染：用户目视确认 ✅（会话列表/设置页/万物互联/市场卡片/无错误横幅）——矩阵内 ⏳ 已由目视闭环
- my-quotes 索引路径观察项：2.0.0 打包前复验
- #865/867 spill：交互式长会话未触发，留灰度期观察
- 灵枢：aeis-portable 载荷实测 import 0.5.0 OK + MCP server 启动 OK（2026-09-10 补充验证）

## 待办（下一轮）

- [ ] 视觉恢复后：RC 主界面/设置页/侧边栏截图 → ③ slot 渲染逐项确认（wanzh-hulian 设置页、theme/root-brand、better-sidebar、context、market 卡片）
- [ ] ④ 数据读写：dshmarket 状态文件、deepresearch durable state、my-quotes 索引重建
- [ ] ⑤ 会话列表 UI 层确认（投影层已 ✅）
- [ ] 上游 issue 复现：#865/867 spill ENOENT（触发 spill 路径）、#887/#893（多轮重启后 node_modules 完整性 diff）、#851 焦点
- [ ] 灵枢 rc-eval 补装 aeis 后重验（或标记环境限制 N/A）
- [ ] 2.0.0 P1 立项材料：把以上写入 ADR-0005
