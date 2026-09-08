import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { PIXPIX_BUSINESS_META, SHOPIFY_BUSINESS_META, MCP_STATIC_TOOL_META, staticToolMetaFor } from "./business-meta.js";
import * as McpClient from "@deepseek-ai/dsh-mcp-client";
import { BOARDS, CONNECTIONS } from "./catalog.js";

/**
 * dsh-wanzh-hulian — Host half（万物互联）。
 *
 * 首个连接「得到大脑知识库」：
 *  - 凭证：getnote_api_key / getnote_client_id → credentials 服务（模型不可见，绝不回显）
 *  - 开关：双层（连接总开关 + 模型自动调用开关），状态持久化在
 *    ~/.dsh/integrations/getnote/config.json；连接开关在工具执行入口热生效
 *    （关闭即返回断开提示，无需重启）；模型自动调用开关写引导技能
 *    getnote-brain 的 disable-model-invocation（文件系统 provider 热加载）
 *  - 工具：7 个 getnote_* 原生工具，直连 https://openapi.biji.com/open/api/v1
 *  - 大整数保真：note_id 等 16 位以上数字按字符串解析，避免精度丢失
 */
const name = "dsh-wanzh-hulian";
const inject = ["webServer", "credentials", "tools"];

const BASE = "/api/dsh-wanzh-hulian";
async function collectCredentialRefs() {
  const refs = new Set();
  for (const conn of await readConnections()) {
    for (const f of conn.authFields ?? []) if (typeof f?.ref === "string" && f.ref) refs.add(f.ref);
  }
  return [...refs];
}
const INTEGRATION_DIR = join(homedir(), ".dsh", "integrations", "getnote");
const STATE_FILE = join(INTEGRATION_DIR, "config.json");
const SKILL_DIR = join(homedir(), ".dsh", "skills", "getnote-brain");
const SKILL_FILE = join(SKILL_DIR, "SKILL.md");
const API_BASE = "https://openapi.biji.com/open/api/v1";
const API_TIMEOUT_MS = 30000;
const GETNOTE = CONNECTIONS[0];

/* ── loopback 信任围栏（与出海插件同款） ─────────────────────────────── */
function isIPv4Loopback(v4) {
  const parts = v4.split(".");
  return parts.length === 4 && parts[0] === "127" && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}
