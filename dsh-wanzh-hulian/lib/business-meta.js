/**
 * business-meta.js — MCP 工具业务化清单（单一数据源）。
 *
 * 三张 MCP 连接卡（Shopify / PixPix / 得到大脑）的工具介绍共用本文件：
 *  - 设置页 UI（ToolZone）按场景分组展示「业务名 / 何时用 / 原始工具名 / 读写徽标」
 *  - 技能同步（ensureShopifySkill / ensurePixpixSkill / ensureSkill）生成模型侧速查表
 *
 * 条目结构：
 *   name        业务名（面向用户）
 *   desc        何时用 / 能干什么（一句话，面向用户与模型）
 *   scene       场景分组（展示顺序由 *_SCENE_CHIPS 决定）
 *   readWrite   可选："read"（只读）| "write"（写入/删除，模型侧需护栏）
 *   example     可选：一句「对模型说」示例口令（shopify 每条都有）
 */
export const PIXPIX_BUSINESS_META = {
  list_generation_models: { name: "可用模型目录", desc: "查询当前可用的 AI 生图、视频、语音模型及参数限制。", scene: "素材与任务" },
  prepare_image_upload: { name: "上传商品图片", desc: "把本地图片上传到 PixPix 素材库，供后续生成使用。", scene: "素材与任务" },
  complete_image_upload: { name: "确认图片上传", desc: "图片上传完成后确认入库，拿到可用的图片地址。", scene: "素材与任务" },
  prepare_video_upload: { name: "上传商品视频", desc: "把本地视频上传到 PixPix 素材库（≤200MB）。", scene: "素材与任务" },
  complete_video_upload: { name: "确认视频上传", desc: "视频上传完成后确认入库，拿到可用的视频地址。", scene: "素材与任务" },
  generate_image: { name: "AI 生成图片", desc: "一句话描述或参考图，生成产品图、场景图、海报。", scene: "AI 生图与配音" },
  generate_video: { name: "AI 生成视频", desc: "一句话描述或参考图，生成视频片段。", scene: "AI 生图与配音" },
  generate_tts: { name: "文字转配音", desc: "把文案转成口播配音，带货视频旁白可用。", scene: "AI 生图与配音" },
  get_generation_status: { name: "查生成进度", desc: "按任务号查询生成任务的进度和结果。", scene: "素材与任务" },
  get_generation_status_for_workbuddy: { name: "查进度（WorkBuddy 宿主）", desc: "WorkBuddy 宿主专用的任务进度查询。", scene: "素材与任务" },
  get_generation_status_batch: { name: "批量查生成进度", desc: "一次查多个生成任务的进度和结果。", scene: "素材与任务" },
  render_generation_result_for_codex: { name: "展示结果（Codex 宿主）", desc: "Codex 宿主专用的生成结果展示。", scene: "素材与任务" },
  render_generation_result_in_app: { name: "展示结果（Claude 宿主）", desc: "Claude 宿主专用的生成结果展示。", scene: "素材与任务" },
  list_generation_tasks: { name: "历史生成记录", desc: "查看、筛选历史生成任务与收藏。", scene: "素材与任务" },
  run_generation_tool: { name: "通用生成入口", desc: "兼容入口：某项能力没有专门工具时的兜底调用。", scene: "素材与任务" },
  get_generation_credits: { name: "估算积分成本", desc: "生成前预估某项任务要消耗多少积分。", scene: "成本与权益" },
  get_membership_benefit: { name: "会员权益", desc: "查询会员等级、积分余额与可用生成权益。", scene: "成本与权益" },
  "run_generation-flux-video-upscale": { name: "视频放大", desc: "把短视频放大到更高分辨率（1.5/2/3 倍）。", scene: "视频精修" },
  "run_generation-video-remove-bg": { name: "视频抠背景", desc: "去掉视频背景，只保留前景主体。", scene: "视频精修" },
  "run_generation-video-compression": { name: "视频压缩", desc: "压缩视频体积，方便传输与上传。", scene: "视频精修" },
  "run_generation-video-remove-watermark": { name: "视频去水印", desc: "移除视频中的水印。", scene: "视频精修" },
  "run_generation-high-definition-video": { name: "视频画质修复", desc: "提升真人视频/老片清晰度（720P→1080P/2K/4K）。", scene: "视频精修" },
  "run_tool-generation-viral-ecommerce-video": { name: "15 秒带货视频", desc: "商品图+卖点 → 带音轨的 15 秒营销视频（口播/短剧/演示等 8 种类型）。", scene: "带货视频" },
  "run_tool-generation-video-replication": { name: "竞品视频复刻", desc: "参考一条爆款视频的运镜节奏，替换成你的商品。", scene: "带货视频" },
  "run_generation-remove-bg": { name: "图片抠图", desc: "一键去背景，输出透明 PNG 主体图。", scene: "图片精修" },
  "run_tool-generation-product-suite": { name: "商品套图", desc: "1-3 张产品图 → 白底图+场景图+卖点图一整套主图。", scene: "主图与套图" },
  "run_generation-high-definition-image": { name: "图片高清放大", desc: "低清图片放大到 1K/2K/4K。", scene: "图片精修" },
  "run_tool-generation-product-recolor": { name: "商品换色", desc: "保持材质光影不变，把商品主体换成指定颜色。", scene: "图片精修" },
  "run_tool-generation-bestseller-replica": { name: "爆款复刻海报", desc: "参考竞品爆款海报的版式风格，生成自家商品海报（网页 hot-seller-replicate 同款）。", scene: "主图与套图" },
  "run_generation-model": { name: "生成模特人像", desc: "按性别/人种/年龄段/体型生成模特人像。", scene: "模特与试穿" },
  "run_tool-generation-product-retouch": { name: "商品精修", desc: "修复划痕瑕疵、提升光泽与清晰度、校正色彩与透视。", scene: "图片精修" },
  "run_tool-generation-footwear-try-on": { name: "鞋履试穿", desc: "把鞋穿到模特脚上，生成竖版双画面试穿海报。", scene: "模特与试穿" },
  "run_tool-generation-a-plus-detail": { name: "A+ 详情页", desc: "按亚马逊等平台规范生成详情页模块图（主视觉/卖点/场景/规格）。", scene: "主图与套图" },
  "run_tool-generation-lingerie-try-on": { name: "内衣试穿", desc: "把内衣产品自然换到成年模特身上。", scene: "模特与试穿" },
  "run_tool-generation-apparel-try-on": { name: "服装试穿", desc: "把服装参考图穿到指定模特身上。", scene: "模特与试穿" },
  "run_tool-generation-apparel-set": { name: "服装套图", desc: "服装白底图/模特图/细节图/卖点图一整套。", scene: "主图与套图" },
  "run_tool-generation-ai-wear-anything": { name: "通用穿戴展示", desc: "把任意商品（配饰/眼镜/帽子等）自然穿戴到模特身上。", scene: "模特与试穿" }
};
export const PIXPIX_SCENE_CHIPS = ["主图与套图", "模特与试穿", "带货视频", "图片精修", "视频精修", "AI 生图与配音", "素材与任务", "成本与权益"];
export const PIXPIX_EXAMPLE = "把这双鞋穿到模特脚上做海报 → 上传鞋图，几分钟后拿到试穿成片链接";

