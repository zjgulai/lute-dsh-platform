import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { atomicStore, CorruptStateError, isPlainObject } from "./atomic-store.js";
import { createOauthFlowRegistry } from "./oauth-flow.js";
import { BodyLimitError, readBoundedJson, SETTINGS_JSON_MAX_BYTES, SETTINGS_READ_DEADLINE_MS } from "./bounded-body.js";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { PIXPIX_BUSINESS_META, SHOPIFY_BUSINESS_META, APIFY_BUSINESS_META, MCP_STATIC_TOOL_META, staticToolMetaFor } from "./business-meta.js";
import * as McpClient from "@deepseek-ai/dsh-mcp-client";
import { buildBoards, errorMessage, fetchShopifyAdmin, mergeRegisteredTools, normalizeShopifyHost, resolveShopifyToken } from "./host-util.js";
import { BOARDS, GETNOTE_LOGO } from "./boards.js";

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
  const { connections } = await readConnections();
  for (const conn of connections) {
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

/**
 * 得到大脑凭证 ref：唯一来源是连接注册表 getnote-brain 的 authFields。
 * （历史上这里有第二份手工常量，注册表改 ref 时不会同步。）
 * @returns {{apiKeyRef: string, clientIdRef: string}}
 */
function registryRefs() {
  const fields = DEFAULT_CONNECTIONS.find((c) => c.id === "getnote-brain")?.authFields ?? [];
  const has = (ref) => fields.some((f) => f.ref === ref);
  return {
    apiKeyRef: has("getnote_api_key") ? "getnote_api_key" : "",
    clientIdRef: has("getnote_client_id") ? "getnote_client_id" : "",
  };
}

/** 已注册的得到大脑工具名。唯一来源是 toolDefs（文件末尾定义），而非手工清单。 */
function getnoteToolNames() {
  return Object.keys(toolDefs);
}

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

function sendJson(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders });
  res.end(JSON.stringify(body));
}
/**
 * 路由统一的错误出口。
 *
 * 损坏状态单列 409 + 结构化 body：设置页要能显示「哪一类损坏、哪个文件、为什么」，
 * 而 500 + 一句 message 让所有失败长得一样（这正是本卡要修的那种不可解释）。
 * 其余错误保持 500 原样。
 */
function sendError(res, e) {
  if (e?.code === "CORRUPT_STATE") {
    return sendJson(res, 409, {
      ok: false,
      code: "CORRUPT_STATE",
      error: e.message,
      file: displayPath(String(e.file ?? "")),
      reason: String(e.reason ?? "")
    });
  }
  // 请求体被有界读取器拒绝（SEC-RT-005）。状态码由错误自带（413/408/400），
  // body 只有上限数值与原因，**不含原文**——凭证不会顺着错误回显出去。
  // connection: close 是必须的：请求体没读完，这条连接不能再复用。
  if (e instanceof BodyLimitError) {
    return sendJson(res, e.status, { ok: false, code: e.code, error: e.message }, { connection: "close" });
  }
  return sendJson(res, 500, { ok: false, error: errorMessage(e) });
}
/**
 * 设置类端点的请求体读取（SEC-RT-005）。
 *
 * 本插件 12 条路由中读 body 的 7 条（toggle / credential / probe / oauth-start /
 * mcp-servers / open / default-topic）全部是「小型设置」形态：id、开关布尔值、
 * 一条凭证字符串、或一个 URL。最大者是凭证字符串，远小于 64 KiB，
 * 因此统一用一个上限，没有需要单独放宽的代理端点。
 * 上限、deadline 与错误语义见 bounded-body.js。
 */
function readBody(req) {
  return readBoundedJson(req, { maxBytes: SETTINGS_JSON_MAX_BYTES, deadlineMs: SETTINGS_READ_DEADLINE_MS });
}

/* ── 连接状态（双层开关） ────────────────────────────────────────────── */
const DEFAULT_STATE = { enabled: true, modelInvoke: false };
/**
 * 状态文件的健康读数（SEC-RT-006）。
 *
 * 旧实现 `catch { return { ...DEFAULT_STATE } }` 把两种完全不同的处境混成一种：
 * 「文件不存在」（用户从没动过开关 → 用默认值）与「文件损坏」（JSON 被截断 →
 * 旧实现**照样回退到 enabled:true**，于是能力在配置不可读的情况下保持开启，
 * 而用户看到的是一个正常的开关）。损坏必须 fail-closed 并且可解释。
 * @typedef {{ ok: true, source: "file" | "default" } | { ok: false, code: "state_corrupt", file: string, reason: string, excerpt: string }} StateHealth
 */

/** 把绝对路径折成 `~/…` 供设置页显示（不外传，仅本机渲染）。 */
function displayPath(file) {
  const home = homedir();
  return file.startsWith(home) ? `~${file.slice(home.length)}` : file;
}

/** 健康读数为好。`source: "default"` 表示文件不存在、用的是内置默认值。 */
function okHealth(source = "file") {
  return { ok: true, source };
}

/**
 * 结构化损坏读数：给设置页足以解释「哪一类损坏、哪个文件、为什么」的最小信息。
 *
 * `excerpt` 默认只带前 200 字符——它进的是**本机设置页**，不外传、不落日志。
 * 但凭证类文件（OAuth token）必须**整段不回显**：它的正文本身就是密钥，而
 * 「损坏时保留原字节取证」这条原则的受益者是磁盘上的原文件，不是 HTTP 响应体。
 * @param {string} code 机器可读的损坏类别。
 * @param {string} file 损坏文件路径。
 * @param {unknown} reason 解析失败原因。
 * @param {string} [raw] 损坏的原始字节。
 * @param {{ redactRaw?: boolean }} [options] `redactRaw=true` 时不回显任何原文（凭证类文件）。
 * @returns {object} 健康读数。
 */
function corruptHealth(code, file, reason, raw, { redactRaw = false } = {}) {
  return {
    ok: false,
    code,
    file: displayPath(file),
    reason: String(reason ?? "未知原因"),
    excerpt: redactRaw ? "" : typeof raw === "string" ? raw.slice(0, 200) : ""
  };
}

/**
 * 读一个 store 文件，**永不抛出**。
 *
 * `readJson` 把 ENOENT 转成结果、其余 fs 错误原样抛出——那是原语该有的诚实形状。
 * 但读出问题若能让一条路由以 rejected promise 结束，用户看到的就是「点了没反应」
 * （独立审证 2026-09-16 实测：token 文件是目录时 `/oauth/status` 请求悬挂）。
 * 因此这一层把任何 I/O 失败也降级成健康读数：能力照样关闭，原因照样可读，
 * 但没有一条读操作能炸掉调用方。`reason` 用独立的 `unreadable`，与「内容损坏」分开。
 * @param {string} file 目标文件。
 * @returns {Promise<object>} `readJson` 的结果，或 `{ok:false, reason:"unreadable"}`。
 */
async function readStoreJson(file) {
  try {
    return await atomicStore.readJson(file);
  } catch (e) {
    return { ok: false, reason: "unreadable", error: errorMessage(e), file };
  }
}

/** 损坏时的可执行指引（只给路径与动作，不指向尚不存在的界面）。 */
function repairHint(file) {
  return `请修复或删除 ${displayPath(file)} 后重试（该文件已损坏，能力不会用默认值覆盖它）。`;
}

/** 汇总多个健康读数：全好才算好，否则把问题逐条列出。 */
function mergeHealth(...readings) {
  const issues = readings.filter((h) => h?.ok === false);
  if (issues.length === 0) return { ok: true, issues: [] };
  return { ok: false, issues };
}