function isLoopbackAddress(address) {
  if (address === undefined) return false;
  const n = address.toLowerCase();
  if (n === "::1") return true;
  if (n.startsWith("::ffff:")) return isIPv4Loopback(n.slice(7));
  return isIPv4Loopback(n);
}
function isLoopbackRequest(request) {
  if (!isLoopbackAddress(request.socket?.remoteAddress)) return false;
  const host = request.headers?.host;
  if (typeof host !== "string") return false;
  try {
    const h = new URL("http://" + host);
    return h.hostname === "localhost" || h.hostname === "[::1]" || isIPv4Loopback(h.hostname);
  } catch {
    return false;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try { resolve(chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

/* ── 连接状态（双层开关） ────────────────────────────────────────────── */
const DEFAULT_STATE = { enabled: true, modelInvoke: false };
async function readState() {
  try {
    if (existsSync(STATE_FILE)) {
      const raw = JSON.parse(await readFile(STATE_FILE, "utf8"));
      return {
        enabled: raw?.enabled !== false,
        modelInvoke: raw?.modelInvoke === true
      };
    }
  } catch { /* 损坏则回退默认 */ }
  return { ...DEFAULT_STATE };
}
async function writeState(next) {
  await mkdir(INTEGRATION_DIR, { recursive: true, mode: 0o700 });
  const state = { ...(await readState()), ...next };
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
  return state;
}

/* ── 引导技能（getnote-brain）：安装 + 模型自动调用开关写 flag ────────── */
const SKILL_TEMPLATE = `---
name: "getnote-brain"
title: "得到大脑"
description: "得到大脑（Get笔记）知识库连接：保存文字/链接到笔记、语义搜索全部笔记、在指定知识库内搜索、读取笔记与查看配额。由万物互联插件的 getnote_* 原生工具执行，本技能只做触发指引与边界约束。触发词：得到大脑、Get笔记、记笔记、保存到笔记、帮我记住、搜一下笔记、知识库搜索。何时不用：与得到大脑无关的记事本/便签需求、其他知识库产品。安全边界：不索取或展示 API Key 等秘密；凭证由宿主管理，模型不可见。"
enabled: "true"
disable-model-invocation: true
user-invocable: true
---

# 得到大脑（Get笔记）· 使用指引

本技能是「万物互联」中**得到大脑知识库连接**的模型侧入口。真正的读写由宿主原生工具执行，本文件只约定**何时用、怎么用、边界**。

## 何时使用

- 用户要求「帮我记住 / 记一下 / 保存到笔记」→ 调 \`getnote_save\`
- 用户要求「找找之前的笔记 / 搜一下笔记」→ 调 \`getnote_recall\`（全局语义搜索）
- 用户点名知识库（「在 XX 知识库搜」）→ 先 \`getnote_topics\` 拿知识库列表，再 \`getnote_recall_kb\`
- 用户要求「列出最近笔记 / 打开某条笔记」→ \`getnote_list\` / \`getnote_get\`
- 需要确认调用余量 → \`getnote_quota\`

## 使用约定

1. 连接总开关关闭时，工具会返回「已断开」提示——把该提示原样转达用户，不要重试、不要猜测内容。
2. 保存笔记默认纯文本；用户给的是 URL 时用链接类型（\`getnote_save\` 传 link_url）。
3. 语义搜索返回的是内容片段，引用时标注「来自得到大脑」；拿不到结果就如实说没有，绝不编造笔记内容。
4. 用户没点名得到大脑时，不要自动替用户保存/搜索——除非用户已开启「模型自动调用」开关。

## 整理分类（两阶段制，强制）

分类整理能力 = 20 个工具（含改笔记、加/删标签、批量移入/移出库、建库、文件夹管理、删笔记到回收站）。整理任务必须：

1. **阶段一 盘点（只读）**：\`getnote_topics\` + \`getnote_topic_notes\` + \`getnote_get\` 拉清单与标签现状，产出「分类映射方案」给用户（哪些笔记从哪挪到哪、哪些标签合并/新建、哪些删入回收站）。
2. **阶段二 执行（写）**：用户明确确认后才执行 \`getnote_move_to_topic\` / \`getnote_remove_from_topic\` / \`getnote_add_tags\` / \`getnote_delete_tag\` / \`getnote_update_note\` / \`getnote_delete_note\`。**禁止未经确认的全库自动重分类。**
3. 批量工具单次 ≤50 条；接口返回的 failed_note_ids 原样报告，不静默跳过。
4. 删除边界：删笔记=回收站（可恢复）；删文件夹=仅空目录；删除知识库无接口——只能清空库内笔记后由用户在 App 删除，需如实告知。
5. 整理完成后输出报告：移动/标签/删除的成功与失败清单。

## 官方 MCP 路由（38 工具）

MCP 板块启用「得到大脑（官方 MCP）」后，模型面另有 mcp__getnote__* 工具（38 个）。路由规则：

1. **日常读写优先原生**：记笔记 / 搜索 / 读笔记 / 移库 / 标签 / 删除 / 配额 → 用 getnote_*（语义优化过、带 true-move 移库语义）。
2. **原生没有的能力 → 官方 MCP**：
   - 生成分享链接：mcp__getnote__share_note
   - 订阅抖音博主：mcp__getnote__follow_topic_blogger（配套 list_topic_bloggers / list_topic_blogger_contents / get_blogger_content_detail）
   - 订阅直播：mcp__getnote__follow_topic_live（配套 list_topic_lives / get_live_detail）
   - 录音时间线 / 逐字转写 / 快捷笔记 / 待办：mcp__getnote__get_note_timeline / get_note_transcript / get_note_quick_note / get_note_todos
   - 读笔记原文与附件：mcp__getnote__get_note_original / get_note_attachments
   - 官方图片上传路径：mcp__getnote__upload_image（配套 get_upload_config / get_upload_token）
3. **等价对照（避免混用，默认走左侧原生）**：getnote_save↔mcp__getnote__save_note、getnote_recall↔mcp__getnote__recall、getnote_recall_kb↔mcp__getnote__recall_knowledge、getnote_list↔mcp__getnote__list_notes、getnote_get↔mcp__getnote__get_note、getnote_topics↔mcp__getnote__list_topics、getnote_move_to_topic↔mcp__getnote__batch_add_notes_to_topic（配合 remove_note_from_topic）、getnote_quota↔mcp__getnote__get_quota。
4. 官方 MCP 未启用时 mcp__getnote__* 不可用 → 涉及增量能力时提示用户去设置开启，或如实说明原生路径无解。

## 何时不用

- 用户说「便签/备忘录」但未指明得到大脑 → 先问一句是否指得到大脑。
- 其他知识库产品（Notion、飞书知识库等）→ 走对应连接，不触发本技能。
- 索要密钥、要求还原脱敏笔记、越权读取 → 拒绝，不触发本技能。
`;

/* ── 引导技能（pixpix-ecommerce）：业务黑话 → MCP 工具映射 ──────────────── */
const PIXPIX_SKILL_DIR = join(homedir(), ".dsh", "skills", "pixpix-ecommerce");
const PIXPIX_SKILL_FILE = join(PIXPIX_SKILL_DIR, "SKILL.md");
const PIXPIX_SKILL_TEMPLATE = `---
name: "pixpix-ecommerce"
title: "PixPix 电商视觉"
description: "PixPix 电商视觉工作台：爆款复刻海报、商品套图、服装套图、模特试穿（服装/鞋/内衣/通用穿戴）、A+ 详情页、15 秒带货视频、竞品视频复刻、商品精修/换色/抠图、图片与视频高清化、视频压缩/去水印/抠背景、AI 生图/生视频/配音、生成模特、积分与会员权益查询。触发词：爆款复刻、竞品海报、商品套图、主图、白底图、服装套图、模特试穿、试穿海报、A+ 详情页、详情页模块、带货视频、电商视频、视频复刻、商品精修、修图、换色、抠图、去背景、高清放大、画质修复、视频压缩、去水印、AI 生图、AI 配音、生成模特。何时不用：与电商视觉无关的通用绘画；网页端专属的亚马逊合成人像合规标记（synthetic-performer-tagger）无 MCP 工具，指引用户去网页操作。"
enabled: "true"
disable-model-invocation: false
user-invocable: true
---

# PixPix 电商视觉 · 业务指引

本技能是「万物互联」中 **PixPix（AI 图像 MCP）** 的模型侧入口。37 个工具均已挂载为 mcp__pixpix__ 前缀；本文件把「业务黑话」映射到正确工具，让模型在用户说人话时选对工具。

## 业务场景速查（用户怎么说 → 用哪个工具）

| 用户业务诉求 | 首选工具（mcp__pixpix__ 前缀省略） |
| --- | --- |
| 爆款复刻 / 参考竞品海报风格做自家图 | run_tool-generation-bestseller-replica |
| 商品套图 / 一整套主图 / 白底图+场景图+卖点图 | run_tool-generation-product-suite |
| 服装套图（白底/模特/细节/卖点） | run_tool-generation-apparel-set |
| 把衣服穿到模特身上 / 试穿 | run_tool-generation-apparel-try-on |
| 把鞋穿到模特脚上 / 试穿海报 | run_tool-generation-footwear-try-on |
| 内衣试穿 | run_tool-generation-lingerie-try-on |
| 配饰/眼镜/帽子等穿戴展示 | run_tool-generation-ai-wear-anything |
| A+ 详情页 / 详情页模块图 | run_tool-generation-a-plus-detail |
| 15 秒带货视频 / 口播 / 短视频带货 | run_generation-viral-ecommerce-video |
| 参考竞品视频换自家商品 / 视频复刻 | run_tool-generation-video-replication |
| 修图 / 划痕 / 光泽 / 透视校正 | run_tool-generation-product-retouch |
| 商品换色（保持材质） | run_tool-generation-product-recolor |
| 抠图 / 去背景（图片） | run_generation-remove-bg |
| 图片高清放大 | run_generation-high-definition-image |
| 视频放大 / 超分 | run_generation-flux-video-upscale |
| 老片/真人视频画质修复 | run_generation-high-definition-video |
| 视频抠背景 | run_generation-video-remove-bg |
| 视频去水印 | run_generation-video-remove-watermark |
| 视频压缩 | run_generation-video-compression |
| 生成模特人像 | run_generation-model |
| AI 生图（文生图/图生图） | generate_image |
| AI 生视频 | generate_video |
| 文案配音 / TTS | generate_tts |
| 查历史生成记录 / 收藏 | list_generation_tasks |
| 某项能力没有专门工具时的兜底 | run_generation_tool |

## 标准工作流（生成类任务）

1. **素材上传**（本地图/视频）：prepare_image_upload → 原生 HTTP PUT → complete_image_upload（视频同理 prepare_video_upload / complete_video_upload）。会话内已有图片附件优先直接使用，不要让用户重复选图。
2. **提交任务**：调用上表对应工具，只返回 taskId，不直接返回成片。
3. **轮询进度**：get_generation_status（单个）或 get_generation_status_batch（批量），到终态后再取结果。
4. **展示结果**：本宿主用 get_generation_status 返回的下载链接交付给用户。
5. **成本预估**：生成前可先 get_generation_credits 估算积分；get_membership_benefit 查会员与余额。
6. **模型能力**：不确定模型/参数时先 list_generation_models。

## 注意

- 生成任务异步完成，提交后必须轮询状态，不要谎称「已完成」。
- 工具返回的错误（积分不足、参数非法、限流）原样转达用户，不要重试轰炸。
- 真人素材需用户确认已获使用授权；AI 合成人像用于亚马逊上架时，合规标记（contains-synthetic-performer）需在 PixPix 网页端工具完成（synthetic-performer-tagger，MCP 未暴露）。
- 本技能只做映射与流程指引；凭证、token 由宿主管理，模型不可见，禁止索取。
- 宿主专用工具（get_generation_status_for_workbuddy、render_generation_result_for_codex/in_app）为其他宿主（WorkBuddy/Codex/Claude）使用，本宿主不暴露，无需调用。
<!-- v2 2026-09-08 -->
`;
async function ensurePixpixSkill() {
  if (!existsSync(PIXPIX_SKILL_FILE)) {
    await mkdir(PIXPIX_SKILL_DIR, { recursive: true });
    await writeFile(PIXPIX_SKILL_FILE, PIXPIX_SKILL_TEMPLATE, "utf8");
    return;
  }
  // 模板升级（幂等）：缺「业务场景速查」章节时用新模板重写，保留旧文件的模型调用/可用性 flag
  const text = await readFile(PIXPIX_SKILL_FILE, "utf8");
  if (!text.includes("## 业务场景速查") || !text.includes("<!-- v2 2026-09-08 -->")) {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    const dis = fm && /^disable-model-invocation:\s*(true|false)\s*$/m.exec(fm[1]);
    const usr = fm && /^user-invocable:\s*(true|false)\s*$/m.exec(fm[1]);
    let next = PIXPIX_SKILL_TEMPLATE;
    if (dis) next = next.replace("disable-model-invocation: false", "disable-model-invocation: " + dis[1]);
    if (usr) next = next.replace("user-invocable: true", "user-invocable: " + usr[1]);
    await writeFile(PIXPIX_SKILL_FILE, next, "utf8");
  }
}
async function ensureSkill() {
  if (!existsSync(SKILL_FILE)) {
    await mkdir(SKILL_DIR, { recursive: true });
    await writeFile(SKILL_FILE, SKILL_TEMPLATE, "utf8");
    return;
  }
  // 模板升级（幂等）：缺「整理分类」章节时用新模板重写，保留旧文件的模型调用/可用性 flag
  const text = await readFile(SKILL_FILE, "utf8");
  if (!text.includes("## 官方 MCP 路由")) {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    const dis = fm && /^disable-model-invocation:\s*(true|false)\s*$/m.exec(fm[1]);
    const usr = fm && /^user-invocable:\s*(true|false)\s*$/m.exec(fm[1]);
    let next = SKILL_TEMPLATE;
    if (dis) next = next.replace("disable-model-invocation: true", `disable-model-invocation: ${dis[1]}`);
    if (usr) next = next.replace("user-invocable: true", `user-invocable: ${usr[1]}`);
    await writeFile(SKILL_FILE, next, "utf8");
  }
}
/* ── Shopify 店铺运营技能（模型侧入口，与 business-meta 单一数据源联动） ────── */
const SHOPIFY_SKILL_DIR = join(homedir(), ".dsh", "skills", "shopify-store-ops");
const SHOPIFY_SKILL_FILE = join(SHOPIFY_SKILL_DIR, "SKILL.md");
const SHOPIFY_SKILL_MARKER = "<!-- business-meta v1 2026-09-08 -->";
function buildShopifySkillTemplate() {
  const rows = Object.entries(SHOPIFY_BUSINESS_META)
    .map(([tool, biz]) => {
      const tag = biz.readWrite === "write" ? "（写入·先确认）" : "";
      return `| ${biz.scene} | ${biz.example} | ${tool}${tag} |`;
    })
    .join("\n");
  return `---
name: "shopify-store-ops"
title: "Shopify 店铺运营"
description: "Shopify 店铺运营（万物互联 MCP 直连）：查商品/订单/客户，改价格、订单备注、客户标签、新建商品等。触发词：Shopify、店铺运营、查订单、查商品、查客户、查库存、改价格、订单备注、新建商品、修改商品。何时不用：与 Shopify 店铺数据无关的电商问题（选品/广告/竞品分析走对应技能）。"
enabled: "true"
disable-model-invocation: false
user-invocable: true
input_contract: 一句店铺运营诉求（查/改商品、订单、客户），工具直连店铺 Admin API
output_contract: 店铺数据结果（列表/详情）；写操作执行前先向你确认，无写权限时如实说明
example: 说「帮我查店铺最近 10 个订单」→ 直接返回订单清单
---

# Shopify 店铺运营 · 业务指引

本技能是「万物互联」中 **Shopify（社区 MCP）** 的模型侧入口。14 个工具已挂载为 mcp__shopify__ 前缀；本文件把「业务黑话」映射到正确工具，让模型在用户说人话时选对工具。

## 业务场景速查（用户怎么说 → 用哪个工具）

| 场景 | 用户怎么说 | 首选工具（mcp__shopify__ 前缀省略） |
| --- | --- | --- |
${rows}

## 护栏（必须遵守）

1. **只读优先**：查信息直接调 get_* 工具，不要用写工具去「探测」。
2. **写操作先确认**：create / update / delete / manage 类工具执行前，必须向用户复述「将要执行的操作 + 对象」，得到明确确认后才能调用；delete 不可恢复，用户未点名删除对象时默认不做。
3. **写权限边界**：店铺只授 read scopes 时写操作会被 Shopify 平台拒绝（HTTP 403）。此时如实告知用户「店铺未授写权限」，给出后台补权限路径，不要反复重试。
4. **数据真实**：只转述工具返回的店铺数据，不编造商品/订单/客户信息。

## 标准工作流

1. 查清单：get_products / get_orders / get_customers 拿列表与 ID。
2. 查详情：get_product_by_id / get_order_by_id / get_customer_orders 按 ID 深挖。
3. 写操作：先确认 → 再调用 update_* / create_* / manage_*。
4. 失败处理：权限/参数错误原样转达，不重试轰炸。

## 注意

- 本技能只做映射与流程指引；客户端 ID、加密密钥由宿主管理，模型不可见，禁止索取。
${SHOPIFY_SKILL_MARKER}
`;
}
async function ensureShopifySkill() {
  const next = buildShopifySkillTemplate();
  if (!existsSync(SHOPIFY_SKILL_FILE)) {
    await mkdir(SHOPIFY_SKILL_DIR, { recursive: true });
    await writeFile(SHOPIFY_SKILL_FILE, next, "utf8");
    return;
  }
  const text = await readFile(SHOPIFY_SKILL_FILE, "utf8");
  if (!text.includes(SHOPIFY_SKILL_MARKER)) {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    const dis = fm && /^disable-model-invocation:\s*(true|false)\s*$/m.exec(fm[1]);
    const usr = fm && /^user-invocable:\s*(true|false)\s*$/m.exec(fm[1]);
    let out = next;
    if (dis) out = out.replace("disable-model-invocation: false", "disable-model-invocation: " + dis[1]);
    if (usr) out = out.replace("user-invocable: true", "user-invocable: " + usr[1]);
    await writeFile(SHOPIFY_SKILL_FILE, out, "utf8");
  }
}

async function setSkillModelInvoke(on) {
  await ensureSkill();
  const text = await readFile(SKILL_FILE, "utf8");
  const next = text.replace(/^disable-model-invocation:\s*(true|false)\s*$/m, `disable-model-invocation: ${on ? "false" : "true"}`);
  if (next !== text) await writeFile(SKILL_FILE, next, "utf8");
}

/* ── 得到大脑 REST 客户端 ────────────────────────────────────────────── */
/** 16 位以上整数转字符串（note_id 等超 Number.MAX_SAFE_INTEGER，与官方 MCP 同法） */
function parseJsonPreservingLargeIntegerStrings(text) {
  if (typeof text !== "string" || text.trim() === "") return text;
  const safe = text
    .replace(/"(note_id|next_cursor|cursor|id|parent_id|topic_id|since_id|share_id|follow_id|live_id)"\s*:\s*(\d{16,})/g, '"$1":"$2"')
    .replace(/([:[,]\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"');
  return JSON.parse(safe);
}

const CONNECTIONS_FILE = join(homedir(), ".dsh", "integrations", "wanzh-hulian", "connections.json");
const DEFAULT_CONNECTIONS = [
  {
    id: "getnote-brain",
    board: "knowledge",
    kind: "builtin",
    title: "得到大脑",
    subtitle: "Get笔记 · 个人知识库",
    enabled: true,
    extras: ["model-invoke", "oauth-button", "default-topic"],
    authFields: [
      { ref: "getnote_api_key", label: "API Key（gk_live_xxx）", placeholder: "粘贴 API Key", secret: true },
      { ref: "getnote_client_id", label: "Client ID（cli_xxx）", placeholder: "粘贴 Client ID", secret: true }
    ],
    probe: { kind: "getnote" },
    capabilities: ["知识库列表", "库内语义搜索", "全局语义搜索", "保存笔记（文本/链接）", "最近笔记", "按 ID 读笔记", "调用配额", "修改笔记", "加/删标签", "移入/移出知识库", "创建知识库", "库内笔记列表", "文件夹管理", "删除笔记（回收站）"],
    note: "OpenAPI 仅对得到大脑会员开放；知识库创建每日上限 50 个（429 quota_daily_exceeded）。",
    command: { slug: "得到大脑", allSearch: "/得到大脑 在全部笔记中搜索：", allSave: "/得到大脑 保存笔记（默认库）：" },
    oauthCmd: "npx @getnote/cli@latest auth login",
    platformUrl: "https://www.biji.com/openapi",
    docUrl: "https://www.biji.com/openapi?tab=skill",
    logo: GETNOTE.logo
  },
  {
    id: "shopify",
    board: "enterprise",
    kind: "mcp",
    mcpServerId: "shopify",
    title: "Shopify 商店",
    subtitle: "店铺运营 · 只读",
    enabled: false,
    extras: [],
    authFields: [
      { ref: "shopify_domain", label: "商店域名", placeholder: "xxx.myshopify.com", secret: false },
      { ref: "shopify_client_id", label: "客户端 ID", placeholder: "32 位十六进制 ID", secret: true },
      { ref: "shopify_client_secret", label: "加密密钥", placeholder: "shpss_xxx", secret: true }
    ],
    probe: { kind: "shopify-shop-info" },
    capabilities: ["商品查询", "订单查询", "客户查询", "库存查询", "折扣查询"],
    note: "只读连接：Custom App 仅 read_* scopes，写操作由 Shopify 平台层拒绝。凭据用开发仪表盘应用的客户端 ID + 加密密钥，插件自动换取访问令牌（约 24h，自动续期）。工具来自官方社区 MCP（mcp__shopify_*）。",
    platformUrl: "https://admin.shopify.com",
    docUrl: "https://shopify.dev/docs/api/usage/access-scopes",
    logo: ""
  }
];
async function readConnections() {
  try {
    const raw = await readFile(CONNECTIONS_FILE, "utf8");
    const d = JSON.parse(raw);
    if (Array.isArray(d?.connections) && d.connections.length > 0) {
      // 合并内置默认（新增连接字段的向后兼容）
      const byId = new Map(DEFAULT_CONNECTIONS.map((x) => [x.id, x]));
      return d.connections.map((x) => ({ ...(byId.get(x.id) ?? {}), ...x }));
    }
  } catch { /* 缺省/损坏回退内置 */ }
  return DEFAULT_CONNECTIONS;
}
async function writeConnections(connections) {
  const dir = CONNECTIONS_FILE.slice(0, CONNECTIONS_FILE.lastIndexOf("/"));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(CONNECTIONS_FILE, JSON.stringify({ schemaVersion: 1, connections }, null, 2), { mode: 0o600 });
}

const MCP_FILE = join(homedir(), ".dsh", "integrations", "wanzh-hulian", "mcp-servers.json");
const DEFAULT_MCP_SERVERS = [
  {
    id: "shopify",
    name: "Shopify 商店（社区 MCP）",
    enabled: false,
    transport: "stdio",
    command: "npx",
    args: ["-y", "shopify-mcp"],
    envRefs: { SHOPIFY_CLIENT_ID: "shopify_client_id", SHOPIFY_CLIENT_SECRET: "shopify_client_secret", MYSHOPIFY_DOMAIN: "shopify_domain" },
    capabilities: ["商品管理", "订单查询", "客户管理", "库存同步", "折扣/营销", "Shopify Admin GraphQL"],
    toolCount: 14,
    note: "geli2001/shopify-mcp（已安全审查）：45 工具，仅本店 Admin GraphQL；客户端 ID + 加密密钥自动换取访问令牌（24h 续期）。与「企业应用」板块的 Shopify 连接联动启用。"
  },
  {
    id: "pixpix",
    name: "PixPix（AI 图像 MCP）",
    enabled: false,
    transport: "streamable-http",
    url: "https://api.pixpix.media/pixpix/mcp/oauth2",
    capabilities: ["主图与套图", "模特与试穿", "带货视频", "图片精修", "视频精修", "AI 生图与配音", "素材与任务", "成本与权益"],
    toolCount: 37,
    auth: {
      type: "oauth-pkce",
      clientId: "pixpix-09f96e473d35412a9517873b895413b5",
      authorizationEndpoint: "https://api.pixpix.media/pixpix/oauth2/authorize",
      tokenEndpoint: "https://api.pixpix.media/pixpix/oauth2/token",
      scopes: ["mcp:connect", "offline_access"],
      resource: "https://api.pixpix.media/pixpix/mcp/oauth2"
    },
    note: "覆盖网页端全部电商工具（爆款复刻/套图/试穿/A+ 详情页/带货视频/视频复刻/精修等）；仅「亚马逊合成人像合规标记」为网页端本地工具（pixpix.art/tools/synthetic-performer-tagger）。OAuth 手动授权，token 0600 落盘自动刷新。"
  },
  {
    id: "getnote",
    name: "得到大脑（官方 MCP）",
    enabled: false,
    transport: "stdio",
    command: "npx",
    args: ["-y", "@getnote/mcp"],
    envRefs: { GETNOTE_API_KEY: "getnote_api_key", GETNOTE_CLIENT_ID: "getnote_client_id" },
    capabilities: ["记笔记", "找笔记", "知识库管理", "内容订阅", "上传与配额", "删除与清理"],
    toolCount: 38,
    note: "官方 38 项能力全套（含订阅博主/直播、分享链接、转写原文等增量能力）。日常记笔记/搜索直接用上方「得到大脑」连接即可，两边数据同源；本卡开启后新增能力自动进对话。"
  }
];
const OAUTH_FILE = join(homedir(), ".dsh", "integrations", "wanzh-hulian", "oauth-pixpix.json");
let pendingOauth = null; // { verifier, redirectUri, expiresAt }

/* ── PixPix 工具业务化映射（业务视角：业务名 + 业务描述 + 场景分组） ─────────── */

function b64url(buf) { return Buffer.from(buf).toString("base64url"); }
async function readOauthToken() {
  try {
    const d = JSON.parse(await readFile(OAUTH_FILE, "utf8"));
    return {
      accessToken: typeof d?.access_token === "string" ? d.access_token : "",
      refreshToken: typeof d?.refresh_token === "string" ? d.refresh_token : "",
      expiresAt: typeof d?.expires_at === "number" ? d.expires_at : 0,
      scope: typeof d?.scope === "string" ? d.scope : ""
    };
  } catch { return null; }
}
async function writeOauthToken(d) {
  const dir = OAUTH_FILE.slice(0, OAUTH_FILE.lastIndexOf("/"));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(OAUTH_FILE, JSON.stringify(d, null, 2), { mode: 0o600 });
}
async function exchangeOauthToken(auth, params) {
  const res = await fetch(auth.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params)
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: `token 交换失败 HTTP ${res.status}: ${body?.error_description ?? body?.error ?? "unknown"}` };
  if (!body?.access_token) return { ok: false, error: "token 响应缺少 access_token" };
  await writeOauthToken({
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? "",
    expires_at: Date.now() + (Number(body.expires_in) || 3600) * 1000,
    scope: body.scope ?? ""
  });
  return { ok: true };
}
/** 挂载前保证 token 可用（过期则 refresh） */
async function ensureOauthToken(auth) {
  const tok = await readOauthToken();
  if (!tok || !tok.accessToken) return null;
  if (tok.expiresAt > Date.now() + 60_000) return tok;
  if (!tok.refreshToken) return tok; // 无 refresh 则按原样挂载（过期后工具 401 提示重授权）
  const r = await exchangeOauthToken(auth, {
    grant_type: "refresh_token",
    refresh_token: tok.refreshToken,
    client_id: auth.clientId
  });
  if (r.ok !== true) return tok;
  return readOauthToken();
}
/** 发起授权：生成 PKCE + loopback 监听 + 打开系统浏览器 */
async function startOauthFlow(auth, entryId) {
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(16));
  let server;
  const port = await new Promise((resolve, reject) => {
    server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      res.setHeader("content-type", "text/html; charset=utf-8");
      if (url.pathname === "/callback" && url.searchParams.get("code") && url.searchParams.get("state") === (pendingOauth?.state ?? "")) {
        const code = url.searchParams.get("code");
        const r = await exchangeOauthToken(auth, {
          grant_type: "authorization_code",
          code,
          redirect_uri: pendingOauth?.redirectUri ?? "",
          client_id: auth.clientId,
          code_verifier: pendingOauth?.verifier ?? "",
          resource: auth.resource ?? ""
        });
        res.end(r.ok ? "<h3>授权成功 ✓ 可关闭此页并返回 DSH 设置页</h3>" : `<h3>授权失败</h3><p>${r.error ?? ""}</p>`);
        pendingOauth = null;
        server.close();
      } else {
        res.end("<h3>无效回调</h3>");
      }
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  pendingOauth = { verifier, redirectUri, state, expiresAt: Date.now() + 10 * 60_000 };
  const params = new URLSearchParams({
    client_id: auth.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: (auth.scopes ?? []).join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: auth.resource ?? "",
    state
  });
  const authorizeUrl = auth.authorizationEndpoint + "?" + params.toString();
  const child = spawn("open", [authorizeUrl], { detached: true, stdio: "ignore" });
  child.unref();
  return { ok: true, port, authorizeUrl, hint: "已在系统浏览器打开 PixPix 授权页；完成授权后自动回跳并保存 token。" };
}

async function readMcpServers() {
  try {
    const raw = await readFile(MCP_FILE, "utf8");
    const d = JSON.parse(raw);
    if (Array.isArray(d?.servers)) {
      // 按 id 合并：用户文件覆盖 enabled 等运行时状态，默认条目补齐静态元数据（capabilities/toolCount/auth）
      const fileMap = new Map(d.servers.map((s) => [s.id, s]));
      const merged = DEFAULT_MCP_SERVERS.map((def) => (fileMap.has(def.id) ? { ...def, ...fileMap.get(def.id) } : def));
      // 对称合并：保留用户文件中非默认 id 的条目（自定义 MCP 不丢失，追加在默认之后）
      const mergedIds = new Set(merged.map((s) => s.id));
      for (const s of d.servers) {
        if (s && s.id && !mergedIds.has(s.id)) merged.push(s);
      }
      return merged;
    }
  } catch { /* 缺省 */ }
  return DEFAULT_MCP_SERVERS;
}
async function writeMcpServers(servers) {
  const dir = MCP_FILE.slice(0, MCP_FILE.lastIndexOf("/"));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(MCP_FILE, JSON.stringify({ servers }, null, 2), { mode: 0o600 });
}
const globalMcpToolMeta = new Map();
/** 抓取 streamable-http 服务器的工具元数据（15s 超时、失败静默、不阻塞挂载） */
async function fetchMcpToolMeta(entry, headers) {
  const url = entry.url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const base = {
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(headers ?? {})
      },
      signal: controller.signal
    };
    const init = await fetch(url, {
      ...base,
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "dsh-wanzh-hulian", version: "0.1" } } })
    });
    const initBody = await init.json().catch(() => null);
    if (!init.ok || !initBody?.result) return null;
    const sessionId = init.headers.get("mcp-session-id");
    const sidHeaders = { ...base.headers, ...(sessionId ? { "mcp-session-id": sessionId } : {}) };
    await fetch(url, { ...base, headers: sidHeaders, method: "POST", body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }).catch(() => {});
    const list = await fetch(url, { ...base, headers: sidHeaders, method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) });
    const listBody = await list.json().catch(() => null);
    if (!list.ok || !listBody?.result) return null;
    const tools = (Array.isArray(listBody.result.tools) ? listBody.result.tools : []).map((t) => {
      const name = String(t?.name ?? "");
      const biz = PIXPIX_BUSINESS_META[name];
      return {
        name,
        description: String(t?.description ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
        businessName: biz?.name ?? "",
        businessDesc: biz?.desc ?? "",
        scene: biz?.scene ?? ""
      };
    }).filter((t) => t.name);
    return {
      tools,
      instructions: typeof initBody.result.instructions === "string" ? initBody.result.instructions.slice(0, 1200) : "",
      source: "live",
      fetchedAt: Date.now()
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 挂载启用中的 MCP 服务器（内置 dsh-mcp-client，工具名 mcp__<server>__<tool>） */
async function mountMcpServers(ctx, credentials) {
  const servers = await readMcpServers();
  const states = [];
  for (const s of servers) {
    if (s?.enabled !== true) { states.push({ id: s.id, enabled: false, status: "disabled" }); continue; }
    const env = {};
    for (const [k, ref] of Object.entries(s.envRefs ?? {})) {
      try {
        const r = credentials ? await credentials.resolve(ref) : undefined;
        if (typeof r?.value === "string" && r.value) env[k] = r.value;
      } catch { /* 未配置 */ }
    }
    const config = {
      transport: s.transport === "streamable-http" ? "streamable-http" : "stdio",
      serverName: String(s.id ?? "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 32) || "mcp",
      command: String(s.command ?? ""),
      args: Array.isArray(s.args) ? s.args.map(String) : [],
      env,
      cwd: "",
      failOnStartupError: false
    };
    if (config.transport === "streamable-http") { config.url = String(s.url ?? ""); config.headers = { ...(s.headers ?? {}) }; }
    if (s.auth?.type === "oauth-pkce") {
      const tok = await ensureOauthToken(s.auth);
      if (!tok || !tok.accessToken) { states.push({ id: s.id, enabled: true, status: "unauthorized", error: "未授权：请在设置页点击「浏览器授权」完成 PixPix OAuth。" }); continue; }
      config.headers.authorization = `Bearer ${tok.accessToken}`;
    }
    try {
      await ctx.plugin(McpClient, config);
      states.push({ id: s.id, enabled: true, status: "running" });
      // 工具元数据抓取（streamable-http；失败静默，缓存内存）
      if (config.transport === "streamable-http" && config.url) {
        fetchMcpToolMeta(s, config.headers).then((meta) => {
          if (meta) globalMcpToolMeta.set(s.id, meta);
        }).catch(() => {});
      }
    } catch (e) {
      states.push({ id: s.id, enabled: true, status: "error", error: String(e?.message ?? e).slice(0, 200) });
    }
  }
  return states;
}

const CLI_CONFIG_FILE = join(homedir(), ".getnote", "config.json");
async function readCliConfig() {
  try {
    const raw = await readFile(CLI_CONFIG_FILE, "utf8");
    const d = JSON.parse(raw);
    return {
      apiKey: typeof d?.api_key === "string" ? d.api_key.trim() : "",
      clientId: typeof d?.client_id === "string" ? d.client_id.trim() : "",
      cliAuthed: typeof d?.api_key === "string" && d.api_key.trim() !== ""
    };
  } catch { return { apiKey: "", clientId: "", cliAuthed: false }; }
}
async function resolveCreds(credentials) {
  const out = { apiKey: undefined, clientId: undefined, configured: false, source: "none", cliAuthed: false };
  if (credentials !== undefined) {
    try {
      const k = await credentials.resolve(GETNOTE.auth.apiKeyRef);
      const c = await credentials.resolve(GETNOTE.auth.clientIdRef);
      out.apiKey = typeof k?.value === "string" ? k.value : undefined;
      out.clientId = typeof c?.value === "string" ? c.value : undefined;
    } catch { /* 未配置 */ }
  }
  if (out.apiKey && out.clientId) { out.source = "form"; out.configured = true; }
  else {
    // P2：CLI 登录态回退（~/.getnote/config.json，0600；用户浏览器授权后无需手填表单）
    const cli = await readCliConfig();
    out.cliAuthed = cli.cliAuthed;
    if (!out.apiKey) out.apiKey = cli.apiKey || undefined;
    if (!out.clientId) out.clientId = cli.clientId || undefined;
    out.source = out.apiKey && out.clientId ? "cli" : "none";
    out.configured = Boolean(out.apiKey && out.clientId);
  }
  return out;
}

async function getnoteRequest(credentials, method, path, params, data, signal) {
  const creds = await resolveCreds(credentials);
  if (!creds.configured) {
    return {
      ok: false,
      error: "未配置得到大脑凭据：请在 设置 → 万物互联 → 得到大脑 卡片填写 API Key 与 Client ID（前往 https://www.biji.com/openapi 应用管理获取；需得到大脑会员）。"
    };
  }
  const url = new URL(API_BASE + path);
  if (params) for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        "x-client-id": creds.clientId,
        // 官方文档：Authorization 直接放 API Key（无 Bearer 前缀）
        authorization: creds.apiKey
      },
      body: data !== undefined ? JSON.stringify(data) : undefined,
      signal: controller.signal
    });
    const text = await res.text();
    let body;
    try { body = parseJsonPreservingLargeIntegerStrings(text); } catch { body = null; }
    if (!res.ok) {
      const err = body?.error ?? {};
      const reason = err?.reason ? `（${err.reason}）` : "";
      return { ok: false, error: `得到大脑 API HTTP ${res.status}${reason}: ${err?.message ?? text.slice(0, 200)}` };
    }
    if (body?.success !== true) {
      const err = body?.error ?? {};
      const reason = err?.reason ? `（${err.reason}）` : "";
      return { ok: false, error: `得到大脑 API 失败${reason}: ${err?.message ?? "unknown"}` };
    }
    return { ok: true, data: body.data };
  } catch (error) {
    return { ok: false, error: `得到大脑请求失败: ${error?.message ?? error}` };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/* ── 工具执行入口（连接开关热闸门） ──────────────────────────────────── */
async function gate() {
  const state = await readState();
  if (!state.enabled) return { disconnected: true };
  return { disconnected: false };
}
function renderText(_args, value) {
  if (value?.disconnected === true) return [{ type: "text", text: "得到大脑连接已断开：请在 设置 → 万物互联 → 得到大脑 卡片打开连接总开关。" }];
  if (value?.ok !== true) return [{ type: "text", text: value?.error ?? "得到大脑操作失败" }];
  return [{ type: "text", text: typeof value.text === "string" ? value.text : JSON.stringify(value.data ?? value, null, 2) }];
}
function textOutput() {
  return { schema: { type: "object", additionalProperties: true }, render: renderText };
}

/* ── 路由 ─────────────────────────────────────────────────────────────── */
async function handleList(credentials) {
  const state = await readState();
  const creds = await resolveCreds(credentials);
  const conns = await readConnections();
  const connections = [];
  for (const conn of conns) {
    const item = { ...conn };
    const st = {
      enabled: conn.enabled !== false,
      modelInvoke: conn.id === "getnote-brain" ? state.modelInvoke : undefined,
      defaultTopicId: conn.id === "getnote-brain" ? (state.defaultTopicId ?? null) : null,
      cliAuthed: conn.id === "getnote-brain" ? creds.cliAuthed : false,
      credSource: conn.id === "getnote-brain" ? creds.source : "none"
    };
    if (conn.id === "getnote-brain") {
      st.apiKeyConfigured = Boolean(creds.apiKey);
      st.clientIdConfigured = Boolean(creds.clientId);
    } else {
      // 通用：按 authFields 逐 ref 检查配置态
      for (const f of conn.authFields ?? []) {
        try {
          const r = await credentials.resolve(f.ref);
          st[f.ref + "Configured"] = typeof r?.value === "string" && r.value !== "";
          if (typeof r?.value === "string" && r.value) st.credSource = st.credSource === "none" ? "form" : st.credSource;
        } catch { st[f.ref + "Configured"] = false; }
      }
    }
    // getnote 旧字段兼容
    if (conn.id === "getnote-brain") {
      item.tools = GETNOTE.tools;
      item.command = conn.command ?? GETNOTE.command;
      item.oauthCmd = conn.oauthCmd;
    }
    item.state = st;
    connections.push(item);
  }
  const boards = BOARDS.map((b) => ({
    ...b,
    connections: connections.filter((x) => x.board === b.key).map((x) => x.id)
  }));
  return {
    status: 200,
    body: { ok: true, boards, connections }
  };
}

async function handleTopics(credentials) {
  const r = await getnoteRequest(credentials, "GET", "/resource/knowledge/list", { scope: "DEFAULT" });
  if (r.ok !== true) return { status: 200, body: { ok: false, error: r.error } };
  const topics = (Array.isArray(r.data?.topics) ? r.data.topics : []).map((t) => ({
    id: String(t.id ?? ""),
    name: String(t.name ?? ""),
    cover: typeof t.cover === "string" ? t.cover : "",
    noteCount: typeof t.stats?.note_count === "number" ? t.stats.note_count : null,
    fileCount: typeof t.stats?.file_count === "number" ? t.stats.file_count : null,
    scope: typeof t.scope === "string" ? t.scope : "DEFAULT"
  }));
  return { status: 200, body: { ok: true, topics, total: r.data?.total ?? topics.length } };
}

async function handleDefaultTopic(body) {
  const topicId = typeof body?.topicId === "string" ? body.topicId.trim() : "";
  const state = await writeState({ defaultTopicId: topicId === "" ? null : topicId });
  return { status: 200, body: { ok: true, defaultTopicId: state.defaultTopicId ?? null } };
}

async function handleToggle(credentials, body) {
  const id = typeof body?.id === "string" ? body.id : "";
  const conns = await readConnections();
  const conn = conns.find((x) => x.id === id);
  if (!conn) return { status: 400, body: { ok: false, error: "未知连接 id" } };
  const field = body?.field;
  const value = body?.value === true;
  if (field === "enabled") {
    conn.enabled = value;
    await writeConnections(conns);
    // 联动：kind=mcp 的连接同步其 mcp-servers 条目 enabled
    if (typeof conn.mcpServerId === "string" && conn.mcpServerId) {
      const mcp = await readMcpServers();
      const idx = mcp.findIndex((s) => s.id === conn.mcpServerId);
      if (idx >= 0) { mcp[idx].enabled = value; await writeMcpServers(mcp); }
    }
    return { status: 200, body: { ok: true, id, enabled: value, restart: true, hint: "已保存；MCP 挂载变更重启 DSH 生效。" } };
  }
  if (field === "modelInvoke" && id === "getnote-brain") {
    const state = await writeState({ modelInvoke: value });
    await setSkillModelInvoke(value);
    return { status: 200, body: { ok: true, enabled: state.enabled, modelInvoke: state.modelInvoke } };
  }
  return { status: 400, body: { ok: false, error: "field 必须为 enabled（modelInvoke 仅得到大脑支持）" } };
}

async function handleCredentialSet(credentials, ref, value) {
  if (credentials === undefined) return { status: 501, body: { ok: false, error: "credentials 服务不可用" } };
  if (!(await collectCredentialRefs()).includes(ref)) return { status: 400, body: { ok: false, error: "未知凭据 ref" } };
  if (typeof value !== "string" || value.trim() === "") return { status: 400, body: { ok: false, error: "值不能为空" } };
  try {
    await credentials.set(ref, value.trim());
    const info = await credentials.describe(ref);
    return { status: 200, body: { ok: true, ref, configured: info?.configured === true } };
  } catch (error) {
    return { status: 500, body: { ok: false, error: String(error?.message ?? error) } };
  }
}

async function handleProbe(credentials) {
  const quota = await getnoteRequest(credentials, "GET", "/resource/rate-limit/quota");
  if (quota.ok !== true) return { status: 200, body: { ok: false, error: quota.error } };
  const topics = await getnoteRequest(credentials, "GET", "/resource/knowledge/list", { scope: "DEFAULT" });
  return {
    status: 200,
    body: {
      ok: true,
      quota: quota.data,
      topics: topics.ok === true ? { total: topics.data?.total ?? 0, count: Array.isArray(topics.data?.topics) ? topics.data.topics.length : 0 } : null
    }
  };
}

async function resolveShopifyCreds(credentials) {
  const out = { domain: undefined, token: undefined, clientId: undefined, clientSecret: undefined, configured: false, mode: "none" };
  if (credentials === undefined) return out;
  try {
    const d = await credentials.resolve("shopify_domain");
    const t = await credentials.resolve("shopify_access_token");
    const cid = await credentials.resolve("shopify_client_id");
    const cs = await credentials.resolve("shopify_client_secret");
    out.domain = typeof d?.value === "string" ? d.value.trim() : undefined;
    out.token = typeof t?.value === "string" ? t.value : undefined;
    out.clientId = typeof cid?.value === "string" ? cid.value.trim() : undefined;
    out.clientSecret = typeof cs?.value === "string" ? cs.value : undefined;
    if (out.domain && out.clientId && out.clientSecret) { out.mode = "client-credentials"; out.configured = true; }
    else if (out.domain && out.token) { out.mode = "token"; out.configured = true; }
  } catch { /* 未配置 */ }
  return out;
}
/** 连接探测处理器注册表（probe.kind → handler） */
async function probeConnection(credentials, conn) {
  const kind = conn?.probe?.kind ?? "";
  if (kind === "getnote") {
    const quota = await getnoteRequest(credentials, "GET", "/resource/rate-limit/quota");
    if (quota.ok !== true) return { ok: false, error: quota.error };
    const topics = await getnoteRequest(credentials, "GET", "/resource/knowledge/list", { scope: "DEFAULT" });
    return {
      ok: true,
      text: ["连接测试通过 ✓"].concat(
        quota.data ? [
          "配额 read 日: " + (quota.data.read?.daily ? quota.data.read.daily.used + " / " + quota.data.read.daily.limit : "-"),
          "配额 write 日: " + (quota.data.write?.daily ? quota.data.write.daily.used + " / " + quota.data.write.daily.limit : "-")
        ] : []
      ).concat(topics.ok === true ? ["知识库总数: " + (topics.data?.total ?? 0)] : []).join("\n")
    };
  }
  if (kind === "shopify-shop-info") {
    const creds = await resolveShopifyCreds(credentials);
    if (!creds.configured) return { ok: false, error: "未配置 Shopify 凭证：请填写商店域名 + 客户端 ID + 加密密钥（开发仪表盘应用的 API 凭据，插件自动换取访问令牌）。" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let token = creds.token;
    let via = "Admin API Token";
    try {
      if (!token) {
        // 客户端凭据流：client_id + client_secret → /admin/oauth/access_token 换取访问令牌
        const exc = await fetch(`https://${creds.domain}/admin/oauth/access_token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "client_credentials", client_id: creds.clientId, client_secret: creds.clientSecret }),
          signal: controller.signal
        });
        const excBody = await exc.json().catch(() => null);
        if (!exc.ok) return { ok: false, error: `Shopify 令牌交换失败 (HTTP ${exc.status}): ${excBody?.error_description || excBody?.error || "请求失败"}` };
        token = excBody?.access_token;
        via = "客户端凭据（已自动换取访问令牌）";
        if (!token) return { ok: false, error: "Shopify 令牌交换失败：响应缺少 access_token" };
      }
      const url = `https://${creds.domain}/admin/api/2026-04/shop.json`;
      const res = await fetch(url, { headers: { "x-shopify-access-token": token }, signal: controller.signal });
      const body = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, error: `Shopify API HTTP ${res.status}: ${body?.errors ? String(body.errors) : "请求失败"}` };
      return { ok: true, text: `连接测试通过 ✓\n认证方式: ${via}\n店铺: ${body?.shop?.name ?? "（无名称）"}\n计划: ${body?.shop?.plan_name ?? "-"}\n域名: ${body?.shop?.myshopify_domain ?? creds.domain}` };
    } catch (e) {
      return { ok: false, error: `Shopify 请求失败: ${e?.message ?? e}` };
    } finally { clearTimeout(timer); }
  }
  return { ok: false, error: `未知探测类型: ${kind}` };
}

/** 外部链接白名单（设置页「打开开放平台」等按钮，用系统默认浏览器打开） */
const EXTERNAL_HOSTS = new Set(["biji.com", "www.biji.com", "openapi.biji.com", "doc.biji.com", "app.biji.com", "admin.shopify.com", "shopify.dev", "www.shopify.com"]);
async function handleOpenUrl(body) {
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) return { status: 400, body: { ok: false, error: "url 不能为空" } };
  let parsed;
  try { parsed = new URL(url); } catch { return { status: 400, body: { ok: false, error: "url 非法" } }; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { status: 400, body: { ok: false, error: "仅允许 http/https" } };
  if (!EXTERNAL_HOSTS.has(parsed.hostname)) return { status: 400, body: { ok: false, error: "域名不在白名单内" } };
  const cmd = process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : ["xdg-open", [url]];
  try {
    const child = spawn(cmd[0], cmd[1], { detached: true, stdio: "ignore" });
    child.unref();
    return { status: 200, body: { ok: true } };
  } catch (error) {
    return { status: 500, body: { ok: false, error: String(error?.message ?? error) } };
  }
}

/* ── apply ────────────────────────────────────────────────────────────── */
export function apply(ctx) {
  const credentials = ctx.credentials ?? ctx.get("credentials");
  toolCtx = { credentials };
  ctx.effect(() => {
    mountMcpServers(ctx, credentials).then((states) => { globalMcpStates = states; }).catch(() => {});
  }, "dsh-wanzh-hulian: mcp mount");
  ctx.effect(() => {
    ensureSkill().catch(() => {});
  }, "dsh-wanzh-hulian: ensure skill");
  ctx.effect(() => {
    ensurePixpixSkill().catch(() => {});
  }, "dsh-wanzh-hulian: ensure pixpix skill");
  ctx.effect(() => {
    ensureShopifySkill().catch(() => {});
  }, "dsh-wanzh-hulian: ensure shopify skill");

  for (const tool of GETNOTE.tools) {
    const def = toolDefs[tool];
    if (def) ctx.tools.register(def);
  }

  ctx.effect(() => {
    const disposeList = ctx.webServer.register({
      kind: "exact",
      path: BASE + "/list",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return sendJson(res, 401, { error: "unauthorized" });
        if (req.method !== "GET") return sendJson(res, 405, { error: "method not allowed" });
        try {
          const r = await handleList(credentials);
          sendJson(res, r.status, r.body);
        } catch (e) { sendJson(res, 500, { ok: false, error: String(e?.message ?? e) }); }
      }
    });
    const disposeToggle = ctx.webServer.register({
      kind: "exact",
      path: BASE + "/toggle",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return sendJson(res, 401, { error: "unauthorized" });
        if (req.method !== "POST") return sendJson(res, 405, { error: "method not allowed" });
        try {
          const r = await handleToggle(credentials, await readBody(req));
          sendJson(res, r.status, r.body);
        } catch (e) { sendJson(res, 500, { ok: false, error: String(e?.message ?? e) }); }
      }
    });
    const disposeCredential = ctx.webServer.register({
      kind: "exact",
      path: BASE + "/credential",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return sendJson(res, 401, { error: "unauthorized" });
        try {
          if (req.method === "POST") {
            const body = await readBody(req);
            const r = await handleCredentialSet(credentials, typeof body?.ref === "string" ? body.ref : "", body?.value);
            return sendJson(res, r.status, r.body);
          }
          return sendJson(res, 405, { error: "method not allowed" });
        } catch (e) { sendJson(res, 500, { ok: false, error: String(e?.message ?? e) }); }
      }
    });
    const disposeProbe = ctx.webServer.register({
      kind: "exact",
      path: BASE + "/probe",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return sendJson(res, 401, { error: "unauthorized" });
        if (req.method !== "POST") return sendJson(res, 405, { error: "method not allowed" });
        try {
          const body = await readBody(req);
          const id = typeof body?.id === "string" ? body.id : "getnote-brain";
          const conns = await readConnections();
          const conn = conns.find((x) => x.id === id);
          if (!conn) return sendJson(res, 404, { ok: false, error: "未知连接 id" });
          const r = await probeConnection(credentials, conn);
          sendJson(res, 200, r);
        } catch (e) { sendJson(res, 500, { ok: false, error: String(e?.message ?? e) }); }
      }
    });
    const disposeOauthStart = ctx.webServer.register({
      kind: "exact",
      path: BASE + "/oauth/start",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return sendJson(res, 401, { error: "unauthorized" });
        if (req.method !== "POST") return sendJson(res, 405, { error: "method not allowed" });
        try {
          const body = await readBody(req);
          const entryId = typeof body?.id === "string" ? body.id : "pixpix";
          const mcp = await readMcpServers();
          const entry = mcp.find((s) => s.id === entryId);
          if (!entry || entry.auth?.type !== "oauth-pkce") return sendJson(res, 400, { ok: false, error: "该条目不支持 OAuth 授权" });
          const r = await startOauthFlow(entry.auth, entryId);
          sendJson(res, 200, r);
        } catch (e) { sendJson(res, 500, { ok: false, error: String(e?.message ?? e) }); }
      }
    });
    const disposeOauthStatus = ctx.webServer.register({
      kind: "exact",
      path: BASE + "/oauth/status",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return sendJson(res, 401, { error: "unauthorized" });
        if (req.method !== "GET") return sendJson(res, 405, { error: "method not allowed" });
        const tok = await readOauthToken();
        if (!tok || !tok.accessToken) return sendJson(res, 200, { ok: true, authed: false });
        sendJson(res, 200, {
          ok: true, authed: true,
          expiresAt: tok.expiresAt,
          expired: tok.expiresAt > 0 && tok.expiresAt <= Date.now() + 60_000,
          hasRefresh: Boolean(tok.refreshToken),
          scope: tok.scope
        });
      }
    });
    const disposeMcpList = ctx.webServer.register({
      kind: "exact",
      path: BASE + "/mcp-servers",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return sendJson(res, 401, { error: "unauthorized" });
        try {
          if (req.method === "GET") {
            const servers = await readMcpServers();
            const states = globalMcpStates ?? servers.map((s) => ({ id: s.id, enabled: s?.enabled === true, status: "unknown" }));
            const tok = await readOauthToken();
            const oauthState = !tok || !tok.accessToken
              ? { authed: false }
              : { authed: true, expired: tok.expiresAt > 0 && tok.expiresAt <= Date.now() + 60_000, scope: tok.scope };
            return sendJson(res, 200, {
              ok: true,
              oauthState,
              servers: servers.map((s) => {
                let toolMeta = globalMcpToolMeta.get(s.id) ?? null;
                // 静态保底：三张卡永远有业务化清单（不再依赖实时抓取）；实时抓取仅作增强
                const staticDef = MCP_STATIC_TOOL_META[s.id];
                if (!toolMeta) toolMeta = staticToolMetaFor(s.id);
                else if (staticDef) {
                  toolMeta = { ...toolMeta, scenes: staticDef.scenes, example: staticDef.example };
                }
                return { ...s, state: states.find((x) => x.id === s.id) ?? null, toolMeta };
              })
            });
          }
          if (req.method === "POST") {
            const body = await readBody(req);
            const servers = await readMcpServers();
            const idx = servers.findIndex((s) => s.id === body?.id);
            if (idx < 0) return sendJson(res, 404, { ok: false, error: "未知服务器 id" });
            if (typeof body?.enabled === "boolean") servers[idx].enabled = body.enabled;
            await writeMcpServers(servers);
            return sendJson(res, 200, { ok: true, restart: true, hint: "MCP 服务器挂载在宿主启动时生效，请重启 DSH Desktop。" });
          }
          return sendJson(res, 405, { error: "method not allowed" });
        } catch (e) { sendJson(res, 500, { ok: false, error: String(e?.message ?? e) }); }
      }
    });
    const disposeAuthLogin = ctx.webServer.register({
      kind: "exact",
      path: BASE + "/auth-login",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return sendJson(res, 401, { error: "unauthorized" });
        if (req.method !== "POST") return sendJson(res, 405, { error: "method not allowed" });
        try {
          const child = spawn("getnote", ["auth", "login"], { detached: true, stdio: "ignore" });
          child.unref();
          return sendJson(res, 200, { ok: true, hint: "已在系统浏览器打开得到大脑授权页；完成授权后点「测试连接 + 配额」验证。" });
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String(error?.message ?? error) });
        }
      }
    });
    const disposeAuthStatus = ctx.webServer.register({
      kind: "exact",
      path: BASE + "/auth-status",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return sendJson(res, 401, { error: "unauthorized" });
        if (req.method !== "GET") return sendJson(res, 405, { error: "method not allowed" });
        const cli = await readCliConfig();
        sendJson(res, 200, { ok: true, cliAuthed: cli.cliAuthed });
      }
    });
    const disposeOpen = ctx.webServer.register({
      kind: "exact",
      path: BASE + "/open",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return sendJson(res, 401, { error: "unauthorized" });
        if (req.method !== "POST") return sendJson(res, 405, { error: "method not allowed" });
        try {
          const r = await handleOpenUrl(await readBody(req));
          sendJson(res, r.status, r.body);
        } catch (e) { sendJson(res, 500, { ok: false, error: String(e?.message ?? e) }); }
      }
    });
    const disposeTopics = ctx.webServer.register({
      kind: "exact",
      path: BASE + "/topics",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return sendJson(res, 401, { error: "unauthorized" });
        if (req.method !== "GET") return sendJson(res, 405, { error: "method not allowed" });
        try {
          const r = await handleTopics(credentials);
          sendJson(res, r.status, r.body);
        } catch (e) { sendJson(res, 500, { ok: false, error: String(e?.message ?? e) }); }
      }
    });
    const disposeDefaultTopic = ctx.webServer.register({
      kind: "exact",
      path: BASE + "/default-topic",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return sendJson(res, 401, { error: "unauthorized" });
        if (req.method !== "POST") return sendJson(res, 405, { error: "method not allowed" });
        try {
          const r = await handleDefaultTopic(await readBody(req));
          sendJson(res, r.status, r.body);
        } catch (e) { sendJson(res, 500, { ok: false, error: String(e?.message ?? e) }); }
      }
    });
    return () => {
      disposeList();
      disposeToggle();
      disposeCredential();
      disposeProbe();
      disposeOpen();
      disposeAuthLogin();
      disposeAuthStatus();
      disposeTopics();
      disposeDefaultTopic();
    };
  }, "dsh-wanzh-hulian: routes");
}

