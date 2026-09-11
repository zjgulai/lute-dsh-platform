/**
 * dsh-wanzh-hulian — 设置页「万物互联」的板块定义。
 *
 * 这里**只有板块本身**（key / 标题 / 图标 / 说明 / 是否就绪）。
 * 板块下的连接清单一律由运行时注册表（lib/index.js 的 DEFAULT_CONNECTIONS
 * 与 ~/.dsh/integrations/wanzh-hulian/connections.json）派生，见 buildBoards()。
 *
 * 历史：本文件曾是 catalog.js，同时保存一份「连接」快照（id 为 getnote-mcp 的
 * 幽灵连接、以及未登记的 shopify）。该快照是同一事实的第二份副本，注册表增删后
 * 必然静默过时（ADR-0009：一份事实只有一个家），已删除。
 */
export const BOARDS = [
  { key: "mcp", title: "MCP 连接", icon: "🔌", desc: "接入 MCP Server（stdio / HTTP），工具桥接为 mcp__<server>__<tool>。", ready: true },
  { key: "api", title: "API 连接", icon: "🧩", desc: "以 API Key 接入外部开放接口，凭证落 credentials 服务（模型不可见）。", ready: true },
  { key: "enterprise", title: "企业应用", icon: "🏢", desc: "连接企业应用与商业平台（Shopify 商店等）。", ready: true },
  { key: "knowledge", title: "知识库", icon: "📚", desc: "连接个人/企业知识库，让 AI 帮你记住并找回内容。", ready: true },
];

/**
 * 「得到大脑」连接卡片 logo（得到大脑官方 favicon，48×48 PNG，来源 www.biji.com）。
 * 运行时注册表 getnote-brain 卡片引用它；单独存放避免内联进 2000 行宿主文件。
 */
export const GETNOTE_LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAMKADAAQAAAABAAAAMAAAAADbN2wMAAAD/klEQVRoBe1ZZ0wUQRT+jhqaIiDhTgKif5Qi9vJLRP2BhZYoEmM0lkggqPSi/rBQJEooMWo0lsQSo1FBiS1oRIoFG4INCUqARAjC5Y5yVHdOjtzKHruwu2cuuZdcdufNzJvv2/d29s07yRQnlyEYsJgYMHY1dCOB/+1BoweYPGBjbY0D+1NQWvIED4oKsWzpEqZhgujMBLEybMTExARSqQvSDh9CYOA6tbasrBzvP1QJuQzNlmAEzMzMsMJvOVKSEzDX11e9SF9fH44dz0Z3dzdtUSEbghHYsjkcSYkJmDrVaQRf4b0ilJdXjLTFuOFFQCKRwNHREYnxMdi5YzsN3+/2duTm5mNwcJCmF7rBi4CPtxcVMolY6b+ChouALiq6j/r6HzS9GI0JE1i7JgAZaUcgk0lBXl5taW/vwO07Bejs6tJWi3I/bgK2trbYtnULkhLiYGNjwwiqouIFnpeWMfYJrRwXgenu7ojdtwehocGwpvZ6JlEoFMg6fgIDAwNM3YLrOBNYvGghso5lwNvLc1TIaKO6fOUaaj591laJes9KwNLSEv7+fsjKTMc0mWxMMI2NTTh3/iKGhvSXobMSiI6KxJ7oSJDYZ5NfLS3UjuQHlWoZ5HI5ioufwm6SHVavWsk2lbH/3bv3qK75xNinUbISCAkO5ASeGPSd4wPP2bPUtmtrv6PyzVt4eHggM/2oZr1xXdMzs/gTIB8rrkLSCfIjQkKPzDWltlgrKyuuJmjjNLZoyn8a9A38n05DaBoJ/G8vGT1g9ADPJ2AMIZ4PkPd0owd4P0KeBgzeA6zJnEqlmlBZhMwjafUAdT7WlFVIbmRhYTHmeYLmEA5pOSuB7Jw82NtPptnl0iDptLxDjrq6OiSnHlBPcXBwQFRkBJyoSgabfKutxctXlWzDINHn/wObwjYgLyd7JGNlQke8Rs7TKakH8eXrV9bDkd4IkANR6bNiuLm5MeFW67p7enD/wUOkUuBbWlt1jtPuYA0h7cETvSexH7F715jgG5uacPrMWZy/cAk9FBGuohcCM2fOQHjYRp2YfjY0ICY2AaVUIbi/v1/nOKYO0QmYmpoiOHA9XF1dR63f29uL168rEREZjabm5lH9XBSiE5BJpQiiCJib05dSKpXqcMk/eQptbW1csDKOoVtlHMJPGRIShNnDB32NJYVCib0xcXj06DG6eJbeRd2FnJ2d8aK8BPaT/35HSLXuY3UN9sXGo6rqo4YPr6toHiCxHx+7lwb+xs1byMnLBym5CCWiEZhD1YjWBASocSo7O5GWnomr166D1E6FFFEIkHL7gvnz0CHvAKnWnaRe1IK790Qp+Ir6Dgj5pHXZMvh02khAl2v1pTd4D/wBnistpHOToTQAAAAASUVORK5CYII=";
