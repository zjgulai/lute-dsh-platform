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
 * 运行时实测：服务上存在 `dispatchRpc`（应用 bundle 2 处）与 `openWireStream`（3 处），
 * 且 `invoke` 接受 (request, signal) 两参；但上游声明把前两者标为 private / 未暴露、
 * 且 `invoke` 只声明一参。此处对**接口** `TypertGateway` 做声明合并补齐（接口可合并，
 * 类不可），使契约与运行时一致。上游修正后可删除本段（ADR-0017）。
 */
declare module '@deepseek-ai/dsh-api-gateway/types' {
  export interface TypertGateway {
    invoke(
      request: { namespace: string; method: string; args: unknown },
      signal?: AbortSignal,
    ): Promise<unknown>
    dispatchRpc(
      endpoint: string,
      payload: { args: unknown },
      signal?: AbortSignal,
    ): Promise<{ ok: boolean; value?: unknown; error?: { code: string; message: string } }>
    openWireStream(endpoint: string, payload: { args: unknown }, signal?: AbortSignal): AsyncIterable<unknown>
  }
}

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