/* ── 7 个工具定义 ─────────────────────────────────────────────────────── */
const toolDefs = {};

toolDefs.getnote_topics = defineTool({
  name: "getnote_topics",
  description: "列出得到大脑（Get笔记）的知识库列表（含 DEFAULT 默认库）。",
  parameters: {},
  output: textOutput(),
  timeoutMs: API_TIMEOUT_MS,
  isConcurrencySafe: () => true,
  async execute(_args, exec) {
    const g = await gate();
    if (g.disconnected) return { disconnected: true };
    const ctx2 = toolCtx;
    const r = await getnoteRequest(ctx2.credentials, "GET", "/resource/knowledge/list", { scope: "DEFAULT" }, undefined, exec?.signal);
    if (r.ok !== true) return r;
    const topics = Array.isArray(r.data?.topics) ? r.data.topics : [];
    return { ok: true, text: topics.length === 0 ? "（没有知识库）" : topics.map((t, i) => `[${i + 1}] ${t.name}（id: ${t.id}${t.stats?.note_count !== undefined ? `，笔记 ${t.stats.note_count}` : ""}）`).join("\n") };
  }
});

toolDefs.getnote_recall = defineTool({
  name: "getnote_recall",
  description: "在得到大脑全部笔记中做语义搜索（自然语言）。返回相关笔记片段。",
  parameters: {
    query: { type: "string", required: true, description: "自然语言检索问题" },
    top_k: { type: "integer", description: "返回条数 1-10，默认 5" }
  },
  output: textOutput(),
  timeoutMs: API_TIMEOUT_MS,
  isConcurrencySafe: () => true,
  async execute(args, exec) {
    const g = await gate();
    if (g.disconnected) return { disconnected: true };
    const query = String(args?.query ?? "").trim();
    if (!query) return { ok: false, error: "query 不能为空" };
    const top_k = Math.min(10, Math.max(1, Number(args?.top_k) || 5));
    const r = await getnoteRequest(toolCtx.credentials, "POST", "/resource/recall", undefined, { query, top_k }, exec?.signal);
    if (r.ok !== true) return r;
    const results = Array.isArray(r.data?.results) ? r.data.results : [];
    return {
      ok: true,
      text: results.length === 0
        ? "没有找到相关笔记。"
        : results.map((it, i) => `[${i + 1}] ${it.title ?? ""}（note_id: ${it.note_id}）\n${String(it.content ?? "").slice(0, 600)}`).join("\n\n")
    };
  }
});

