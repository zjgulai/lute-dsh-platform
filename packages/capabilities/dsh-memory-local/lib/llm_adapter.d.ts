/**
 * llm_adapter.ts —— 白箱 LLM 服务商（WhiteboxLlmAdapter）
 *
 * 设计哲学：白箱本身就是 LLM 模型（对外完全对齐 dsh-llm 协议），内部白箱化。
 *  - provider: 'lingshu-whitebox'（设置页「模型」可见，可被 agent 默认选用）
 *  - stream(): 调灵枢 wisdom_chat（白箱 CCG 条件路由/组合生成/自校验）
 *  - token 计数：输入/输出/缓存命中（白箱直答 = 全部 cacheRead，零推理成本）
 *  - 降级：白箱无把握（route=llm / 桥未就绪）→ 可选 fallback（后续接 deepseek）
 *
 * 结构仿官方 @deepseek-ai/dsh-llm-deepseek adapter。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { LingshuBridge } from './bridge.js';
export interface LlmStreamChunk {
    type: 'block-start' | 'text-delta' | 'reasoning-delta' | 'tool-call-delta' | 'block-end' | 'usage' | 'finish';
    index?: number;
    blockType?: string;
    text?: string;
    id?: string;
    name?: string;
    argumentsDelta?: string;
    block?: {
        type: string;
        text?: string;
        [k: string]: unknown;
    };
    usage?: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
    };
    reason?: string;
    replayState?: unknown;
}
export interface LlmGenerateOptions {
    provider: string;
    model: string;
    reasoningEffort?: string;
    messages: Array<{
        role: string;
        content?: Array<{
            type?: string;
            text?: string;
            arguments?: string;
            [k: string]: unknown;
        }>;
    }>;
    system?: string;
    tools?: Array<{
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    }>;
    temperature?: number;
    maxTokens?: number;
    stop?: string[];
    signal?: AbortSignal;
    sessionId?: string;
    purpose?: 'compaction' | 'session-title';
}
export declare function estimateTokens(text: string | undefined | null): number;
/** 从 GenerateOptions 汇总输入 token（system + messages 全部文本）。 */
export declare function countInputTokens(options: LlmGenerateOptions): number;
/** 把 DSH 会话消息折叠成白箱可读的对话文本。 */
export declare function serializeMessages(options: LlmGenerateOptions): string;
/** 把一段完整文本包装成协议流（确定性整段生成 → 单次流）。 */
export declare function wrapTextStream(text: string, inputTokens: number, outputTokens: number, cacheReadTokens: number): AsyncIterable<LlmStreamChunk>;
/**
 * 白箱知识卡片格式检测：REVERSE_DAILY 直答是知识库内部格式——
 * 「X是什么…，是『A』vs『B』的矛盾——X（是…（…（…）…）…真相：①…」
 * 特征（任一强信号命中即判定）：
 * ① 卡片开头句式：内容含「，是『X』vs『Y』的矛盾——」（矛盾标记+破折号）
 * ② 「真相：」结构化标记（卡片分段标题）+ 括号密集（>8）
 * ③ 长文本（>300）+ 高括号密度（>20）+ 无自然语言标点分隔（顿号密集）
 */
export declare function isCardFormat(text: string): boolean;
/** 白箱 adapter 依赖注入。 */
export interface WhiteboxAdapterDeps {
    /** 灵枢桥（MCP stdio）——白箱引擎通道。 */
    bridge?: LingshuBridge;
    /**
     * 降级 LLM：白箱未命中（route=llm / 桥未就绪）时转发。由 installWhiteboxLlm
     * 注入 DSH 的 llm 服务（走 fallbackProvider 路由），实现「白箱优先 + LLM 降级」。
     */
    fallback?: {
        stream(o: LlmGenerateOptions): AsyncIterable<LlmStreamChunk>;
    };
}
/** 白箱 LLM adapter —— 注册为 DSH 的 provider。 */
export declare class WhiteboxLlmAdapter {
    private readonly bridge?;
    private readonly fallback?;
    constructor(deps?: WhiteboxAdapterDeps);
    providerInfo(provider: string): {
        id: string;
        name: string;
    };
    providerRetryPolicy(): undefined;
    listModels(): Promise<Array<{
        provider: string;
        id: string;
        name: string;
    }>>;
    resolveModel(provider: string, model: string): Promise<{
        provider: string;
        id: string;
        name: string;
    }>;
    /**
     * 核心：一次模型调用。白箱优先，无把握降级。
     * @param options 完全装配的请求（必须 honor options.signal）
     */
    stream(options: LlmGenerateOptions): AsyncIterable<LlmStreamChunk>;
}
/** provider 路由名（设置页「模型」下拉可见）。 */
export declare const WHITEBOX_PROVIDER = "lingshu-whitebox";
/**
 * 注册白箱 provider 到 DSH llm 服务（动态检测，不强依赖 llm 服务——
 * 最小 host 无 llm 时跳过，插件其余功能不受影响）。
 * @returns 注销函数；未注册返回 noop。
 */
export declare function installWhiteboxLlm(ctx: Context, bridge: LingshuBridge | undefined): () => void;
//# sourceMappingURL=llm_adapter.d.ts.map