# LUTE 2.0.0 迭代复盘 · 最终优化方案

> 2026-09-10 定稿 · 基于全链路复查（B 工程债务 9 项 / C 脆弱点 8 项 / D 文档债务 7 项 / E 待办 7 项）
> 决策：5 项已拍板（三批提交、pkg adhoc 签名、月度观察窗、盲区实验优先、gitignore+文档化）

## 1. 立即执行（本周）

| # | 项 | 内容 |
|---|---|---|
| 1.1 | PR-A 流水线脚本 | assemble.sh / brand-replay.sh / smoke-test.sh / rewrite-file-deps.mjs / install.sh / INSTALL-CARD.md / packaging CHANGELOG / verify-patches-v2.sh / patches-manifest-v2.md |
| 1.2 | PR-B 文档 | ADR-0005 + docs/research/01-07 + docs/adr 索引（用户自有 81-Skills/dsh-skill-center 改动由用户单独提交） |
| 1.3 | pkg adhoc 签名 | build-pkg.sh 加 productsign --sign - 步骤 → 重建 pkg → 更新 PKG-SHA256SUMS |
| 1.4 | staging 治理 | .gitignore 加 `staging-src/`；构建链写入 docs/research/06 增补（DMG→staging-src→assemble→smoke 全链） |
| 1.5 | 构建竞态根治 | sign-and-dmg.sh / build-pkg.sh 顶部加 release 目录锁（mkdir .lock 抢占式），失败提示串行执行 |

## 2. 盲区实验（发布前，按序）

| # | 实验 | 方法 | 通过标准 |
|---|---|---|---|
| 2.1 | P0-7v2 兜底触发 | 隔离环境：装 app + 删空 profile → 首启 | ✅ **已执行并揪出真 bug**：原锚点（main.js createFreshDesktopProfile）在首启不触发（该包装仅服务恢复/创建 UI 流），真实路径是 profile-manager 的 materializeDefaultDesktopProfile——已重锚双锚点并提交 PR-A。机制级验证通过：内嵌完整拷贝（node_modules/vendor/overrides 落位）+ __DSH_HOME__ 占位替换 0 残留。⚠️ 残余：隔离测试环境（多实例同 product identity + 测试补丁破坏签名）下完整 health-commit 未复现（对照组同样 stall，与补丁无关）→ 留干净机器状态复测 |
| 2.2 | 灵枢产物冒烟 | 2.0.0 payload 的 aeis-portable 解包 → 实际 import aeis + 起 MCP server | import 成功、server 可启动 |
| 2.3 | 降级兼容 | rc-eval 写会话 → 与生产 alpha.1 会话逐字段对比格式 | zstd 容器/事件结构兼容，写回不破坏 2.0.4 读取 |
| 2.4 | spill/白屏后验 | rc-eval 长会话触发 spill；#865/867 复现 | 有结果即入矩阵 |

## 3. 发布链（实验全绿后）

GitHub Release v2.0.0（dmg+pkg+校验清单+CHANGELOG）→ 灰度名单（1-2 老客户一周）→ 观察指标（启动成功率/白屏报障/插件缺失报障/回滚请求）→ 全量。

## 4. 文档回填清单

根 README 版本与基线 → PLAN.md 基线 2.0.5 → 04-upgrade-plan WBS 状态回填 → 05 矩阵 ⏳ 清理（目视闭环项转 ✅）→ 07 转正（更名 07-patches-manifest-v2.md 或并入登记簿）→ v1 manifest 加 v2 指针 → 灰度发布 SOP（新增 docs/release-gray-sop.md）→ 构建链文档。

## 5. 上游跟进策略（ADR-0006）

- 节奏：月度观察窗——2.0.6 发布后观察 2 周；只回移修复/特性（D 轨道增量验证），大版本升级由客户需求驱动
- 触发跟进的红线：安全修复（本地对应补丁已有则记录对比）、恢复/白屏类高危 issue 修复、rc 生态插件大面积放弃当前运行时
- 每次跟进复用：rc-eval 环境 + patches-manifest-v2 重锚 SOP + verify-patches-v2 漂移探测

## 6. 接受的工程债务（记录不还）

| # | 项 | 理由 |
|---|---|---|
| B5 | assemble P0-8 内联块保留 | DSH_APP 可指向未直补 app（未来 2.0.6 官方 DMG）时的兜底；已幂等化 |
| B6 | verify v1/v2 双路径 | 回退无害，删除收益低 |
| B8 | rc-eval 手工构建 | 环境即弃即建；手册已覆盖（重建脚本按需再做） |

## 6.5 执行进度（2026-09-10 复盘轮）

- ✅ 1.1 PR-A（#2）+ 1.2 PR-B（#3）已开；P0-7v2 重锚修复已提交
- ✅ 1.3 pkg 签名 → 发现 Apple 硬约束（productsign 不支持 adhoc）→ 决策改为校验清单承担（INSTALL-CARD 已强化）
- ✅ 1.4 .gitignore staging-src + 1.5 竞态锁
- ✅ 2.1 兜底触发实验：揪出原锚点静默失效 → 重锚修复 + 机制级验证通过；⚠️ 遗留「全新 userData 首启 composition stall」已交子代理排查（发货级阻塞，修复前不得灰度）
- ✅ 2.2 灵枢产物冒烟（import 0.5.0 + MCP server 启动 OK）
- ✅ 2.3 降级兼容（SESSION_FORMAT_VERSION=0 未变；seeded 会话为唯一风险面）
- ✅ 4 文档回填：根 README/PLAN/05 矩阵/灰度 SOP（docs/release-gray-sop.md）/ADR-0006
- ✅ stall 根因修复（P0-7v2c：首启清除点删除预写 wizard 状态→向导重弹卡死；已修+全链重验：兜底首启 healthy、smoke 37/37、release 第三次重建）
- ⏳ 2.4 spill 后验、发布链（Release 上传+灰度名单）、07 转正

## 7. 执行顺序总览

```
1.1 PR-A → 1.2 PR-B → 1.3 pkg 签名 → 1.4/1.5 治理+竞态
   → 2.1 兜底实验 → 2.2 灵枢冒烟 → 2.3 降级对比 → 2.4 后验
   → 3 发布链（灰度名单待用户）
   → 4 文档回填 → 5 ADR-0006
```