toolDefs.getnote_recall_kb = defineTool({
  name: "getnote_recall_kb",
  description: "在得到大脑指定知识库内做语义搜索（先 getnote_topics 获取知识库 id）。",
  parameters: {
    topic_id: { type: "string", required: true, description: "知识库 id（来自 getnote_topics）" },
    query: { type: "string", required: true, description: "自然语言检索问题" },
    top_k: { type: "integer", description: "返回条数 1-10，默认 5" }
  },
  output: textOutput(),
  timeoutMs: API_TIMEOUT_MS,
  isConcurrencySafe: () => true,
  async execute(args, exec) {
    const g = await gate();
    if (g.disconnected) return { disconnected: true };
    const topic_id = String(args?.topic_id ?? "").trim();
    const query = String(args?.query ?? "").trim();
    if (!topic_id) return { ok: false, error: "topic_id 不能为空（先调 getnote_topics 获取）" };
    if (!query) return { ok: false, error: "query 不能为空" };
    const top_k = Math.min(10, Math.max(1, Number(args?.top_k) || 5));
    const r = await getnoteRequest(toolCtx.credentials, "POST", "/resource/recall/knowledge", undefined, { topic_id, query, top_k }, exec?.signal);
    if (r.ok !== true) return r;
    const results = Array.isArray(r.data?.results) ? r.data.results : [];
    return {
      ok: true,
      text: results.length === 0
        ? "该知识库中没有找到相关笔记。"
        : results.map((it, i) => `[${i + 1}] ${it.title ?? ""}（note_id: ${it.note_id}）\n${String(it.content ?? "").slice(0, 600)}`).join("\n\n")
    };
  }
});

