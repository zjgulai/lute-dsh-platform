# 2026-09-16 · Settings 的身份、样式作用域与校准证据必须是三条可分离的链

关联：[ADR-0098](../../../adr/ADR-0098.md)、[P-25](../../../pitfalls-playbook.md#p-25--判据的射程从没被验证恒为同一个值于是把已达标读成未达标)

## Problem

PROD-UX-001 与 QG-012 暴露的是同一种结构性问题：实现和判据都在消费自己没有资格声明的事实。

Settings 脚本要求 modal 里有直接 `nav`，但 CSS 直接覆盖所有 modal；因此“脚本没认出这是 Settings”
并不等于“CSS 没有改它”。永久 `sawShell` 状态还会把关闭 Settings 后出现的普通 modal 误读成 drift。
Red fixture 在实现前稳定暴露 7 个失败分支：结构相似 direct-nav decoy、非唯一 current、双 Settings 候选、
marker 缺失、registry 失败遗留标题、正常关闭后的永久 drift、panel 替换后 marker 未迁移。

AX 探针则用目标按钮高度除以 40 得到 zoom，再将同一按钮高度除以 zoom。对 24、32、40、48、60、80
等任意输入，该公式都会返回 40；旧自检仍为绿色，只能说明恒等式被正确执行，不能说明按钮尺寸正确。

## Decision

- DOM 身份由一个 parser 负责：modal + 直接 `nav` + `aria-labelledby` 指向 nav 直接标题 + 按钮共同父容器
  + 恰好一个 current + 唯一有效候选。只有解析成功的 panel 获得 `data-dsh-settings-shell-root`。
- CSS 的面板、导航、按钮、分组与主题规则全部从该 marker 起步。absent、drift、异常、替换与 dispose
  都移除自有 marker/标题；registry 失败只撤掉不再可信的分组，保留已确认的 L1 marker。
- 离线负控同时放入 onboarding、Deep Research confirm、New App direct-nav、Role Matrix 与 Skill Center
  五类形状，逐个比较 panel width、nav overflow 与 button position，证明没有跨 dialog 污染。
- 校准常量来自当前 pinned upstream
  [`SettingsRoot.module.css`](../../../../vendor/dsh-desktop/deepseek-harness/packages/client/ui-settings-general/src/client/SettingsRoot.module.css)：
  `.nav` 为 188px，`.close` 为 28×28px；pin 为 `harness-submodule a66e470…`。目标按钮 40px 不参与 scale。
- 三个校准信号必须来自 nav/close 两个节点且与目标按钮节点集合不相交。以样本 scale 中位数为总 scale，
  每个信号都要落在 `max(1.5 AX px, expectedAx × 4%)` 的残差带内；任何冲突都 typed unavailable。
- 目标按钮在独立 scale 下按 40±2 CSS px 验收。目标/官方面板宽度按当前 viewport 动态计算；容差带
  无法分离时拒绝判决。报告输出 raw、scale、残差、容差、目标读数和稳定 unavailable code。
- QG-006A 的 owned mutation fixture 承载所有 probe mutant，不写 checkout、真实 HOME、profile 或 AX 状态。

## Alternatives considered

- 让 CSS 继续猜通用 modal，再给已知产品逐个加 `:not(...)`：排除列表必然落后于新增 surface。
- 给 Settings panel 钉 CSS-module 哈希：违反官方 UI 锚红线，上游重建就漂移。
- 只用一个 188px nav 锚：虽与目标独立，但单信号无法发现自身漂移；加入第二个 close 节点做交叉校准。
- 使用 AX window 与 CSS viewport 混合校准：当前 probe 无法从同一原子 snapshot 独立取得可信 CSS viewport。
- 缺锚时回退按钮自校准或放宽容差：会恢复 `button/(button/40)` 假绿，未采用。

## Consequences

- package suite 为 48/48，typecheck 与 bundle validator 通过；marker 只落到被 parser 接受的 panel，五类
  非 Settings fixture 的 computed style 保持不变。
- AX 纯函数自检为 14 个状态、27 条断言；criteria suite 为 9/9，其中 6 个 mutation control。
  目标尺寸恒真、目标自身反算 scale、锚冲突旁路、L1/L2/pluginLoaded 恒真都会稳定打红。
- `settings-shell-live.json` 的成功态与 unavailable 态都结构化；后者没有 verdict，并在 strict 模式 exit 1。
- 在隔离 PATH 中隐藏 `macos-harness` 的 CLI 负控已实跑：普通模式 exit 2、strict 模式 exit 1；两次报告
  都是 `status=unavailable`、`verdict=null`、`typedSkips[0].type=harness-missing`，没有触碰 GUI。
- 根 `test:gate` 为 412/412。quick 为 67/69、full 为 74/76：两者唯一 fail 都是
  `profile-bundle-sync` 发现当前 profile 仍装载旧 `lib/client.js`，另一个非 pass 是既有 159 条 disabled
  live-presets typed skip。该失败没有被放宽或修饰；本批按权限不写 profile，因此不执行同步。
- 本轮没有把包同步到 profile、没有重启或操作 DSH GUI，也没有跑两种显示缩放、VoiceOver、clean checkout、
  DMG 或发布。状态只能写成 `instrument verified, live unverified`；QG-003/REL-001 与 live/a11y 项继续保留。