/** 一份状态文件坏了就必须停止写入的守卫（覆盖它等于抹掉唯一的取证来源）。 */
function assertWritable(health, file) {
  if (health?.ok === false) throw new CorruptStateError(file, health.reason, health.excerpt ?? "");
}

/**
 * 读取连接总开关 / 模型自动调用开关。
 *
 * 损坏时返回 **enabled:false + 结构化 health**，并把损坏的原始字节摘要一并带回：
 * 原文件不被改写（取证），能力保持关闭，设置页据此显示修复指引。
 * @returns {Promise<{ enabled: boolean, modelInvoke: boolean, defaultTopicId?: string | null, health: StateHealth }>} 归一化后的状态与健康读数。
 */
async function readState() {
  const r = await readStoreJson(STATE_FILE);
  if (r.ok && isPlainObject(r.value)) {
    return {
      enabled: r.value.enabled !== false,
      modelInvoke: r.value.modelInvoke === true,
      defaultTopicId: typeof r.value.defaultTopicId === "string" ? r.value.defaultTopicId : null,
      health: { ok: true, source: "file" }
    };
  }
  if (!r.ok && r.reason === "missing") {
    // 文件不存在：用户从未改过开关，用默认值（与损坏是两回事，不得混同）。
    return { ...DEFAULT_STATE, defaultTopicId: null, health: { ok: true, source: "default" } };
  }
  // 损坏**或形状不对**（可解析但不是对象、读不出来）一律 fail-closed。
  // 判据必须与写路径同一把尺子：`updateJson` 用 `isPlainObject` 拒写，
  // 若读路径用 `?.enabled !== false`，同一个文件会「读说健康、写说损坏」——
  // 而 `{"enabled": tru` 之外，`null` / `[]` / `123` 这些**可解析**的形状同样不可信。
  return {
    enabled: false,
    modelInvoke: false,
    defaultTopicId: null,
    health: corruptHealth(
      r.reason === "unreadable" ? "state_unreadable" : "state_corrupt",
      STATE_FILE,
      r.error ?? "内容不是 JSON 对象",
      r.raw
    )
  };
}
/**
 * 更新状态文件。
 *
 * 走原子 store 的串行读-改-写：同一句话说的「读到的旧值 + 本次变更」不会因为
 * 并发 toggle 互相覆盖，写失败也不会留下半个 JSON。损坏文件上**拒绝写入**
 * （`CorruptStateError` 由路由层转成结构化错误），因为覆盖它等于抹掉证据。
 * @param {Record<string, unknown>} next 本次要合并进去的字段。
 * @returns {Promise<Record<string, any>>} 合并后的完整状态。
 */
async function writeState(next) {
  return atomicStore.updateJson(STATE_FILE, (current) => ({ ...current, ...next }), {
    initial: { ...DEFAULT_STATE }
  });
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
    await atomicStore.writeText(PIXPIX_SKILL_FILE, PIXPIX_SKILL_TEMPLATE, { mode: 0o644 });
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
    await atomicStore.writeText(PIXPIX_SKILL_FILE, next, { mode: 0o644 });
  }
}
async function ensureSkill() {
  if (!existsSync(SKILL_FILE)) {
    await mkdir(SKILL_DIR, { recursive: true });
    await atomicStore.writeText(SKILL_FILE, SKILL_TEMPLATE, { mode: 0o644 });
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
    await atomicStore.writeText(SKILL_FILE, next, { mode: 0o644 });
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
    await atomicStore.writeText(SHOPIFY_SKILL_FILE, next, { mode: 0o644 });
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
    await atomicStore.writeText(SHOPIFY_SKILL_FILE, out, { mode: 0o644 });
  }
}

/* ── Apify MCP 技能（模型侧入口，与 business-meta 单一数据源联动） ─────────── */
const APIFY_SKILL_DIR = join(homedir(), ".dsh", "skills", "apify-mcp");
const APIFY_SKILL_FILE = join(APIFY_SKILL_DIR, "SKILL.md");
const APIFY_SKILL_MARKER = "<!-- business-meta v1 2026-09-08 -->";
function buildApifySkillTemplate() {
  const rows = Object.entries(APIFY_BUSINESS_META)
    .map(([tool, biz]) => {
      const tag = biz.readWrite === "execute" ? "（执行·先确认）" : "";
      return `| ${biz.scene} | ${biz.example} | ${tool}${tag} |`;
    })
    .join("\n");
  return `---
name: "apify-mcp"
title: "Apify 网页抓取"
description: "Apify MCP 工具：搜索与调用 Apify Store 的 Actor 完成网页抓取、数据提取与自动化任务；预置网页转 Markdown（web-fetch）与网页搜索抓取（rag-web-browser）。触发词：Apify、apify、Actor、调用 Actor。何时不用：不涉及 Apify 的普通网页浏览（用浏览器工具）；跨境选品 SKU 校验（用 cross-border-selection）；只设计采集字段不执行采集（用 web-scraping-plan-designer）。"
enabled: "true"
disable-model-invocation: false
user-invocable: true
input_contract: 一句抓取/自动化诉求（目标网址或数据需求），工具直连 Apify 平台执行
output_contract: 抓取结果（Markdown/列表数据）；付费 Actor 先报成本等你确认；长任务轮询到终态
example: 说「用 Apify 抓取这个网页并给我 markdown」→ 直接返回页面内容
---

# Apify 网页抓取 · 业务指引

本技能是「万物互联」中 **Apify（官方远程 MCP）** 的模型侧入口。12 个工具已挂载为 mcp__apify__ 前缀；本文件把「业务黑话」映射到正确工具。

## 业务场景速查（用户怎么说 → 用哪个工具）

| 场景 | 用户怎么说 | 首选工具（mcp__apify__ 前缀省略） |
| --- | --- | --- |
${rows}

## 标准工作流

1. **选工具**：网页内容直取优先用预置 apify--web_fetch（网页→Markdown）或 apify--rag_web_browser（搜索+抓取）；其他需求 search_actors 找合适 Actor。
2. **查参数**：调用任意 Actor 前必须 fetch_actor_details 拿输入 schema，按 schema 构造 input，禁止瞎编参数。
3. **提交**：call_actor 提交任务（waitSecs 设短，如 30-60s；超时未完成转轮询 get_actor_run）。
4. **取结果**：列表数据 get_dataset_items（datasetId 来自 run 结果），单条记录 get_key_value_store_record。
5. **止损**：跑偏或超额时 abort_actor_run 中止。

## 护栏（必须遵守）

1. **付费先确认**：调用付费 Actor 或大并发/大额度消耗前，先告知用户「该 Actor 计费/预计消耗」，得到确认后再调用。
2. **规模克制**：maxResults/limit 默认取小（如 10-20），用户明确要大才放大。
3. **错误原样转达**：额度不足、参数非法、限流等错误如实告知，不重试轰炸；工具缺陷可用 report_problem 反馈 Apify。
4. **数据真实**：只交付工具实际返回的数据，不编造抓取结果。
5. 凭证由宿主管理，模型不可见，禁止索取 API Token。

## 注意

- 平台文档查询用 search_apify_docs / fetch_apify_docs（Apify 与 Crawlee）。
- 两个预置工具名称含双连字符（apify--web_fetch / apify--rag_web_browser），调用时保持原样。
${APIFY_SKILL_MARKER}
`;
}
async function ensureApifySkill() {
  const next = buildApifySkillTemplate();
  if (!existsSync(APIFY_SKILL_FILE)) {
    await mkdir(APIFY_SKILL_DIR, { recursive: true });
    await atomicStore.writeText(APIFY_SKILL_FILE, next, { mode: 0o644 });
    return;
  }
  const text = await readFile(APIFY_SKILL_FILE, "utf8");
  if (!text.includes(APIFY_SKILL_MARKER)) {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    const dis = fm && /^disable-model-invocation:\s*(true|false)\s*$/m.exec(fm[1]);
    const usr = fm && /^user-invocable:\s*(true|false)\s*$/m.exec(fm[1]);
    let out = next;
    if (dis) out = out.replace("disable-model-invocation: false", "disable-model-invocation: " + dis[1]);
    if (usr) out = out.replace("user-invocable: true", "user-invocable: " + usr[1]);
    await atomicStore.writeText(APIFY_SKILL_FILE, out, { mode: 0o644 });
  }
}