toolDefs.getnote_save = defineTool({
  name: "getnote_save",
  description: "把一段文字或一个 URL 保存为得到大脑笔记（可带标题、标签，可指定知识库）。",
  parameters: {
    content: { type: "string", required: true, description: "要保存的文字内容，或完整 URL（http/https）" },
    title: { type: "string", description: "可选笔记标题" },
    tags: { type: "array", items: { type: "string" }, description: "可选标签列表" },
    topic_id: { type: "string", description: "可选知识库 id（来自 getnote_topics），缺省存默认库" }
  },
  output: textOutput(),
  timeoutMs: API_TIMEOUT_MS,
  isConcurrencySafe: () => true,
  async execute(args, exec) {
    const g = await gate();
    if (g.disconnected) return { disconnected: true };
    const content = String(args?.content ?? "").trim();
    if (!content) return { ok: false, error: "content 不能为空" };
    const isLink = /^https?:\/\//i.test(content);
    const body = {
      content,
      note_type: isLink ? "link" : "plain_text"
    };
    if (isLink) body.link_url = content;
    if (typeof args?.title === "string" && args.title.trim()) body.title = args.title.trim();
    if (Array.isArray(args?.tags) && args.tags.length > 0) body.tags = args.tags.map((t) => String(t)).slice(0, 20);
    let targetTopicId = typeof args?.topic_id === "string" && args.topic_id.trim() ? args.topic_id.trim() : "";
    if (!targetTopicId) {
      const state = await readState();
      if (typeof state.defaultTopicId === "string" && state.defaultTopicId) targetTopicId = state.defaultTopicId;
    }
    if (targetTopicId) body.topic_id = targetTopicId;
    const r = await getnoteRequest(toolCtx.credentials, "POST", "/resource/note/save", undefined, body, exec?.signal);
    if (r.ok !== true) return r;
    return { ok: true, text: `已保存到得到大脑${targetTopicId ? `（知识库 id: ${targetTopicId}）` : "（默认库）"}。${r.data?.note_id ? `note_id: ${r.data.note_id}` : ""}` };
  }
});

