# 升级 2.0.5 窗口执行方案（段⑤）

配套报告：`docs/panorama-code-diagnosis-report.md`（§5 预告 + D1–D10）。本文是段⑤的独立执行方案；
触发时机：官方宿主发布 2.0.5（或 profile 侧出现 base 语义变更）时整窗执行，绝不提前吸收进段①–④（D3 决议）。

## 0. 窗口总原则
- 一次性吸收官方 rc→2.0.5 的破坏面；先跑 `platform snapshot`，再逐族搬移。
- 任何包改动遵循三验：新测试先行（红）→ lib 重建（in-place，保 hardlink）→ profile 同步 + restart。
- 全程红线不动：main.js / Info.plist / 原生二进制 / 官方 asar；`/api/dsh-skill-explorer/*` 路由族保持。

## 1. 深调研（dsh-deepresearch-local）类型矩阵对齐 —— 本窗口最高优先
本段④ 期间实测的具体阻塞（2026-09-10 记录）：
- devDeps 对齐发布版 rc 线（`^0.1.5-rc.1`，带 d.ts）后，`@deepseek-ai/dsh-client-runtime` 最新发布版
  停在 `0.1.1-rc.2`，其 typert-protocol peer 仍锁 `^0.1.0-rc.8`，与 0.1.5-rc.1 栈并存产生双实例：
  `dsh-session@0.1.0-rc.8` 期望 `dsh-llm` 导出 `CallId`（0.1.5-rc.1 无此导出）→ ESM 绑定错。
- 因此 deepresearch 的 `tsc -b`（typecheck/build）当前不通；tests 只能 `vitest run`（3 套装因
  clsx 缺失 / CallId 绑定错挂起，未计入段③验收）。
2.0.5 动作：
1. 官方发布 typed `dsh-client-runtime ≥0.1.2`（或 2.0.5 基座包）后，devDeps 统一升至同线，
   消双实例；
2. 通 `tsc -b --pretty false` → 用真实产物重建 `lib/`（替换段③的镜像补丁层），跑通全部 6 套
   vitest；`tests/` 下 `view.spec.tsx`、`deepresearch.spec.ts` 复活后补登回归；
3. 退役 apply-patches 第 1 条（deepresearch http provider guard 已在 src/platform.ts 原生，
   见 ~/.dsh/profiles/desktop/apply-patches.mjs 头部台账）。

## 2. browser（dsh-browser-local）rc-legacy 套件复活
- `tests/rc-legacy/composition.spec.ts` + `bridge-extension.e2e.spec.ts` 按 alpha.1 组合形态重写：
  apiproxy 工厂改 `../src/apiproxy-shim.ts`（makeApiProxy over TypertGatewayService），
  e2e 的 `--load-extension` + playwright-core 链路按当前宿主 Loader API 重锚；
- 重写通过后迁回 `tests/`，rc-legacy 目录删除。

## 3. 构建链清理（模式① 收尾）
- team-gui：`scripts/quality/clean-build.mjs` 属"原子替换式重建"，破坏 pnpm file: hardlink
  （case#8 复发，段④已手工 relink）；2.0.5 窗口改为 in-place 写入型构建（或构建后自动
  `ln -f` 重锚脚本），并把"重建后 relink 检查"并入 `pnpm preflight`。
- deepresearch：tsconfig 参考系（references→published 包）随 §1 一并落地；tsconfig.base
  的 `noImplicitAny:false` 临时宽限收回。

## 4. UI 家族迁移（品牌/主题/导航）
- brand：`_37cUPa` / `_q2FAPq` 哈希锚点重探测（2.0.5 若改哈希类生成式，改走
  settings/theme 官方 token 面），README 补 q2FAPq 记录；
- theme：`:root` 注入面 → 观察 `data-dsh-skin` 出现后的 overrideTokens 契约扩面，再决定
  迁移路径（D 决议：现阶段不动）；
- team-gui：文案驱动导航（“打开设置”等文本锚）申请宿主官方 API/slot 属性替代；
  `styles .atg-*` 类名迁移为 `[data-plugin="agent-team-gui"]` 作用域选择器。

## 5. 补丁层重锚 SOP
- `verify-patches.sh` 漂移探测纳入重锚流程（07-patches-manifest-v2）；
- apply-patches 台账（2026-09-10 起）见脚本头部注释：退役项记录在案，唯一存留项
  （deepresearch http provider）以 §1.3 完成退役。

## 6. 窗口验收
1. 全包 `typecheck + test + build` 三绿（含 deepresearch 6 套、browser 11 套含复活 rc-legacy）；
2. `apply-patches.mjs` 输出全 `[ok]` 或已全部退役；
3. 重装演练：离线重建 profile node_modules → apply-patches → restart → `platform snapshot`
   healthy；
4. UI 家族人工验证清单过一遍（brand 哈希类、theme 注入、team-gui 导航）。
