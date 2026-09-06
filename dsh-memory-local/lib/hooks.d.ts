/**
 * 自动记忆钩子：把 DSH 的会话事件（经统一的 session/event 分发）沉淀进灵枢。
 *
 * 与 DSH 的 session-persistence 插件（保存会话日志）不同，这里是"语义沉淀"：
 * 用户消息写入灵枢知识层（带去重与重要性），agent 回复与工具结果可选开启。
 * 只记忆真实用户消息（source.kind === 'user'），过滤插件注入的噪音。
 *
 * P1 完善（GPT 审查·自动记忆只写不读）：新增 autoRecall——通过
 * system-prompt/assemble 事件（waterfall，异步允许）在每次模型请求组装
 * system prompt 时自动注入灵枢最近记忆（timeline），让记忆"自动可用"
 * 而不只依赖 Agent 主动调用 recall/think 工具。失败静默（不影响请求）。
 */
import '@deepseek-ai/dsh-session';
import '@deepseek-ai/dsh-system-prompt';
import type { Context } from '@deepseek-ai/cordis';
import type { LingshuBridge } from './bridge.js';
/** 自动记忆开关。 */
export interface MemoryHooksOptions {
    /** 用户消息 → remember（默认 true）。 */
    userMessage: boolean;
    /** agent 回复 → remember（默认 false，防噪音）。 */
    assistantMessage: boolean;
    /** 工具结果 → remember（默认 false，噪音大）。 */
    toolResult: boolean;
    /** 写入记忆的重要性（0~1），默认 0.6。 */
    importance: number;
    /** 自动召回注入：模型请求前自动注入灵枢最近记忆（默认 true，失败静默）。 */
    autoRecall: boolean;
    /** 自动召回条数（默认 4）。 */
    autoRecallLimit: number;
    /** 自动记忆脱敏：写入前过滤敏感信息（密钥/密码/令牌/身份证/手机号，默认 true）。 */
    desensitize: boolean;
}
/** 脱敏：替换敏感片段；返回 null 表示整条都是敏感内容（应跳过写入）。 */
export declare function desensitize(text: string): string | null;
/** 安装自动记忆钩子（effect 作用域内，随插件卸载自动移除）。 */
export declare function installMemoryHooks(ctx: Context, bridge: LingshuBridge, opts: MemoryHooksOptions): void;
