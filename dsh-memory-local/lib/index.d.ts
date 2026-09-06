/**
 * @furongjun1999/dsh-memory —— 灵枢（AEIS）DeepSeek Harness 插件
 *
 * 把灵枢的时空记忆/知识飞轮/自我认知接入 DSH：
 * - 工具桥接：Agent 可调用 lingshu_remember / recall / search / think 等
 * - 自动记忆：DSH 对话自动沉淀进灵枢记忆库（去重+重要性）
 *
 * 用法（cordis.yml）：
 * ```yaml
 * - id: lingshu-memory
 *   name: '@furongjun1999/dsh-memory'
 *   config:
 *     dbPath: 'D:/path/to/lingshu.db'
 *     identity: '灵枢'
 *     memory:
 *       userMessage: true
 * ```
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type ToolSelection } from './tools.js';
import { type MemoryHooksOptions } from './hooks.js';
export declare const name = "dsh-memory";
/** 本插件依赖的工具注册服务。
 * P1 修复（GPT 审查）：timer/webServer 是可选增强（互维/角色网页），此前强声明
 * 导致最小 host（只有 tools）插件永远 PENDING 不激活。只强依赖 tools；
 * timer/webServer 在 apply 内动态检测（存在则启用，缺失则告警跳过）。 */
export declare const inject: string[];
/** 插件配置。 */
export interface Config {
    /** 工具命名空间前缀（默认 lingshu → lingshu_remember）。 */
    serverName: string;
    /** Python 可执行文件（或 aeis-mcp console script）。 */
    python: string;
    /** 传给 python 的参数（默认启动灵枢 MCP server）。 */
    moduleArgs: string[];
    /** 灵枢记忆库 SQLite 路径（目录自动创建）。 */
    dbPath: string;
    /** 灵枢身份标识（写入记忆的自我模型）。 */
    identity: string;
    /** 额外环境变量（BOCHA_API_KEY / AEIS_DESIGNER_KEY 等，可 !!js 注入）。 */
    env: Record<string, string>;
    /** 暴露的工具集合：'core' | 'brain' | 'all' | 工具名数组。 */
    tools: ToolSelection;
    /** 护栏宪章版本声明（接入即接受宪章约束，docs/guardrail-charter.md）。 */
    charter: string;
    /** 自动记忆开关。 */
    memory: MemoryHooksOptions;
    /** 单次工具调用超时（毫秒）。 */
    toolCallTimeoutMs: number;
    /** 断线重连最大间隔（毫秒）。 */
    maxRetryDelayMs: number;
    /** 启动失败是否让插件激活失败（否则告警后继续重试）。 */
    failOnStartupError: boolean;
    /** 互维维护（Mutual Sustain Loop v1.1）：心跳写戳 + 守护 A + 任务验证。 */
    mutual: {
        enabled: boolean;
        heartbeatMs: number;
    };
}
export declare const Config: z<Config>;
/**
 * 插件激活：启动灵枢子进程 → 注册工具 → 安装自动记忆钩子。
 * 卸载时清理全部资源（effect 作用域内自动回收）。
 */
export declare function apply(ctx: Context, config: Config): Promise<void>;