async function setSkillModelInvoke(on) {
  await ensureSkill();
  // 读-改-写进排他槽位：两个并发的 modelInvoke 切换否则会各自读到同一份旧文本。
  await atomicStore.runExclusive(async () => {
    const text = await readFile(SKILL_FILE, "utf8");
    const next = text.replace(/^disable-model-invocation:\s*(true|false)\s*$/m, `disable-model-invocation: ${on ? "false" : "true"}`);
    if (next !== text) await atomicStore.writeText(SKILL_FILE, next, { mode: 0o644 });
  });
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
    oauthCmd: "npx @getnote/cli@1.7.2 auth login",
    platformUrl: "https://www.biji.com/openapi",
    docUrl: "https://www.biji.com/openapi?tab=skill",
    logo: GETNOTE_LOGO
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
  },
  {
    id: "apify",
    board: "enterprise",
    kind: "mcp",
    mcpServerId: "apify",
    title: "Apify",
    subtitle: "网页抓取 · Actor 市场",
    enabled: false,
    extras: [],
    authFields: [
      { ref: "apify_token", label: "API Token", placeholder: "apify_api_xxx", secret: true }
    ],
    probe: { kind: "apify-user-info" },
    capabilities: ["找 Actor", "调用 Actor", "取结果", "网页直取", "文档查询"],
    note: "Apify 官方 MCP：数千网页抓取/自动化 Actor（apify/rag-web-browser 与 apify/web-fetch 已预置）。付费 Actor 消耗账号月度额度，技能层已加成本确认护栏。",
    platformUrl: "https://console.apify.com",
    docUrl: "https://docs.apify.com/platform/integrations/mcp",
    logo: ""
  }
];
/**
 * 连接注册表（含健康读数）。
 *
 * 损坏时**不回退默认清单**：内置默认里 `getnote-brain` 是 `enabled:true`，
 * 回退等于把一个用户可能已经关掉的连接重新打开——这正是本卡要消灭的 fail-open。
 * 正确形态是保留卡片元数据（否则设置页连卡片都画不出来）但**逐条强制关闭**，
 * 同时把结构化 health 交回调用方。
 * @returns {Promise<{ connections: any[], health: object }>} 连接清单与健康读数。
 */
async function readConnections() {
  const r = await readStoreJson(CONNECTIONS_FILE);
  if (r.ok && isPlainObject(r.value) && Array.isArray(r.value.connections)) {
    const declared = r.value.connections;
    if (declared.length === 0) {
      // 合法 JSON、正确形状、但声明为空：文件**没坏**，只是没有任何连接被声明。
      // 保留内置卡片（设置页要留一个恢复入口）却逐条关闭——既不静默恢复默认的启用态，
      // 也不把这种情况判成损坏（判成损坏会让写入口一并拒绝，用户就再也没有恢复路径了）。
      return { connections: closedConnections(), health: okHealth() };
    }
    // 合并内置默认（新增连接字段的向后兼容）
    const byId = new Map(DEFAULT_CONNECTIONS.map((x) => [x.id, x]));
    return { connections: declared.map((x) => ({ ...(byId.get(x.id) ?? {}), ...x })), health: okHealth() };
  }
  if (!r.ok && r.reason === "missing") {
    // 文件不存在：用户从没改过连接清单 → 用内置默认（与损坏是两回事）。
    return { connections: DEFAULT_CONNECTIONS, health: okHealth("default") };
  }
  // 其余一切（不可解析 / 读不出来 / 顶层不是对象 / 缺 `connections` 字段或它不是数组）
  // 都按「不放行 + 拒绝写入 + 保留取证」处理。**没有 `connections` 字段不等于「没配过」**：
  // 文件已经在盘上，只是没有声明任何可用内容，拿默认清单顶上就是把功能重新打开。
  return {
    connections: closedConnections(),
    health: corruptHealth(
      r.reason === "unreadable" ? "connections_unreadable" : r.reason === "corrupt" ? "connections_corrupt" : "connections_schema",
      CONNECTIONS_FILE,
      r.error ?? "connections 不是数组",
      r.raw
    )
  };
}
/** 保留卡片元数据、逐条关闭：损坏或声明为空时，设置页仍能渲染且没有任何连接是放行的。 */
function closedConnections() {
  return DEFAULT_CONNECTIONS.map((c) => ({ ...c, enabled: false }));
}
/**
 * 连接注册表的读-改-写，整段进同一个排他槽位。
 *
 * 旧写法由调用方先 `readConnections()` 再 `writeConnections()`，中间隔着一个 await——
 * 两个并发 toggle 会各自读到同一份旧值，后写的吞掉先写的，而**两个请求都返回 200**
 * （独立审证 2026-09-16 实测 LOST UPDATE）。排他槽位把这段窗口关掉。
 *
 * 注意：槽位内部一律用**不排队**的 `writeJson`。在槽位里再调会排队的入口等于等自己，
 * 队列会当场抛错（挂死没有读数，报错才有）。
 * @template T
 * @param {(connections: any[]) => T | Promise<T>} mutator 在最新清单上做修改，返回要落盘的清单。
 * @returns {Promise<T>} mutator 的结果。
 */
async function mutateConnections(mutator) {
  return atomicStore.runExclusive(async () => {
    const { connections, health } = await readConnections();
    assertWritable(health, CONNECTIONS_FILE);
    const next = await mutator(connections);
    await atomicStore.writeJson(CONNECTIONS_FILE, { schemaVersion: 1, connections: next });
    return next;
  });
}

const MCP_FILE = join(homedir(), ".dsh", "integrations", "wanzh-hulian", "mcp-servers.json");
const DEFAULT_MCP_SERVERS = [
  {
    id: "shopify",
    name: "Shopify 商店（社区 MCP）",
    enabled: false,
    transport: "stdio",
    command: "npx",
    args: ["-y", "shopify-mcp@1.0.8"],
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
    args: ["-y", "@getnote/mcp@1.7.2"],
    envRefs: { GETNOTE_API_KEY: "getnote_api_key", GETNOTE_CLIENT_ID: "getnote_client_id" },
    capabilities: ["记笔记", "找笔记", "知识库管理", "内容订阅", "上传与配额", "删除与清理"],
    toolCount: 38,
    note: "官方 38 项能力全套（含订阅博主/直播、分享链接、转写原文等增量能力）。日常记笔记/搜索直接用上方「得到大脑」连接即可，两边数据同源；本卡开启后新增能力自动进对话。"
  },
  {
    id: "apify",
    name: "Apify（远程 MCP）",
    enabled: false,
    transport: "streamable-http",
    url: "https://mcp.apify.com/",
    headerRefs: { authorization: { ref: "apify_token", prefix: "Bearer " } },
    capabilities: ["找 Actor", "调用 Actor", "取结果", "网页直取", "文档查询"],
    toolCount: 12,
    note: "Apify 官方 MCP（已实测 v0.15.5）：12 工具，覆盖 Apify Store 数千 Actor（网页抓取/自动化/AI）。API Token 认证，付费 Actor 消耗账号月度额度（护栏见 apify-mcp 技能）。URL 保持官方默认（含预置 web-fetch / rag-web-browser）。"
  }
];
const OAUTH_FILE = join(homedir(), ".dsh", "integrations", "wanzh-hulian", "oauth-pixpix.json");
// 授权流程状态已收进 `oauthFlows`（见 oauth-flow.js）：这里不再有第二个家。

