/**
 * dsh-wanzh-hulian — 连接目录（四板块 + 首个连接：得到大脑知识库）。
 * logo 为得到大脑官方 favicon（48×48 PNG，data URI），来源于 www.biji.com。
 */
export const BOARDS = [
  { key: "mcp", title: "MCP 连接", icon: "🔌", desc: "接入 MCP Server（stdio / HTTP），工具桥接为 mcp__<server>__<tool>。", ready: true, connections: ["getnote-mcp"] },
  { key: "api", title: "API 连接", icon: "🧩", desc: "以 API Key 接入外部开放接口，凭证落 credentials 服务（模型不可见）。", ready: true, connections: [] },
  { key: "enterprise", title: "企业应用", icon: "🏢", desc: "连接企业应用与商业平台（Shopify 商店等）。", ready: true, connections: ["shopify"] },
  { key: "knowledge", title: "知识库", icon: "📚", desc: "连接个人/企业知识库，让 AI 帮你记住并找回内容。", ready: true, connections: ["getnote-brain"] },
];

export const CONNECTIONS = [
  {
    id: "getnote-brain",
    board: "knowledge",
    title: "得到大脑",
    subtitle: "Get笔记 · 个人知识库",
    logo: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAMKADAAQAAAABAAAAMAAAAADbN2wMAAAD/klEQVRoBe1ZZ0wUQRT+jhqaIiDhTgKif5Qi9vJLRP2BhZYoEmM0lkggqPSi/rBQJEooMWo0lsQSo1FBiS1oRIoFG4INCUqARAjC5Y5yVHdOjtzKHruwu2cuuZdcdufNzJvv2/d29s07yRQnlyEYsJgYMHY1dCOB/+1BoweYPGBjbY0D+1NQWvIED4oKsWzpEqZhgujMBLEybMTExARSqQvSDh9CYOA6tbasrBzvP1QJuQzNlmAEzMzMsMJvOVKSEzDX11e9SF9fH44dz0Z3dzdtUSEbghHYsjkcSYkJmDrVaQRf4b0ilJdXjLTFuOFFQCKRwNHREYnxMdi5YzsN3+/2duTm5mNwcJCmF7rBi4CPtxcVMolY6b+ChouALiq6j/r6HzS9GI0JE1i7JgAZaUcgk0lBXl5taW/vwO07Bejs6tJWi3I/bgK2trbYtnULkhLiYGNjwwiqouIFnpeWMfYJrRwXgenu7ojdtwehocGwpvZ6JlEoFMg6fgIDAwNM3YLrOBNYvGghso5lwNvLc1TIaKO6fOUaaj591laJes9KwNLSEv7+fsjKTMc0mWxMMI2NTTh3/iKGhvSXobMSiI6KxJ7oSJDYZ5NfLS3UjuQHlWoZ5HI5ioufwm6SHVavWsk2lbH/3bv3qK75xNinUbISCAkO5ASeGPSd4wPP2bPUtmtrv6PyzVt4eHggM/2oZr1xXdMzs/gTIB8rrkLSCfIjQkKPzDWltlgrKyuuJmjjNLZoyn8a9A38n05DaBoJ/G8vGT1g9ADPJ2AMIZ4PkPd0owd4P0KeBgzeA6zJnEqlmlBZhMwjafUAdT7WlFVIbmRhYTHmeYLmEA5pOSuB7Jw82NtPptnl0iDptLxDjrq6OiSnHlBPcXBwQFRkBJyoSgabfKutxctXlWzDINHn/wObwjYgLyd7JGNlQke8Rs7TKakH8eXrV9bDkd4IkANR6bNiuLm5MeFW67p7enD/wUOkUuBbWlt1jtPuYA0h7cETvSexH7F715jgG5uacPrMWZy/cAk9FBGuohcCM2fOQHjYRp2YfjY0ICY2AaVUIbi/v1/nOKYO0QmYmpoiOHA9XF1dR63f29uL168rEREZjabm5lH9XBSiE5BJpQiiCJib05dSKpXqcMk/eQptbW1csDKOoVtlHMJPGRIShNnDB32NJYVCib0xcXj06DG6eJbeRd2FnJ2d8aK8BPaT/35HSLXuY3UN9sXGo6rqo4YPr6toHiCxHx+7lwb+xs1byMnLBym5CCWiEZhD1YjWBASocSo7O5GWnomr166D1E6FFFEIkHL7gvnz0CHvAKnWnaRe1IK790Qp+Ir6Dgj5pHXZMvh02khAl2v1pTd4D/wBnistpHOToTQAAAAASUVORK5CYII=",
    vendor: "得到（biji.com）",
    docUrl: "https://www.biji.com/openapi?tab=skill",
    platformUrl: "https://www.biji.com/openapi",
    auth: {
      apiKeyRef: "getnote_api_key",
      clientIdRef: "getnote_client_id",
      oauthCmd: "npx @getnote/cli@latest auth login",
      apiBase: "https://openapi.biji.com/open/api/v1"
    },
    capabilities: [
      "知识库列表", "库内语义搜索", "全局语义搜索", "保存笔记（文本/链接）", "最近笔记", "按 ID 读笔记", "调用配额",
      "修改笔记", "加/删标签", "移入/移出知识库", "创建知识库", "库内笔记列表", "文件夹管理", "删除笔记（回收站）"
    ],
    tools: ["getnote_topics", "getnote_recall", "getnote_recall_kb", "getnote_save", "getnote_list", "getnote_get", "getnote_quota",
      "getnote_update_note", "getnote_add_tags", "getnote_delete_tag", "getnote_topic_notes",
      "getnote_move_to_topic", "getnote_remove_from_topic", "getnote_create_topic", "getnote_topic_directories",
      "getnote_create_directory", "getnote_update_directory", "getnote_delete_directory", "getnote_delete_note"],
    command: {
      slug: "得到大脑",
      allSearch: "/得到大脑 在全部笔记中搜索：",
      allSave: "/得到大脑 保存笔记（默认库）："
    },
    note: "OpenAPI 仅对得到大脑会员开放；知识库创建每日上限 50 个（429 quota_daily_exceeded）。"
  }
];