toolDefs.getnote_list = defineTool({
  name: "getnote_list",
  description: "列出得到大脑最近笔记（游标分页）。",
  parameters: {
    limit: { type: "integer", description: "返回条数 1-100，默认 20" },
    cursor: { type: "string", description: "可选分页游标（上次返回的 cursor）" }
  },
  output: textOutput(),
  timeoutMs: API_TIMEOUT_MS,
  isConcurrencySafe: () => true,
  async execute(args, exec) {
    const g = await gate();
    if (g.disconnected) return { disconnected: true };
    const limit = Math.min(100, Math.max(1, Number(args?.limit) || 20));
    const params = { limit };
    if (typeof args?.cursor === "string" && args.cursor) params.cursor = args.cursor;
    const r = await getnoteRequest(toolCtx.credentials, "GET", "/resource/note/list", params, undefined, exec?.signal);
    if (r.ok !== true) return r;
    const notes = Array.isArray(r.data?.notes) ? r.data.notes : [];
    const lines = notes.map((n, i) => {
      const tagNames = (Array.isArray(n.tags) ? n.tags : []).map((t) => (t && t.name ? t.name : String(t))).join("、");
      const topicNames = (Array.isArray(n.topics) ? n.topics : []).map((t) => (t && t.name ? t.name : String(t))).join("、");
      const noteId = n.note_id ?? n.id ?? "";
      return `[${i + 1}] ${n.title ?? "（无标题）"}（note_id: ${noteId}，${n.created_at ?? ""}${tagNames ? "，标签：" + tagNames : ""}${topicNames ? "，库：" + topicNames : ""}）`;
    });
    if (r.data?.cursor) lines.push(`（还有更多，下一页 cursor: ${r.data.cursor}）`);
    return { ok: true, text: lines.length > 0 ? lines.join("\n") : "（没有笔记）" };
  }
});