/* ── PixPix 工具业务化映射（业务视角：业务名 + 业务描述 + 场景分组） ─────────── */

function b64url(buf) { return Buffer.from(buf).toString("base64url"); }
/**
 * 读取 PixPix OAuth token。
 *
 * 损坏时返回 `token: null`（= 未授权，fail-closed），并带回结构化 health：
 * 旧实现 `catch { return null }` 把「没授权过」与「token 文件坏了」混成同一读数，
 * 于是「为什么突然要重新授权」在界面上无从解释。
 * @returns {Promise<{ token: { accessToken: string, refreshToken: string, expiresAt: number, scope: string } | null, health: object }>} token 与健康读数。
 */
async function readOauthToken() {
  const r = await readStoreJson(OAUTH_FILE);
  if (r.ok && isPlainObject(r.value)) {
    return {
      token: {
        accessToken: typeof r.value.access_token === "string" ? r.value.access_token : "",
        refreshToken: typeof r.value.refresh_token === "string" ? r.value.refresh_token : "",
        expiresAt: typeof r.value.expires_at === "number" ? r.value.expires_at : 0,
        scope: typeof r.value.scope === "string" ? r.value.scope : ""
      },
      health: okHealth()
    };
  }
  if (!r.ok && r.reason === "missing") return { token: null, health: okHealth("default") };
  // `redactRaw`：这个文件的正文**本身就是密钥**。「损坏时保留原字节取证」的受益者是
  // 磁盘上的原文件，不是 HTTP 响应体或渲染进程（独立审证 2026-09-16 实测会把 access_token 回显）。
  return {
    token: null,
    health: corruptHealth(
      r.reason === "unreadable" ? "oauth_token_unreadable" : "oauth_token_corrupt",
      OAUTH_FILE,
      r.error ?? "内容不是 JSON 对象",
      r.raw,
      { redactRaw: true }
    )
  };
}
/**
 * 写 token（原子 + 0600）。
 *
 * 与其余三个 store 不同：损坏时**归档后重写**而不是拒绝写入。这是本卡唯一的例外，
 * 理由是「拒绝写入」在这里等于把人关死——token 文件没有界面删除入口，而重新授权
 * 是唯一能把它写回正常的动作；拒绝写入则让重新授权**永远不可能成功**
 * （回调里抛错 → 浏览器收不到响应 → listener 要等 TTL 才收口）。
 * 原字节仍以 `<file>.corrupt-<ts>`（0600）留在盘上供取证。
 * @param {Record<string, unknown>} d token 载荷。
 * @returns {Promise<{ archived: string | null }>} 归档路径（无损坏内容时为 null）。
 */
async function writeOauthToken(d) {
  return atomicStore.replaceAfterArchive(OAUTH_FILE, d);
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
  const { token: tok, health } = await readOauthToken();
  if (health.ok === false) {
    // token 文件损坏 → 一律按未授权处理（能力关闭），并明确记录原因，不静默当「没授权过」。
    console.error(`[wanzh-hulian] PixPix OAuth token 文件损坏（${health.file}）：${health.reason}；已按未授权处理，请重新授权`);
    return null;
  }
  if (!tok || !tok.accessToken) return null;
  if (tok.expiresAt > Date.now() + 60_000) {
    // C1 健康面：过期前置检测（提前 48h 告警，避免到期当天才发现链路断）
    const remainingMs = tok.expiresAt - Date.now();
    if (remainingMs < 48 * 3600_000) {
      console.warn(`[wanzh-hulian] PixPix OAuth token 将在 ${Math.round(remainingMs / 3600_000)} 小时内过期，请留意设置页授权状态（自动刷新到期即触发）`);
    }
    return tok;
  }
  if (!tok.refreshToken) return tok; // 无 refresh 则按原样挂载（过期后工具 401 提示重授权）
  const r = await exchangeOauthToken(auth, {
    grant_type: "refresh_token",
    refresh_token: tok.refreshToken,
    client_id: auth.clientId
  });
  if (r.ok !== true) {
    // C1 修复（2026-09-10）：refresh 失败不再静默挂载过期 token——写错误日志并把
    // refreshFailed 状态经 token 元数据带回（挂载处据此标记 unhealthy 并提示重新授权）
    console.error(`[wanzh-hulian] PixPix OAuth refresh failed: ${r.error}（请在设置页重新授权）`);
    try {
      // 只在文件此刻仍可解析时才补元数据：`writeOauthToken` 对损坏文件会「归档后重写」，
      // 而这里手上只有元数据字段——拿它去覆盖等于把 token 换成一份没有 token 的文件。
      const raw = await readOauthTokenRaw();
      if (raw !== null) {
        await writeOauthToken({ ...raw, _refresh_failed_at: Date.now(), _refresh_error: String(r.error).slice(0, 200) });
      }
    } catch { /* 元数据写入失败不阻塞 */ }
    return tok;
  }
  return (await readOauthToken()).token;
}
/** 原样读回 token 文件对象；不可解析/读不出来时返回 null（调用方不得据此覆盖文件）。 */
async function readOauthTokenRaw() {
  const r = await readStoreJson(OAUTH_FILE);
  return r.ok && isPlainObject(r.value) ? r.value : null;
}
/**
 * 发起授权：生成 PKCE + loopback 监听 + 打开系统浏览器。
 *
 * 流程状态全部交给 registry 持有（SEC-RT-007）。旧实现把 `state`/`verifier`/
 * `redirectUri`/`expiresAt` 摊在一个模块级 `pendingOauth` 里，于是：
 *  - `expiresAt` 没有任何定时器读它 → 用户不完成授权，端口就永远听着；
 *  - 连点两次「授权」，第二次直接覆盖变量，第一次的 server 既没关、也不可能
 *    再校验成功 → 每次点击泄漏一个 listener；
 *  - 回调校验读的是**全局** state，而不是「这条 server 自己的 flow」。
 *
 * 现在：重复 start 采用「关闭旧 flow 后新建」（`superseded`），回调只认自己那条
 * flow 的 state/verifier/redirectUri，成功/失败/异常都走同一个幂等 close。
 * @param {any} auth entry 的 oauth-pkce 配置。
 * @param {string} entryId 连接 id（仅用于日志与回执）。
 * @returns {Promise<{ ok: true, port: number, authorizeUrl: string, expiresAt: number, superseded: boolean, hint: string }>} 授权入口信息。
 */
