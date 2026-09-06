# [Medium] composer 底行 flex-wrap 换行导致权限药丸上移（窗口中等宽度即触发）

## 环境
DSH Desktop 2.0.4 · @deepseek-ai/dsh-client-ui-conversation@0.1.2-alpha.1

## 证据
- `lib/client.js` InputBar CSS：`.krUYjW_row{flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;min-width:0;padding:2px 8px 6px;display:flex;container-type:inline-size}`；`.krUYjW_trailing{flex:none;gap:12px;margin-left:auto}`。
- 药丸触发器自带截断与容器查询：`.JWDDNa_trigger{max-width:220px;...}` + `@container (width<=460px){.JWDDNa_trigger:has(.JWDDNa_triggerIcon) .JWDDNa_triggerLabel{display:none}}`。

## 复现
窗口 1280px + 侧边栏 35%（卡片 ~570px）时，底行内容（+ 按钮 + 药丸 + 模型选择器 + ContextMeter + 发送键 ≈500-550px）超过行内宽（~554px）→ `flex-wrap:wrap` 把 `trailing`（margin-left:auto）换行到第二行 → 「Full access」药丸留在第一行，距卡片底边 36-125px（视觉上移、与下沿不对齐）。用户实测截图 + 像素取证复现。

## 建议修复
`.krUYjW_row{flex-wrap:nowrap}`——`tools` 已 `min-width:0`、药丸标签已 `text-overflow:ellipsis`，收缩安全；≤460px 时既有容器查询会隐藏药丸文字标签兜底。或等价方案：给 `trailing` 加 `flex-wrap:nowrap`+可收缩模型名。

## 关联本地修复
checkout `dsh-client-ui-conversation/lib/client.js` 直补（nowrap，`.orig` 在旁）；实测药丸距底 6px。
