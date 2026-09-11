/**
 * Type shims for the alpha.1 vendored packages (the desktop app ships
 * compiled JS without declaration files). Loose-but-useful declarations for
 * the exact surface @yuxianglin/dsh-bridge-browser consumes.
 */

declare module '@deepseek-ai/cordis' {
  export interface Context<S = unknown> extends Record<string, any> {
    [key: string]: any
    logger: { warn(msg: string): void; info(msg: string): void; error(msg: string): void }
    on(event: string, cb: (...args: any[]) => void): () => void
    effect(fn: (ctx?: any) => void | (() => void), label?: string): void
    get(name: string): any
  }
}

declare module '@deepseek-ai/dsh-tools' {
  export interface ToolDefinition {
    name: string
    description: string
    parameters?: any
    output?: any
    execute?: (...args: any[]) => any
    timeoutMs?: number
    [key: string]: any
  }
  export interface ToolRunContext {
    agent?: { id: string | number }
    signal: AbortSignal
    [key: string]: any
  }
  export function defineTool(options: any): any
}

declare module '@deepseek-ai/dsh-home-paths' {
  export function dshHomePath(name: string): string
}

/**
 * 网桥实际需要的网关面：在上游 `TypertGateway` 之上补齐运行时确实存在、但声明缺失
 * 或标记为 private 的成员（实测应用 bundle 中 dispatchRpc 2 处、openWireStream 3 处，
 * invoke 接受 (request, signal) 两参）。
 *
 * 采用**本地扩展接口**而非 `declare module` 增强：后者在本包会与经 package exports
 * （`./types`）解析出的同名接口分裂成两个身份，触发「同名却互不兼容」（实测）。
 * 本地接口按真实模块身份 extends，不产生分裂。上游补齐后可删除本段（ADR-0017）。
 */
type BridgeTypertGateway = import('@deepseek-ai/dsh-api-gateway/types').TypertGateway & {
  invoke(
    request: { namespace: string; method: string; args: unknown },
    signal?: AbortSignal,
  ): Promise<unknown>;
  dispatchRpc(
    endpoint: string,
    payload: { args: unknown },
    signal?: AbortSignal,
  ): Promise<{ ok: boolean; value?: unknown; error?: { code: string; message: string } }>;
  openWireStream(endpoint: string, payload: { args: unknown }, signal?: AbortSignal): AsyncIterable<unknown>;
};

declare module '@deepseek-ai/dsh-agent' {
  export interface Agent {
    id: string
    inject: (...args: any[]) => any
    [key: string]: any
  }
  export interface AgentRegistry {
    get(id: string): Agent | undefined
    [key: string]: any
  }
}

declare module '@deepseek-ai/dsh-llm' {
  export interface UserMessage { [key: string]: any }
  export function createUserMessage(message: any): UserMessage
}

declare module '@deepseek-ai/schemastery' {
  class z<T = unknown> {
    static object(shape: any): any
    static string(): any
    static number(): any
    static boolean(): any
    static [key: string]: any
  }
  export default z
}

declare module '@deepseek-ai/dsh-attachment' {
  export interface ImageAttachmentLimits { [key: string]: unknown }
}