async function startOauthFlow(auth, entryId) {
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(16));
  /** @type {any} 先声明后赋值：回调句柄在 listen 之前就要引用它。 */
  let flow = null;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    res.setHeader("content-type", "text/html; charset=utf-8");
    // 只在 callback 路径上做交换；其他路径一律不接触 verifier。
    if (url.pathname !== "/callback") {
      res.end("<h3>无效回调</h3>");
      return;
    }
    if (flow === null || flow.closed) {
      // 已经超时/被取代/被卸载：这条监听不该再收到请求，如实拒绝而不是"成功"。
      res.end("<h3>授权流程已结束（超时或已被新的授权请求取代），请回到 DSH 设置页重新发起。</h3>");
      return;
    }
    const callbackState = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code");
    if (!code || callbackState !== flow.state) {
      // state 不匹配**不**消耗当前 flow：一个过期标签页的回调不应该把用户正在
      // 进行的授权打断（本机回环 + 仍在有效期内，flow 会由定时器自己收尾）。
      res.end("<h3>无效回调</h3>");
      return;
    }
    // 回调整段必须有错误边界：这里任何一个 await 抛错（网络失败、token 落盘失败、
    // 配置损坏）都会让 `res.end` 与 `flow.close` **一起被跳过** —— 用户浏览器停在空白页，
    // listener 一直留到 TTL 才收口，而"重新授权"恰恰是唯一能修好 token 文件的操作
    // （独立审证 2026-09-16 从代码链逐环指出）。finally 保证两条收尾都发生。
    let outcome = "provider-error";
    try {
      const r = await exchangeOauthToken(auth, {
        grant_type: "authorization_code",
        code,
        redirect_uri: flow.redirectUri ?? "",
        client_id: auth.clientId,
        code_verifier: flow.verifier ?? "",
        resource: auth.resource ?? ""
      });
      if (r.ok) outcome = "success";
      res.end(r.ok ? "<h3>授权成功 ✓ 可关闭此页并返回 DSH 设置页</h3>" : `<h3>授权失败</h3><p>${r.error ?? ""}</p>`);
    } catch (e) {
      // 兜底路径自己也不能再抛：它要把真实错误告诉用户，而不是制造一个新的静默失败。
      try {
        res.end(`<h3>授权失败</h3><p>${String(errorMessage(e))}</p><p>请回到 DSH 设置页重试；若反复失败，请检查 ${displayPath(OAUTH_FILE)} 是否可写。</p>`);
      } catch { /* 响应已经结束 */ }
    } finally {
      flow.close(outcome);
    }
  });
  const port = await new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address !== null ? address.port : 0);
    });
  });
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  const superseded = oauthFlows.activeCount() > 0;
  try {
    flow = oauthFlows.adopt({ server, port, state, verifier, redirectUri });
  } catch (error) {
    // adopt 被拒（registry 已卸载）时，这个 listener 还没有所有者：必须当场关掉，
    // 否则「拒绝新建」本身会变成一条新的端口泄漏路径。
    try { server.closeAllConnections?.(); } catch { /* 老版本没有该方法 */ }
    try { server.close(); } catch { /* 已经关了 */ }
    throw error;
  }
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
  return {
    ok: true,
    port,
    authorizeUrl,
    expiresAt: flow.expiresAt,
    superseded,
    hint: superseded
      ? "已取代上一次未完成的授权（旧端口已关闭）；已在系统浏览器打开 PixPix 授权页。"
      : "已在系统浏览器打开 PixPix 授权页；完成授权后自动回跳并保存 token。"
  };
}
/**
 * 进行中的 PixPix 授权流程（唯一所有者）。
 *
 * **每次 `apply()` 都建一个新的**：registry 一旦 dispose 就拒绝新建 flow，
 * 若它是个跨 apply 的模块级单例，宿主的同进程重挂载会让授权入口永久失效。
 * 卸载时由 routes 的 disposer 关闭本 apply 自己的那一个。
 */
let oauthFlows = createOauthFlowRegistry();

/**
 * MCP 服务器清单（含健康读数）。
 *
 * 损坏时**逐条强制 enabled:false** 而不是回退默认清单：默认清单里
 * `shopify` 的 `command` 是 `npx -y`，回退等于在配置不可读时仍然去拉起外部进程。
 * 卡片元数据保留（设置页要能画出来），但没有任何一条是放行的。
 * @returns {Promise<{ servers: any[], health: object }>} 服务器清单与健康读数。
 */
async function readMcpServers() {
  const r = await readStoreJson(MCP_FILE);
  if (r.ok && isPlainObject(r.value) && Array.isArray(r.value.servers)) {
    const declared = r.value.servers;
    // 按 id 合并：用户文件覆盖 enabled 等运行时状态，默认条目补齐静态元数据（capabilities/toolCount/auth）
    const fileMap = new Map(declared.map((s) => [s.id, s]));
    const merged = DEFAULT_MCP_SERVERS.map((def) => (fileMap.has(def.id) ? { ...def, ...fileMap.get(def.id) } : def));
    // 对称合并：保留用户文件中非默认 id 的条目（自定义 MCP 不丢失，追加在默认之后）
    const mergedIds = new Set(merged.map((s) => s.id));
    for (const s of declared) {
      if (s && s.id && !mergedIds.has(s.id)) merged.push(s);
    }
    return { servers: merged, health: okHealth() };
  }
  if (!r.ok && r.reason === "missing") {
    return { servers: DEFAULT_MCP_SERVERS, health: okHealth("default") };
  }
  // 与 connections 同一把尺子：不可解析 / 读不出来 / 顶层不是对象 / 缺 servers 字段或它不是数组
  // 一律「不放行 + 拒绝写入 + 保留取证」，绝不拿默认清单（里面有 `npx -y`）顶上。
  return {
    servers: closedMcpServers(),
    health: corruptHealth(
      r.reason === "unreadable" ? "mcp_unreadable" : r.reason === "corrupt" ? "mcp_corrupt" : "mcp_schema",
      MCP_FILE,
      r.error ?? "servers 不是数组",
      r.raw
    )
  };
}
/** 保留卡片元数据、逐条关闭（损坏时不拉起任何外部进程）。 */
function closedMcpServers() {
  return DEFAULT_MCP_SERVERS.map((s) => ({ ...s, enabled: false }));
}
/**
 * MCP 清单的读-改-写，整段进同一个排他槽位（理由同 `mutateConnections`）。
 * @template T
 * @param {(servers: any[]) => T | Promise<T>} mutator 在最新清单上做修改，返回要落盘的清单。
 * @returns {Promise<T>} mutator 的结果。
 */