/* ── 得到大脑官方 MCP 业务化映射（38 工具，实测 tools/list 核对） ─────────── */
export const GETNOTE_MCP_BUSINESS_META = {
  list_notes: { name: "最近笔记", desc: "分页列出最近的笔记。", scene: "找笔记" },
  get_note: { name: "读笔记详情", desc: "按笔记 ID 读详情（正文、标签、附件、转写）。", scene: "找笔记" },
  get_note_original: { name: "读原文", desc: "直接读原文（链接笔记=网页原文，录音笔记=转写原文），不拿 AI 摘要冒充。", scene: "找笔记" },
  get_note_transcript: { name: "读转写原文", desc: "读录音、会议、课堂笔记的逐字转写。", scene: "找笔记" },
  get_note_attachments: { name: "看附件", desc: "列出笔记里的图片、音频、文件附件。", scene: "找笔记" },
  get_note_timeline: { name: "读时间线", desc: "读录音/会议笔记的结构化时间线。", scene: "找笔记" },
  get_note_quick_note: { name: "读快捷笔记", desc: "读录音笔记的快捷笔记。", scene: "找笔记" },
  get_note_todos: { name: "提取待办", desc: "从会议笔记提取待办清单。", scene: "找笔记" },
  save_note: { name: "记一条笔记", desc: "把文字、链接或图片存成笔记，可带标题、标签、指定知识库。", scene: "记笔记" },
  get_note_task_progress: { name: "查链接笔记进度", desc: "查链接笔记创建任务的处理进度。", scene: "知识库管理" },
  delete_note: { name: "删笔记", desc: "把笔记移入回收站（App 端可恢复）。", scene: "删除与清理" },
  update_note: { name: "修改笔记", desc: "改笔记的标题、内容或整体替换标签。", scene: "记笔记" },
  add_note_tags: { name: "给笔记加标签", desc: "给已有笔记追加标签。", scene: "记笔记" },
  delete_note_tag: { name: "删标签", desc: "删掉笔记上的某个标签。", scene: "删除与清理" },
  list_topics: { name: "知识库列表", desc: "列出全部知识库。", scene: "知识库管理" },
  create_topic: { name: "建知识库", desc: "新建知识库（每天限 50 个）。", scene: "知识库管理" },
  list_topic_notes: { name: "库内笔记清单", desc: "列出知识库里的笔记。", scene: "知识库管理" },
  batch_add_notes_to_topic: { name: "批量移入知识库", desc: "把笔记批量加进知识库（每批≤20）。", scene: "知识库管理" },
  list_topic_directories: { name: "浏览文件夹", desc: "看知识库的文件夹结构。", scene: "知识库管理" },
  create_topic_directory: { name: "建文件夹", desc: "在知识库里建文件夹。", scene: "知识库管理" },
  update_topic_directory: { name: "改文件夹", desc: "重命名或移动知识库里的文件夹。", scene: "知识库管理" },
  delete_topic_directory: { name: "删空文件夹", desc: "删除空文件夹（非空不能删）。", scene: "删除与清理" },
  remove_note_from_topic: { name: "移出知识库", desc: "把笔记移出库（笔记本身保留）。", scene: "知识库管理" },
  get_upload_config: { name: "上传限制查询", desc: "查图片上传的类型和大小限制。", scene: "上传与配额" },
  get_upload_token: { name: "取上传凭证", desc: "拿 OSS 上传凭证（AI 内部用）。", scene: "上传与配额" },
  upload_image: { name: "上传图片", desc: "把本地图片上传到得到大脑。", scene: "上传与配额" },
  list_topic_bloggers: { name: "博主列表", desc: "看知识库订阅了哪些博主。", scene: "内容订阅" },
  follow_topic_blogger: { name: "订阅抖音博主", desc: "把抖音博主订阅到知识库，自动沉淀内容。", scene: "内容订阅" },
  list_topic_blogger_contents: { name: "博主内容列表", desc: "看博主发布了哪些内容。", scene: "内容订阅" },
  get_blogger_content_detail: { name: "读博主内容", desc: "读博主内容的完整原文。", scene: "内容订阅" },
  list_topic_lives: { name: "直播列表", desc: "看知识库沉淀了哪些直播。", scene: "内容订阅" },
  get_live_detail: { name: "读直播详情", desc: "读直播的 AI 摘要和完整转写。", scene: "内容订阅" },
  follow_topic_live: { name: "订阅直播", desc: "订阅一场得到 App 直播到知识库。", scene: "内容订阅" },
  share_note: { name: "生成分享链接", desc: "把笔记生成公开分享链接，发给别人。", scene: "记笔记" },
  list_subscribe_topics: { name: "订阅的知识库", desc: "列出订阅的他人知识库。", scene: "知识库管理" },
  get_quota: { name: "配额查询", desc: "查调用配额余量。", scene: "上传与配额" },
  recall: { name: "全库语义搜索", desc: "在所有笔记里按意思搜，返回相关片段。", scene: "找笔记" },
  recall_knowledge: { name: "知识库内搜索", desc: "在指定知识库内按意思搜。", scene: "找笔记" }
};
export const GETNOTE_SCENE_CHIPS = ["记笔记", "找笔记", "知识库管理", "内容订阅", "上传与配额", "删除与清理"];
export const GETNOTE_EXAMPLE = "把刚才这段话存成笔记，加上「出海」标签";

