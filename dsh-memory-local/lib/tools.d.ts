/**
 * 工具桥接：运行时从灵枢拉取工具清单（tools/list），把 JSON Schema
 * 转换为 dsh-tools 的 ParameterSchemaSpec，经 defineTool 注册进 ctx.tools。
 *
 * 动态拉取意味着灵枢库升级新增工具后，DSH 侧零改动即可获得新能力。
 */
import type { Context } from '@deepseek-ai/cordis';
import { type ParameterSchemaSpec } from '@deepseek-ai/dsh-tools';
import type { LingshuBridge } from './bridge.ts';
/** 默认暴露的核心工具集合（记忆/推理/摄取/元认知）。 */
export declare const CORE_TOOLS: readonly ["remember", "recall", "search", "timeline", "think", "relate", "predict_routes", "ingest_text", "ingest_url", "session_note", "self_check", "service_info"];
/**
 * 大脑模式工具集（轻量版：去掉身体的完整大脑）。
 * 保留灵枢全部心智能力（记忆/认知/推理/学习/飞轮/反思/长期记忆门），
 * 排除身体/视觉类工具（body/device_call/see/world3d 等）。
 */
export declare const BRAIN_TOOLS: readonly ["remember", "recall", "search", "timeline", "session_note", "session_recall", "compact_context", "think", "relate", "reason", "predict_routes", "self_check", "gap_trend", "cognition", "cognition_report", "emotional_bias", "self_reliability", "action_log", "preflight", "recursive_reflect", "blindspots", "learn", "induce", "distill", "flywheel_metrics", "transfer_test", "calibrate", "ingest_text", "ingest_file", "ingest_url", "web_search", "lifecycle_step", "lifecycle_state", "longterm_snapshot", "promote_memories", "service_info"];
/** tools 配置：'core' | 'brain' | 'all' | 显式名称数组。 */
export type ToolSelection = 'core' | 'brain' | 'all' | string[];
/** 按工具名判定并发安全（只读查询 true；写操作 false） */
export declare function isToolConcurrencySafe(name: string): boolean;
/**
 * P1 完善（GPT 审查·tools:all 自动扩权）：即使 selection='all' 也排除的宿主级
 * 风险工具——此前后端新增工具即自动暴露给 Agent（动态扩权无 denylist）。
 * 排除原则：宿主命令执行/权限终裁/外部设备/自主生命周期控制/角色卡写入。
 * 显式名称数组（显式配置）不受此名单限制（配置者已明确选择）。
 */
export declare const RISK_TOOLS: Set<string>;
/** 按配置筛选工具名（'all' 时排除 RISK_TOOLS 宿主级危险工具）。 */
export declare function selectTools(all: string[], selection: ToolSelection): string[];
/** 把 MCP JSON Schema 的属性表转换为 ParameterSchemaSpec。 */
export declare function schemaToParameters(inputSchema: Record<string, unknown> | undefined): ParameterSchemaSpec;
/** 从灵枢 content 数组中提取文本（MCP text block 拼接）。 */
export declare function extractText(content: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
}>): string;
/** 注册灵枢工具到 ctx.tools；返回取消注册函数。 */
export declare function registerLingshuTools(ctx: Context, bridge: LingshuBridge, opts: {
    selection: ToolSelection;
    toolPrefix: string;
}): Promise<() => void>;