async function mutateMcpServers(mutator) {
  return atomicStore.runExclusive(async () => {
    const { servers, health } = await readMcpServers();
    assertWritable(health, MCP_FILE);
    const next = await mutator(servers);
    await atomicStore.writeJson(MCP_FILE, { servers: next });
    return next;
  });
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
      const biz = (MCP_STATIC_TOOL_META[entry.id]?.meta ?? {})[name] ?? PIXPIX_BUSINESS_META[name];
      return {
        name,
        description: String(t?.description ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
        businessName: biz?.name ?? "",
        businessDesc: biz?.desc ?? "",
        scene: biz?.scene ?? "",
        readWrite: biz?.readWrite ?? ""
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
  const { servers, health } = await readMcpServers();
  if (health.ok === false) {
    console.error(`[wanzh-hulian] MCP 清单损坏（${health.file}）：${health.reason}；本次不挂载任何 MCP 服务器`);
  }
  const states = [];
  for (const s of servers) {
    if (s?.enabled !== true) { states.push({ id: s.id, enabled: false, status: "disabled" }); continue; }
    const env = {};
    const missingRefs = [];
    for (const [k, ref] of Object.entries(s.envRefs ?? {})) {
      try {
        const r = credentials ? await credentials.resolve(ref) : undefined;
        if (typeof r?.value === "string" && r.value) env[k] = r.value;
        else missingRefs.push(ref);
      } catch { missingRefs.push(ref); }
    }
    // C1 修复（2026-09-10）：envRefs 缺失时不再盲目拉起子进程（空 env 导致启动即 Connection closed）
    // ——状态标记 credentials-missing 并在面板给出指引，而非制造难以诊断的死链。
    if (missingRefs.length > 0) {
      console.error(`[wanzh-hulian] MCP ${s.id} 凭据未配置：${missingRefs.join(", ")}（设置页补齐后重启）`);
      states.push({ id: s.id, enabled: true, status: "credentials-missing", error: `凭据未配置：${missingRefs.join(", ")}` });
      continue;
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
    if (config.transport === "streamable-http") {
      config.url = String(s.url ?? "");
      config.headers = { ...(s.headers ?? {}) };
      // headerRefs：把凭据注入请求头（如 Apify 的 authorization: Bearer <token>），与 stdio envRefs 同构
      for (const [header, refDef] of Object.entries(s.headerRefs ?? {})) {
        try {
          const ref = typeof refDef === "string" ? refDef : refDef?.ref;
          const prefix = refDef !== null && typeof refDef === "object" && typeof refDef.prefix === "string" ? refDef.prefix : "";
          const r = credentials ? await credentials.resolve(ref) : undefined;
          if (typeof r?.value === "string" && r.value) config.headers[header] = prefix + r.value;
        } catch { /* 未配置 */ }
      }
    }
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
      states.push({ id: s.id, enabled: true, status: "error", error: errorMessage(e).slice(0, 200) });
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
/**
 * 解析得到大脑凭证。
 * @param {any} credentials credentials 服务（可为 undefined）
 * @returns {Promise<{apiKey: string|undefined, clientId: string|undefined, configured: boolean, source: string, cliAuthed: boolean}>}
 */
async function resolveCreds(credentials) {
  const out = { apiKey: undefined, clientId: undefined, configured: false, source: "none", cliAuthed: false };
  if (credentials !== undefined) {
    try {
      const k = await credentials.resolve(registryRefs().apiKeyRef);
      const c = await credentials.resolve(registryRefs().clientIdRef);
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
  // 凭证守卫：configured 为真即意味着两个字段都是非空字符串（见 resolveCreds），
  // 但类型系统无法从布尔字段反推，故按值显式收窄；同时保证 headers 里绝不出现 undefined。
  const apiKey = typeof creds.apiKey === "string" && creds.apiKey ? creds.apiKey : "";
  const clientId = typeof creds.clientId === "string" && creds.clientId ? creds.clientId : "";
  if (!apiKey || !clientId) {
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
        "x-client-id": clientId,
        // 官方文档：Authorization 直接放 API Key（无 Bearer 前缀）
        authorization: apiKey
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
      return { ok: false, error: `得到大脑 API HTTP ${res.status}${reason}: ${typeof err?.message === "string" ? err.message : text.slice(0, 200)}` };
    }
    if (body?.success !== true) {
      const err = body?.error ?? {};
      const reason = err?.reason ? `（${err.reason}）` : "";
      return { ok: false, error: `得到大脑 API 失败${reason}: ${typeof err?.message === "string" ? err.message : "unknown"}` };
    }
    return { ok: true, data: body.data };
  } catch (error) {
    return { ok: false, error: `得到大脑请求失败: ${errorMessage(error)}` };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/* ── 工具执行入口（连接开关热闸门） ──────────────────────────────────── */
/**
 * 连接总开关（工具执行入口的热生效点）。
 *
 * 损坏配置也走「断开」，但**必须带原因**：否则用户看到的是
 * 「请打开连接总开关」，而开关此时根本写不进去（损坏文件拒绝写入），
 * 于是一条误导性的指路把用户关进死循环。原因是现成的中文句子，
 * 复用 `error` 字段回传（闭合 schema 不加键，见 ADR-0055）。
 * @returns {Promise<{ disconnected: boolean, reason?: string }>} 断开时 `reason` 给出可直接显示的原因。
 */
async function gate() {
  const state = await readState();
  if (state.health.ok === false) {
    return {
      disconnected: true,
      reason: `得到大脑配置状态文件不可用（${state.health.file}：${state.health.reason}），能力已按安全默认关闭。${repairHint(STATE_FILE)}`
    };
  }
  if (!state.enabled) return { disconnected: true };
  return { disconnected: false };
}
/**
 * 工具的纯文本卡片渲染。
 * @param {any} _args 解析后的参数（文本投影不使用）。
 * @param {{ ok?: boolean, text?: string, error?: string, data?: any, disconnected?: boolean }} value 规范值。
 * @returns {Array<{ type: "text", text: string }>} 内容块。
 */
function renderText(_args, value) {
  if (value?.disconnected === true) {
    // 有原因时优先报原因：配置损坏时「请打开连接总开关」是错的方向（开关同样写不进去）。
    const reason = typeof value?.error === "string" && value.error !== "" ? value.error : "";
    return [{ type: "text", text: reason || "得到大脑连接已断开：请在 设置 → 万物互联 → 得到大脑 卡片打开连接总开关。" }];
  }
  if (value?.ok !== true) return [{ type: "text", text: value?.error ?? "得到大脑操作失败" }];
  return [{ type: "text", text: typeof value.text === "string" ? value.text : JSON.stringify(value.data ?? value, null, 2) }];
}
/**
 * 19 个工具共用的输出投影。
 *
 * 规范值刻意声明成**闭合**对象（五个顶层键 = 全部 execute 返回值的并集），
 * 而不是 `additionalProperties: true`：`defineTool` 对开放对象推出的值类型是
 * `Record<string, JsonValue>`，而 TS 把「可能缺席的可选字段」归一成 `?: undefined`，
 * `undefined` 不是 `JsonValue`——开放写法下 19 个工具一个都过不了 `tsc`。
 * 闭合后推成 `{ ok?: boolean; text?: string; error?: string; data?: JsonValue; disconnected?: boolean }`，
 * 与 19 个工具实际返回的形状一致（键集合逐一枚举过，见 ADR-0055）。
 * @returns {{ schema: { readonly type: "object", readonly additionalProperties: false, readonly properties: { readonly ok: { readonly type: "boolean" }, readonly text: { readonly type: "string" }, readonly error: { readonly type: "string" }, readonly data: { readonly type: "json" }, readonly disconnected: { readonly type: "boolean" } } }, render: typeof renderText }} 输出投影：规范化 schema + 文本渲染。
 */
function textOutput() {
  return {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ok: { type: "boolean" },
        text: { type: "string" },
        error: { type: "string" },
        data: { type: "json" },
        disconnected: { type: "boolean" }
      }
    },
    render: renderText
  };
}

/* ── 路由 ─────────────────────────────────────────────────────────────── */
async function handleList(credentials) {
  const state = await readState();
  const creds = await resolveCreds(credentials);
  const { connections: conns, health: connsHealth } = await readConnections();
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
      Object.assign(item, mergeRegisteredTools(item, getnoteToolNames()));
      item.command = conn.command ?? item.command;
      item.oauthCmd = conn.oauthCmd;
    }
    item.state = st;
    connections.push(item);
  }
  const boards = buildBoards({ boards: BOARDS, connections });
  const { health: mcpHealth } = await readMcpServers();
  return {
    status: 200,
    // health 是给设置页的结构化读数：损坏的持久化文件在这里逐条列出，
    // 能力侧已按 fail-closed 关闭（connections 逐条 enabled:false）。
    body: { ok: true, boards, connections, health: mergeHealth(state.health, connsHealth, mcpHealth) }
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
  const field = body?.field;
  const value = body?.value === true;
  if (field === "enabled") {
    // 一号槽位里做完整件事（读 → 检查 → 写），两个理由：
    //  ① 并发窗口：先读后写在两个并发 toggle 下会丢更新，而两边都返回 200；
    //  ② 全或无：connections 落盘后 mcp 才抛错的话，用户看到「已拒绝写入」，
    //     刷新后开关却已经翻过去了——错误读数与磁盘状态不一致。
    //     所以**两份清单的健康度都在动任何字节之前检查**。
    return atomicStore.runExclusive(async () => {
      const { connections: conns, health: connsHealth } = await readConnections();
      assertWritable(connsHealth, CONNECTIONS_FILE);
      const conn = conns.find((x) => x.id === id);
      if (!conn) return { status: 400, body: { ok: false, error: "未知连接 id" } };

      const linkedId = typeof conn.mcpServerId === "string" && conn.mcpServerId !== "" ? conn.mcpServerId : "";
      let mcp = null;
      if (linkedId) {
        const r = await readMcpServers();
        assertWritable(r.health, MCP_FILE);
        mcp = r.servers;
      }

      conn.enabled = value;
      await atomicStore.writeJson(CONNECTIONS_FILE, { schemaVersion: 1, connections: conns });
      // 联动：kind=mcp 的连接同步其 mcp-servers 条目 enabled
      if (mcp) {
        const idx = mcp.findIndex((s) => s.id === linkedId);
        if (idx >= 0) {
          mcp[idx].enabled = value;
          await atomicStore.writeJson(MCP_FILE, { servers: mcp });
        }
      }
      return { status: 200, body: { ok: true, id, enabled: value, restart: true, hint: "已保存；MCP 挂载变更重启 DSH 生效。" } };
    });
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
  let normalizedValue = value.trim();
  if (ref === "shopify_domain") {
    const normalizedHost = normalizeShopifyHost(normalizedValue);
    if (normalizedHost.ok !== true) return { status: 400, body: { ok: false, error: normalizedHost.error } };
    normalizedValue = normalizedHost.host;
  }
  try {
    await credentials.set(ref, normalizedValue);
    const info = await credentials.describe(ref);
    return { status: 200, body: { ok: true, ref, configured: info?.configured === true } };
  } catch (error) {
    return { status: 500, body: { ok: false, error: errorMessage(error) } };
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
  /** @type {{domain: string | undefined, domainError: string | undefined, token: string | undefined, clientId: string | undefined, clientSecret: string | undefined, configured: boolean, mode: string}} */
  const out = { domain: undefined, domainError: undefined, token: undefined, clientId: undefined, clientSecret: undefined, configured: false, mode: "none" };
  if (credentials === undefined) return out;
  try {
    const d = await credentials.resolve("shopify_domain");
    const t = await credentials.resolve("shopify_access_token");
    const cid = await credentials.resolve("shopify_client_id");
    const cs = await credentials.resolve("shopify_client_secret");
    if (typeof d?.value === "string" && d.value.trim()) {
      const normalizedHost = normalizeShopifyHost(d.value);
      if (normalizedHost.ok === true) out.domain = normalizedHost.host;
      else out.domainError = normalizedHost.error;
    }
    out.token = typeof t?.value === "string" ? t.value : undefined;
    out.clientId = typeof cid?.value === "string" ? cid.value.trim() : undefined;
    out.clientSecret = typeof cs?.value === "string" ? cs.value : undefined;
    if (out.domain && out.clientId && out.clientSecret) { out.mode = "client-credentials"; out.configured = true; }
    else if (out.domain && out.token) { out.mode = "token"; out.configured = true; }
  } catch { /* 未配置 */ }
  return out;
}
/** 连接探测处理器注册表（probe.kind → handler） */
async function resolveApifyToken(credentials) {
  if (credentials === undefined) return undefined;
  try {
    const r = await credentials.resolve("apify_token");
    return typeof r?.value === "string" && r.value ? r.value : undefined;
  } catch { return undefined; }
}
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
    if (creds.domainError) return { ok: false, error: `${creds.domainError}；请重新填写商店域名。` };
    if (!creds.configured) return { ok: false, error: "未配置 Shopify 凭证：请填写商店域名 + 客户端 ID + 加密密钥（开发仪表盘应用的 API 凭据，插件自动换取访问令牌）。" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      // 令牌获取策略（直填优先 / 客户端凭据换取）由 host-util 承载并有测试覆盖
      const resolved = await resolveShopifyToken({
        token: creds.token,
        exchange: async () => {
          const exchParams = new URLSearchParams({ grant_type: "client_credentials" });
          if (creds.clientId) exchParams.set("client_id", creds.clientId);
          if (creds.clientSecret) exchParams.set("client_secret", creds.clientSecret);
          const request = await fetchShopifyAdmin(fetch, creds.domain, "/admin/oauth/access_token", {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: exchParams,
            signal: controller.signal
          });
          if (request.ok !== true) return { ok: false, error: request.error };
          const exc = request.response;
          const excBody = await exc.json().catch(() => null);
          if (!exc.ok) return { ok: false, error: `Shopify 令牌交换失败 (HTTP ${exc.status}): ${excBody?.error_description || excBody?.error || "请求失败"}` };
          return { ok: true, token: typeof excBody?.access_token === "string" ? excBody.access_token : undefined };
        }
      });
      if (resolved.ok !== true) return { ok: false, error: resolved.error };
      const token = resolved.token;
      const via = resolved.via;
      const request = await fetchShopifyAdmin(fetch, creds.domain, "/admin/api/2026-04/shop.json", {
        headers: { "x-shopify-access-token": token },
        signal: controller.signal
      });
      if (request.ok !== true) return { ok: false, error: request.error };
      const res = request.response;
      const body = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, error: `Shopify API HTTP ${res.status}: ${body?.errors ? String(body.errors) : "请求失败"}` };
      return { ok: true, text: `连接测试通过 ✓\n认证方式: ${via}\n店铺: ${body?.shop?.name ?? "（无名称）"}\n计划: ${body?.shop?.plan_name ?? "-"}\n域名: ${body?.shop?.myshopify_domain ?? request.host}` };
    } catch (e) {
      return { ok: false, error: `Shopify 请求失败: ${errorMessage(e)}` };
    } finally { clearTimeout(timer); }
  }
  if (kind === "apify-user-info") {
    const token = await resolveApifyToken(credentials);
    if (!token) return { ok: false, error: "未配置 Apify API Token：请在 Apify 控制台（Settings → Integrations）创建后粘贴。" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch("https://api.apify.com/v2/users/me", { headers: { authorization: "Bearer " + token }, signal: controller.signal });
      const body = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, error: `Apify API HTTP ${res.status}: ${body?.error?.message || body?.error || "请求失败"}` };
      const u = body?.data ?? {};
      return { ok: true, text: `连接测试通过 ✓\n账号: ${u.username ?? "-"}\n套餐: ${u.plan?.id ?? "-"}（月度上限 $${u.plan?.maxMonthlyUsageUsd ?? "?"}）\n并发上限: ${u.plan?.maxConcurrentActorRuns ?? "-"}` };
    } catch (e) {
      return { ok: false, error: `Apify 请求失败: ${errorMessage(e)}` };
    } finally { clearTimeout(timer); }
  }
  return { ok: false, error: `未知探测类型: ${kind}` };
}

/** 外部链接白名单（设置页「打开开放平台」等按钮，用系统默认浏览器打开） */
const EXTERNAL_HOSTS = new Set(["biji.com", "www.biji.com", "openapi.biji.com", "doc.biji.com", "app.biji.com", "admin.shopify.com", "shopify.dev", "www.shopify.com"]);
/**
 * 按平台选择打开外部链接的命令。
 * @param {string} url 已通过白名单校验的链接
 * @returns {{command: string, args: string[]}} 命令与其参数
 */
function openCommand(url) {
  if (process.platform === "darwin") return { command: "open", args: [url] };
  if (process.platform === "win32") return { command: "cmd", args: ["/c", "start", "", url] };
  return { command: "xdg-open", args: [url] };
}
async function handleOpenUrl(body) {
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) return { status: 400, body: { ok: false, error: "url 不能为空" } };
  let parsed;
  try { parsed = new URL(url); } catch { return { status: 400, body: { ok: false, error: "url 非法" } }; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { status: 400, body: { ok: false, error: "仅允许 http/https" } };
  if (!EXTERNAL_HOSTS.has(parsed.hostname)) return { status: 400, body: { ok: false, error: "域名不在白名单内" } };
  // spawn 而非 execFile：execFile 不接受 detached/stdio，无法与宿主进程解耦；
  // 且 spawn 启动失败以 'error' 事件上报（同步 try 捕不到），
  // 旧写法会让接口返回「已打开」而实际什么都没发生。
  return new Promise((resolve) => {
    const cmd = openCommand(url);
    /** @type {import("node:child_process").SpawnOptions} */
    const options = { detached: true, stdio: "ignore" };
    const child = spawn(cmd.command, cmd.args, options);
    child.once("error", (error) => resolve({ status: 500, body: { ok: false, error: errorMessage(error) } }));
    child.once("spawn", () => { child.unref(); resolve({ status: 200, body: { ok: true } }); });
  });
}

/* ── apply ────────────────────────────────────────────────────────────── */
export function apply(ctx) {
  const credentials = ctx.credentials ?? ctx.get("credentials");
  toolCtx = { credentials };
  // 本次 apply 独占一个授权流程所有权（见 oauthFlows 的说明）。
  oauthFlows = createOauthFlowRegistry();
  const registry = oauthFlows;
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
  ctx.effect(() => {
    ensureApifySkill().catch(() => {});
  }, "dsh-wanzh-hulian: ensure apify skill");

  for (const tool of getnoteToolNames()) {
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
        } catch (e) { sendError(res, e); }
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
        } catch (e) { sendError(res, e); }
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
        } catch (e) { sendError(res, e); }
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
          const { connections: conns } = await readConnections();
          const conn = conns.find((x) => x.id === id);
          if (!conn) return sendJson(res, 404, { ok: false, error: "未知连接 id" });
          const r = await probeConnection(credentials, conn);
          sendJson(res, 200, r);
        } catch (e) { sendError(res, e); }
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
          const { servers: mcp } = await readMcpServers();
          const entry = mcp.find((s) => s.id === entryId);
          if (!entry || entry.auth?.type !== "oauth-pkce") return sendJson(res, 400, { ok: false, error: "该条目不支持 OAuth 授权" });
          const r = await startOauthFlow(entry.auth, entryId);
          sendJson(res, 200, r);
        } catch (e) { sendError(res, e); }
      }
    });
    const disposeOauthStatus = ctx.webServer.register({
      kind: "exact",
      path: BASE + "/oauth/status",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return sendJson(res, 401, { error: "unauthorized" });
        if (req.method !== "GET") return sendJson(res, 405, { error: "method not allowed" });
        // 这是 12 条路由里唯一曾经没有错误边界的一条：读路径一旦抛错，请求就悬挂
        // （前端 `.then` 永远不跑、`.catch` 什么都不做），用户看到"刷新按钮点了没反应"。
        try {
          const { token: tok, health: tokHealth } = await readOauthToken();
          const flow = oauthFlows.describe();
          if (tokHealth.ok === false) {
            return sendJson(res, 200, { ok: true, authed: false, health: tokHealth, flow });
          }
          if (!tok || !tok.accessToken) return sendJson(res, 200, { ok: true, authed: false, flow });
          const meta = await readStoreJson(OAUTH_FILE);
          const refreshFailed = meta.ok && typeof meta.value?._refresh_failed_at === "number";
          sendJson(res, 200, {
            ok: true, authed: true,
            expiresAt: tok.expiresAt,
            expiresInHours: tok.expiresAt > 0 ? Math.max(0, Math.round((tok.expiresAt - Date.now()) / 3600_000 * 10) / 10) : null,
            expired: tok.expiresAt > 0 && tok.expiresAt <= Date.now() + 60_000,
            refreshFailed,
            hasRefresh: Boolean(tok.refreshToken),
            scope: tok.scope,
            flow
          });
        } catch (e) { sendError(res, e); }
      }
    });
    const disposeMcpList = ctx.webServer.register({
      kind: "exact",
      path: BASE + "/mcp-servers",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return sendJson(res, 401, { error: "unauthorized" });
        try {
          if (req.method === "GET") {
            const { servers, health: mcpHealth } = await readMcpServers();
            const states = globalMcpStates ?? servers.map((s) => ({ id: s.id, enabled: s?.enabled === true, status: "unknown" }));
            const { token: tok, health: tokHealth } = await readOauthToken();
            const oauthState = !tok || !tok.accessToken
              ? { authed: false, ...(tokHealth.ok === false ? { health: tokHealth } : {}) }
              : { authed: true, expired: tok.expiresAt > 0 && tok.expiresAt <= Date.now() + 60_000, scope: tok.scope };
            return sendJson(res, 200, {
              ok: true,
              oauthState,
              health: mcpHealth,
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
            const r = await mutateMcpServers((servers) => {
              const idx = servers.findIndex((s) => s.id === body?.id);
              if (idx < 0) return null;
              if (typeof body?.enabled === "boolean") servers[idx].enabled = body.enabled;
              return servers;
            });
            if (r === null) return sendJson(res, 404, { ok: false, error: "未知服务器 id" });
            return sendJson(res, 200, { ok: true, restart: true, hint: "MCP 服务器挂载在宿主启动时生效，请重启 DSH Desktop。" });
          }
          return sendJson(res, 405, { error: "method not allowed" });
        } catch (e) { sendError(res, e); }
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
          sendJson(res, 500, { ok: false, error: errorMessage(error) });
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
        } catch (e) { sendError(res, e); }
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
        } catch (e) { sendError(res, e); }
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
        } catch (e) { sendError(res, e); }
      }
    });
    return () => {
      disposeList();
      disposeToggle();
      disposeCredential();
      disposeProbe();
      // SEC-RT-007：这三条此前注册了却从未被 dispose —— 插件卸载后
      // `/oauth/start`、`/oauth/status`、`/mcp-servers` 仍然挂在宿主路由表上。
      disposeOauthStart();
      disposeOauthStatus();
      disposeMcpList();
      disposeOpen();
      disposeAuthLogin();
      disposeAuthStatus();
      disposeTopics();
      disposeDefaultTopic();
      // 进行中的授权流程随本次 apply 一起收口：不留下一个永不关闭的 loopback listener。
      registry.dispose();
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
    if (g.disconnected) return { disconnected: true, error: g.reason };
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
    if (g.disconnected) return { disconnected: true, error: g.reason };
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
    if (g.disconnected) return { disconnected: true, error: g.reason };
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
    if (g.disconnected) return { disconnected: true, error: g.reason };
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
    if (g.disconnected) return { disconnected: true, error: g.reason };
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
    if (g.disconnected) return { disconnected: true, error: g.reason };
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
    if (g.disconnected) return { disconnected: true, error: g.reason };
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
    if (g.disconnected) return { disconnected: true, error: g.reason };
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
    if (g.disconnected) return { disconnected: true, error: g.reason };
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
    if (g.disconnected) return { disconnected: true, error: g.reason };
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
    if (g.disconnected) return { disconnected: true, error: g.reason };
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
    if (g.disconnected) return { disconnected: true, error: g.reason };
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
    if (g.disconnected) return { disconnected: true, error: g.reason };
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
    if (g.disconnected) return { disconnected: true, error: g.reason };
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
    if (g.disconnected) return { disconnected: true, error: g.reason };
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
    if (g.disconnected) return { disconnected: true, error: g.reason };
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
    if (g.disconnected) return { disconnected: true, error: g.reason };
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
    if (g.disconnected) return { disconnected: true, error: g.reason };
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
    if (g.disconnected) return { disconnected: true, error: g.reason };
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