toolDefs.getnote_get = defineTool({
  name: "getnote_get",
  description: "按 note_id 读取得到大脑笔记详情（内容全文）。",
  parameters: {
    note_id: { type: "string", required: true, description: "笔记 id（来自 getnote_list / getnote_recall）" }
  },
  output: textOutput(),
  timeoutMs: API_TIMEOUT_MS,
  isConcurrencySafe: () => true,
  async execute(args, exec) {
    const g = await gate();
    if (g.disconnected) return { disconnected: true };
    const note_id = String(args?.note_id ?? "").trim();
    if (!note_id) return { ok: false, error: "note_id 不能为空" };
    const r = await getnoteRequest(toolCtx.credentials, "GET", "/resource/note/detail", { id: note_id }, undefined, exec?.signal);
    if (r.ok !== true) return r;
    const d = r.data?.note ?? r.data ?? {};
    const tagNames = (Array.isArray(d.tags) ? d.tags : []).map((t) => (t && t.name ? t.name : String(t))).join("、");
    const topicNames = (Array.isArray(d.topics) ? d.topics : []).map((t) => (t && t.name ? t.name : String(t))).join("、");
    const head = `标题：${d.title ?? "（无标题）"}\n类型：${d.note_type ?? "unknown"} | 时间：${d.created_at ?? ""}${tagNames ? " | 标签：" + tagNames : ""}${topicNames ? " | 知识库：" + topicNames : ""}\n\n`;
    return { ok: true, text: head + String(d.content ?? "（无内容）") };
  }
});

toolDefs.getnote_quota = defineTool({
  name: "getnote_quota",
  description: "查询得到大脑 OpenAPI 调用配额（日/月用量与剩余）。",
  parameters: {},
  output: textOutput(),
  timeoutMs: API_TIMEOUT_MS,
  isConcurrencySafe: () => true,
  async execute(_args, exec) {
    const g = await gate();
    if (g.disconnected) return { disconnected: true };
    const r = await getnoteRequest(toolCtx.credentials, "GET", "/resource/rate-limit/quota", undefined, undefined, exec?.signal);
    if (r.ok !== true) return r;
    const fmt = (b) => b ? `used ${b.used} / limit ${b.limit}（remaining ${b.remaining}）` : "无数据";
    return {
      ok: true,
      text: `read 日: ${fmt(r.data?.read?.daily)}\nread 月: ${fmt(r.data?.read?.monthly)}\nwrite 日: ${fmt(r.data?.write?.daily)}\nwrite 月: ${fmt(r.data?.write?.monthly)}\nwrite_note 日: ${fmt(r.data?.write_note?.daily)}\nwrite_note 月: ${fmt(r.data?.write_note?.monthly)}`
    };
  }
});

/* ── 分类整理工具（12 个，两阶段制：盘点→方案确认→执行） ─────────────── */

toolDefs.getnote_update_note = defineTool({
  name: "getnote_update_note",
  description: "修改得到大脑笔记的标题/内容/标签（仅 plain_text 类型笔记可改内容；tags 传数组=整体替换标签）。",
  parameters: {
    note_id: { type: "string", required: true, description: "笔记 id" },
    title: { type: "string", description: "可选新标题" },
    content: { type: "string", description: "可选新内容（仅 plain_text 笔记）" },
    tags: { type: "array", items: { type: "string" }, description: "可选标签列表（整体替换）" }
  },
  output: textOutput(),
  timeoutMs: API_TIMEOUT_MS,
  isConcurrencySafe: () => true,
  async execute(args, exec) {
    const g = await gate();
    if (g.disconnected) return { disconnected: true };
    const note_id = String(args?.note_id ?? "").trim();
    if (!note_id) return { ok: false, error: "note_id 不能为空" };
    const body = { note_id };
    if (typeof args?.title === "string" && args.title.trim()) body.title = args.title.trim();
    if (typeof args?.content === "string" && args.content !== "") body.content = args.content;
    if (Array.isArray(args?.tags)) body.tags = args.tags.map((t) => String(t)).slice(0, 50);
    const r = await getnoteRequest(toolCtx.credentials, "POST", "/resource/note/update", undefined, body, exec?.signal);
    if (r.ok !== true) return r;
    return { ok: true, text: `已更新笔记 ${note_id}${r.data?.title ? `（标题：${r.data.title}）` : ""}` };
  }
});

toolDefs.getnote_add_tags = defineTool({
  name: "getnote_add_tags",
  description: "给得到大脑笔记追加标签。",
  parameters: {
    note_id: { type: "string", required: true, description: "笔记 id" },
    tags: { type: "array", items: { type: "string" }, required: true, description: "要追加的标签" }
  },
  output: textOutput(),
  timeoutMs: API_TIMEOUT_MS,
  isConcurrencySafe: () => true,
  async execute(args, exec) {
    const g = await gate();
    if (g.disconnected) return { disconnected: true };
    const note_id = String(args?.note_id ?? "").trim();
    const tags = Array.isArray(args?.tags) ? args.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20) : [];
    if (!note_id) return { ok: false, error: "note_id 不能为空" };
    if (tags.length === 0) return { ok: false, error: "tags 不能为空" };
    const r = await getnoteRequest(toolCtx.credentials, "POST", "/resource/note/tags/add", undefined, { note_id, tags }, exec?.signal);
    if (r.ok !== true) return r;
    return { ok: true, text: `已为笔记 ${note_id} 追加标签：${tags.join("、")}` };
  }
});

toolDefs.getnote_delete_tag = defineTool({
  name: "getnote_delete_tag",
  description: "删除得到大脑笔记的某个标签（需 tag_id，先用 getnote_get 读笔记拿标签 id）。",
  parameters: {
    note_id: { type: "string", required: true, description: "笔记 id" },
    tag_id: { type: "string", required: true, description: "标签 id（来自 getnote_get 返回的 tags）" }
  },
  output: textOutput(),
  timeoutMs: API_TIMEOUT_MS,
  isConcurrencySafe: () => true,
  async execute(args, exec) {
    const g = await gate();
    if (g.disconnected) return { disconnected: true };
    const note_id = String(args?.note_id ?? "").trim();
    const tag_id = String(args?.tag_id ?? "").trim();
    if (!note_id || !tag_id) return { ok: false, error: "note_id 与 tag_id 均不能为空" };
    const r = await getnoteRequest(toolCtx.credentials, "POST", "/resource/note/tags/delete", undefined, { note_id, tag_id }, exec?.signal);
    if (r.ok !== true) return r;
    return { ok: true, text: `已删除笔记 ${note_id} 的标签（tag_id: ${tag_id}）` };
  }
});

toolDefs.getnote_topic_notes = defineTool({
  name: "getnote_topic_notes",
  description: "列出得到大脑指定知识库内的笔记（游标/页码分页，盘点用）。",
  parameters: {
    topic_id: { type: "string", required: true, description: "知识库 id" },
    page: { type: "integer", description: "页码，从 1 开始，默认 1" }
  },
  output: textOutput(),
  timeoutMs: API_TIMEOUT_MS,
  isConcurrencySafe: () => true,
  async execute(args, exec) {
    const g = await gate();
    if (g.disconnected) return { disconnected: true };
    const topic_id = String(args?.topic_id ?? "").trim();
    if (!topic_id) return { ok: false, error: "topic_id 不能为空（先 getnote_topics）" };
    const page = Math.max(1, Number(args?.page) || 1);
    const r = await getnoteRequest(toolCtx.credentials, "GET", "/resource/knowledge/notes", { topic_id, page }, undefined, exec?.signal);
    if (r.ok !== true) return r;
    const notes = Array.isArray(r.data?.notes) ? r.data.notes : [];
    const lines = notes.map((n, i) => `[${(page - 1) * notes.length + i + 1}] ${n.title ?? "（无标题）"}（note_id: ${n.note_id}，${n.created_at ?? ""}${Array.isArray(n.tags) && n.tags.length > 0 ? "，标签：" + n.tags.join("、") : ""}）`);
    if (r.data?.has_more) lines.push(`（还有更多，下一页 page=${page + 1}）`);
    return { ok: true, text: lines.length > 0 ? `知识库 ${topic_id} 共 ${r.data?.total ?? notes.length} 条：\n` + lines.join("\n") : "该知识库没有笔记。" };
  }
});