/* ── Shopify 社区 MCP 业务化映射（14 工具，实测 shopify-mcp v1.0.8） ───────── */
export const SHOPIFY_BUSINESS_META = {
  get_products: { name: "查商品列表", desc: "列出/搜索店铺商品，支持筛选与排序。", scene: "商品", readWrite: "read", example: "店铺里有哪些商品？" },
  get_product_by_id: { name: "查单品详情", desc: "按 ID 查单个商品的详情与变体。", scene: "商品", readWrite: "read", example: "查一下商品 1234567890 的详情" },
  get_orders: { name: "查订单列表", desc: "列出/筛选店铺订单（状态、日期、金额）。", scene: "订单", readWrite: "read", example: "帮我查店铺最近 10 个订单" },
  get_order_by_id: { name: "查订单详情", desc: "按 ID 查单笔订单的完整明细。", scene: "订单", readWrite: "read", example: "订单 #1001 里买了什么？" },
  get_customers: { name: "查客户列表", desc: "列出/搜索店铺客户。", scene: "客户", readWrite: "read", example: "店铺一共有多少客户？" },
  get_customer_orders: { name: "查客户订单", desc: "查某个客户在店铺的全部订单。", scene: "客户", readWrite: "read", example: "客户 xxx 买过哪些东西？" },
  create_product: { name: "新建商品", desc: "在店铺后台创建一个新商品。", scene: "商品", readWrite: "write", example: "帮我创建一个新商品：标题 xxx，价格 99" },
  update_product: { name: "修改商品", desc: "修改已有商品的信息（标题、描述、价格等）。", scene: "商品", readWrite: "write", example: "把商品 xxx 的价格改成 129" },
  delete_product: { name: "删除商品", desc: "删除店铺中的一个商品（不可恢复，务必先确认）。", scene: "商品", readWrite: "write", example: "删除商品 xxx（先向我确认）" },
  manage_product_options: { name: "管理商品选项", desc: "增删改商品的选项（如尺码、颜色维度）。", scene: "商品", readWrite: "write", example: "给商品 xxx 加上「颜色」选项" },
  manage_product_variants: { name: "管理商品变体", desc: "增删改商品的变体（SKU 组合、价格、库存）。", scene: "商品", readWrite: "write", example: "给商品 xxx 增加 XL 码变体" },
  delete_product_variants: { name: "删除商品变体", desc: "删除商品的变体（不可恢复，务必先确认）。", scene: "商品", readWrite: "write", example: "删掉商品 xxx 的 XL 码变体（先向我确认）" },
  update_customer: { name: "修改客户", desc: "修改客户信息或打标签。", scene: "客户", readWrite: "write", example: "给客户 xxx 打上「VIP」标签" },
  update_order: { name: "修改订单", desc: "修改订单（备注、履约信息等）。", scene: "订单", readWrite: "write", example: "给订单 #1001 加一条内部备注" }
};
export const SHOPIFY_SCENE_CHIPS = ["商品", "订单", "客户"];
export const SHOPIFY_EXAMPLE = "帮我查店铺最近 10 个订单";

/** 服务器 id → 静态工具元数据（UI 保底 + 技能同步共用） */
export const MCP_STATIC_TOOL_META = {
  shopify: { meta: SHOPIFY_BUSINESS_META, scenes: SHOPIFY_SCENE_CHIPS, example: SHOPIFY_EXAMPLE },
  pixpix: { meta: PIXPIX_BUSINESS_META, scenes: PIXPIX_SCENE_CHIPS, example: PIXPIX_EXAMPLE },
  getnote: { meta: GETNOTE_MCP_BUSINESS_META, scenes: GETNOTE_SCENE_CHIPS, example: GETNOTE_EXAMPLE }
};

/** 把业务清单转成 /mcp-servers 的 toolMeta 结构（source: static） */
export function staticToolMetaFor(serverId) {
  const def = MCP_STATIC_TOOL_META[serverId];
  if (!def) return null;
  return {
    tools: Object.entries(def.meta).map(([name, biz]) => ({
      name,
      description: "",
      businessName: biz.name,
      businessDesc: biz.desc,
      scene: biz.scene,
      readWrite: biz.readWrite ?? ""
    })),
    scenes: def.scenes,
    example: def.example,
    source: "static",
    fetchedAt: 0
  };
}