toolDefs.getnote_move_to_topic = defineTool({
  name: "getnote_move_to_topic",
  description: "批量把笔记移入指定知识库（可指定文件夹；单次 ≤50 条；失败的 note_id 会原样回传）。",
  parameters: {
    topic_id: { type: "string", required: true, description: "目标知识库 id" },
    note_ids: { type: "array", items: { type: "string" }, required: true, description: "笔记 id 列表（≤50）" },
    directory_id: { type: "string", description: "可选目标文件夹 id（来自 getnote_topic_directories）" }
  },
  output: textOutput(),
  timeoutMs: API_TIMEOUT_MS,
  isConcurrencySafe: () => true,
  async execute(args, exec) {
    const g = await gate();
    if (g.disconnected) return { disconnected: true };
    const topic_id = String(args?.topic_id ?? "").trim();
    const note_ids = Array.isArray(args?.note_ids) ? args.note_ids.map((x) => String(x).trim()).filter(Boolean).slice(0, 20) : [];
    if (!topic_id || note_ids.length === 0) return { ok: false, error: "topic_id 与 note_ids 均不能为空（单次 ≤20 条）" };
    const body = { topic_id, note_ids };
    if (typeof args?.directory_id === "string" && args.directory_id.trim()) body.directory_id = args.directory_id.trim();
    const r = await getnoteRequest(toolCtx.credentials, "POST", "/resource/knowledge/note/batch-add", undefined, body, exec?.signal);
    if (r.ok !== true) return r;
    const failed = Array.isArray(r.data?.failed_note_ids) ? r.data.failed_note_ids : [];
    const direct = (r.data?.success_count ?? 0);
    // 失败笔记 = 已在他库：自动「定位原库 → 移出 → 重试入新库」（已在目标库则跳过）
    let migrated = 0, alreadyInTarget = 0, stillFailed = [];
    for (const id of failed) {
      try {
        await new Promise((res) => setTimeout(res, 250));
        const d = await getnoteRequest(toolCtx.credentials, "GET", "/resource/note/detail", { id }, undefined, exec?.signal);
        const topics = (d.ok === true && Array.isArray(d.data?.note?.topics) ? d.data.note.topics : []).map((t) => ({ id: String(t?.id ?? ""), name: String(t?.name ?? "") }));
        if (topics.some((t) => t.id === topic_id)) { alreadyInTarget += 1; continue; }
        let removed = false;
        for (const t of topics) {
          if (!t.id || t.id === topic_id) continue;
          await new Promise((res) => setTimeout(res, 250));
          const rm = await getnoteRequest(toolCtx.credentials, "POST", "/resource/knowledge/note/remove", undefined, { topic_id: t.id, note_ids: [id] }, exec?.signal);
          if (rm.ok === true) removed = true;
        }
        await new Promise((res) => setTimeout(res, 250));
        const add = await getnoteRequest(toolCtx.credentials, "POST", "/resource/knowledge/note/batch-add", undefined, { topic_id, note_ids: [id] }, exec?.signal);
        if (add.ok === true && !(Array.isArray(add.data?.failed_note_ids) && add.data.failed_note_ids.length > 0)) migrated += 1;
        else stillFailed.push(id);
      } catch (e) {
        stillFailed.push(id);
      }
    }
    const parts = [`移入成功 ${direct} 条`];
    if (migrated > 0) parts.push(`跨库迁移 ${migrated} 条（自动移出原库后入新库）`);
    if (alreadyInTarget > 0) parts.push(`已在目标库 ${alreadyInTarget} 条（跳过）`);
    if (stillFailed.length > 0) parts.push(`仍失败 ${stillFailed.length} 条（note_ids: ${stillFailed.join(", ")}）`);
    return { ok: true, text: parts.join("；") };
  }
});

toolDefs.getnote_remove_from_topic = defineTool({
  name: "getnote_remove_from_topic",
  description: "批量把笔记移出指定知识库（单次 ≤50 条；失败的 note_id 会原样回传）。",
  parameters: {
    topic_id: { type: "string", required: true, description: "知识库 id" },
    note_ids: { type: "array", items: { type: "string" }, required: true, description: "笔记 id 列表（≤50）" }
  },
  output: textOutput(),
  timeoutMs: API_TIMEOUT_MS,
  isConcurrencySafe: () => true,
  async execute(args, exec) {
    const g = await gate();
    if (g.disconnected) return { disconnected: true };
    const topic_id = String(args?.topic_id ?? "").trim();
    const note_ids = Array.isArray(args?.note_ids) ? args.note_ids.map((x) => String(x).trim()).filter(Boolean).slice(0, 50) : [];
    if (!topic_id || note_ids.length === 0) return { ok: false, error: "topic_id 与 note_ids 均不能为空（单次 ≤50 条）" };
    const r = await getnoteRequest(toolCtx.credentials, "POST", "/resource/knowledge/note/remove", undefined, { topic_id, note_ids }, exec?.signal);
    if (r.ok !== true) return r;
    const failed = Array.isArray(r.data?.failed_note_ids) ? r.data.failed_note_ids : [];
    return {
      ok: true,
      text: `移出成功 ${r.data?.removed_count ?? note_ids.length - failed.length} 条${failed.length > 0 ? "；失败 " + failed.length + " 条（note_ids: " + failed.join(", ") + "）" : ""}`
    };
  }
});

toolDefs.getnote_create_topic = defineTool({
  name: "getnote_create_topic",
  description: "创建得到大脑知识库（每日上限 50 个，超出返回 429）。",
  parameters: {
    name: { type: "string", required: true, description: "知识库名称" },
    description: { type: "string", description: "可选描述" }
  },
  output: textOutput(),
  timeoutMs: API_TIMEOUT_MS,
  isConcurrencySafe: () => true,
  async execute(args, exec) {
    const g = await gate();
    if (g.disconnected) return { disconnected: true };
    const name = String(args?.name ?? "").trim();
    if (!name) return { ok: false, error: "name 不能为空" };
    const body = { name };
    if (typeof args?.description === "string" && args.description.trim()) body.description = args.description.trim();
    const r = await getnoteRequest(toolCtx.credentials, "POST", "/resource/knowledge/create", undefined, body, exec?.signal);
    if (r.ok !== true) return r;
    return { ok: true, text: `已创建知识库「${r.data?.name ?? name}」（id: ${r.data?.id}）` };
  }
});

toolDefs.getnote_topic_directories = defineTool({
  name: "getnote_topic_directories",
  description: "浏览得到大脑知识库的文件夹与资源列表。",
  parameters: {
    topic_id: { type: "string", required: true, description: "知识库 id" },
    directory_id: { type: "string", description: "可选父文件夹 id（缺省根目录）" }
  },
  output: textOutput(),
  timeoutMs: API_TIMEOUT_MS,
  isConcurrencySafe: () => true,
  async execute(args, exec) {
    const g = await gate();
    if (g.disconnected) return { disconnected: true };
    const topic_id = String(args?.topic_id ?? "").trim();
    if (!topic_id) return { ok: false, error: "topic_id 不能为空" };
    const params = { topic_id };
    if (typeof args?.directory_id === "string" && args.directory_id.trim()) params.directory_id = args.directory_id.trim();
    const r = await getnoteRequest(toolCtx.credentials, "GET", "/resource/knowledge/directories", params, undefined, exec?.signal);
    if (r.ok !== true) return r;
    const dirs = Array.isArray(r.data?.directories) ? r.data.directories : [];
    const resources = Array.isArray(r.data?.resources) ? r.data.resources : [];
    const lines = [];
    if (r.data?.current_directory) lines.push(`当前位置：${r.data.current_directory.name ?? r.data.current_directory.id}`);
    dirs.forEach((d, i) => lines.push(`[文件夹${i + 1}] ${d.name}（directory_id: ${d.id}）`));
    lines.push(`资源数：${resources.length}（总计 ${r.data?.total ?? resources.length}）`);
    return { ok: true, text: lines.join("\n") };
  }
});

toolDefs.getnote_create_directory = defineTool({
  name: "getnote_create_directory",
  description: "在得到大脑知识库内创建文件夹。",
  parameters: {
    topic_id: { type: "string", required: true, description: "知识库 id" },
    name: { type: "string", required: true, description: "文件夹名称" },
    parent_id: { type: "string", description: "可选父文件夹 id" }
  },
  output: textOutput(),
  timeoutMs: API_TIMEOUT_MS,
  isConcurrencySafe: () => true,
  async execute(args, exec) {
    const g = await gate();
    if (g.disconnected) return { disconnected: true };
    const topic_id = String(args?.topic_id ?? "").trim();
    const name = String(args?.name ?? "").trim();
    if (!topic_id || !name) return { ok: false, error: "topic_id 与 name 均不能为空" };
    const body = { topic_id, name };
    if (typeof args?.parent_id === "string" && args.parent_id.trim()) body.parent_id = args.parent_id.trim();
    const r = await getnoteRequest(toolCtx.credentials, "POST", "/resource/knowledge/directory/create", undefined, body, exec?.signal);
    if (r.ok !== true) return r;
    return { ok: true, text: `已创建文件夹「${name}」（directory_id: ${r.data?.id}）` };
  }
});

toolDefs.getnote_update_directory = defineTool({
  name: "getnote_update_directory",
  description: "重命名或移动得到大脑知识库内的文件夹。",
  parameters: {
    topic_id: { type: "string", required: true, description: "知识库 id" },
    directory_id: { type: "string", required: true, description: "文件夹 id" },
    name: { type: "string", description: "可选新名称" },
    parent_id: { type: "string", description: "可选新父文件夹 id" }
  },
  output: textOutput(),
  timeoutMs: API_TIMEOUT_MS,
  isConcurrencySafe: () => true,
  async execute(args, exec) {
    const g = await gate();
    if (g.disconnected) return { disconnected: true };
    const topic_id = String(args?.topic_id ?? "").trim();
    const directory_id = String(args?.directory_id ?? "").trim();
    if (!topic_id || !directory_id) return { ok: false, error: "topic_id 与 directory_id 均不能为空" };
    const body = { topic_id, directory_id };
    if (typeof args?.name === "string" && args.name.trim()) body.name = args.name.trim();
    if (typeof args?.parent_id === "string" && args.parent_id.trim()) body.parent_id = args.parent_id.trim();
    const r = await getnoteRequest(toolCtx.credentials, "POST", "/resource/knowledge/directory/update", undefined, body, exec?.signal);
    if (r.ok !== true) return r;
    return { ok: true, text: `已更新文件夹 ${directory_id}` };
  }
});

toolDefs.getnote_delete_directory = defineTool({
  name: "getnote_delete_directory",
  description: "删除得到大脑知识库内的空文件夹（仅空文件夹可删）。",
  parameters: {
    topic_id: { type: "string", required: true, description: "知识库 id" },
    directory_id: { type: "string", required: true, description: "文件夹 id" }
  },
  output: textOutput(),
  timeoutMs: API_TIMEOUT_MS,
  isConcurrencySafe: () => true,
  async execute(args, exec) {
    const g = await gate();
    if (g.disconnected) return { disconnected: true };
    const topic_id = String(args?.topic_id ?? "").trim();
    const directory_id = String(args?.directory_id ?? "").trim();
    if (!topic_id || !directory_id) return { ok: false, error: "topic_id 与 directory_id 均不能为空" };
    const r = await getnoteRequest(toolCtx.credentials, "POST", "/resource/knowledge/directory/delete", undefined, { topic_id, directory_id }, exec?.signal);
    if (r.ok !== true) return r;
    return { ok: true, text: `已删除文件夹 ${directory_id}` };
  }
});

toolDefs.getnote_delete_note = defineTool({
  name: "getnote_delete_note",
  description: "删除得到大脑笔记（移入回收站，可在 App 端恢复）。",
  parameters: {
    note_id: { type: "string", required: true, description: "笔记 id" }
  },
  output: textOutput(),
  timeoutMs: API_TIMEOUT_MS,
  isConcurrencySafe: () => true,
  async execute(args, exec) {
    const g = await gate();
    if (g.disconnected) return { disconnected: true };
    const note_id = String(args?.note_id ?? "").trim();
    if (!note_id) return { ok: false, error: "note_id 不能为空" };
    const r = await getnoteRequest(toolCtx.credentials, "POST", "/resource/note/delete", undefined, { note_id }, exec?.signal);
    if (r.ok !== true) return r;
    return { ok: true, text: `已删除笔记 ${note_id}（移入回收站，可在得到大脑 App 恢复）` };
  }
});

/** execute 内部引用宿主 credentials（defineTool 闭包在 apply 之前创建，故用占位） */
let toolCtx = { credentials: undefined };
let globalMcpStates = null;

export { name, inject };
