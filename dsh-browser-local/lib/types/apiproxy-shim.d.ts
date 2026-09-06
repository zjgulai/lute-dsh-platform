/**
 * Alpha.1 compatibility layer for the rc `@deepseek-ai/dsh-host-apiproxy`
 * surface used by `@yuxianglin/dsh-bridge-browser`.
 *
 * The rc apiproxy package does not exist in the desktop's 0.1.2-alpha.1
 * kernel (renamed to the Typert Gateway). This module re-implements the small
 * slice of the rc surface the bridge uses, on top of `TypertGatewayService`:
 *
 *   - `RpcId` / `MuxFrame` / `RpcRequest` — wire types (locally redefined)
 *   - `ApiProxy` — the rc-shaped gateway API object (sessions/workspace/events)
 *   - `toFetchHandler` — fetch-shaped dispatch the bridge routes extension
 *     gateway RPC frames through; the envelope is identical to the rc
 *     carrier ({ result: { ok, value } | { ok: false, error } })
 *   - `events.mux` — the `$events` remote event stream adapted to the rc
 *     MuxFrame shape; waterfall events are auto-acked on behalf of the
 *     extension (the rc extension never acks, alpha requires it)
 *
 * @module @yuxianglin/dsh-bridge-browser/src/apiproxy-shim
 */
import type { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
/** rc branded rpc correlation id (runtime is a plain string). */
export type RpcId = string;
/** Runtime branded-constructor shim: `RpcId(uuid)` is identity. */
export declare const RpcId: (value: string) => string;
/** rc session id (runtime is a plain string). */
export type SessionId = string;
/** rc workspace id (runtime is a plain string). */
export type WorkspaceId = string;
/** Minimal image-limits shape; passed through from the host attachments service. */
export interface ImageAttachmentLimits {
    [key: string]: unknown;
}
/** rc wire envelope: one request with its payload. */
export interface RpcRequest<P> {
    rpcId: RpcId;
    payload: P;
}
/** rc mux frame the extension understands (`frame.method === payload.type`). */
export interface MuxFrame {
    type: string;
    event: unknown;
    eventId?: string;
}
/** Typert result envelope (identical shape in rc and alpha). */
export type RpcResult<T = unknown> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: {
        code: string;
        message: string;
    };
};
/** rc carrier body: `{ result: RpcResult }`. */
export interface Envelope<T = unknown> {
    result: RpcResult<T>;
}
/** Translate an rc dot-method into the alpha slash-endpoint. `$events*` names pass through. */
export declare function toEndpoint(method: string): string;
/** The rc-shaped gateway object the bridge wrappers and server consume. */
export interface ApiProxy {
    sessions: {
        list(req: RpcRequest<Record<string, never>>): Promise<Envelope<{
            items: Array<{
                sessionId: SessionId;
                running: boolean;
            }>;
        }>>;
        create(req: RpcRequest<{
            workspaceId?: WorkspaceId;
            cwd?: string;
            sessionId?: SessionId;
            [key: string]: unknown;
        }>): Promise<Envelope<{
            sessionId: SessionId;
        }>>;
        history(req: RpcRequest<{
            sessionId: SessionId;
        }>): Promise<Envelope<unknown>>;
        prompt(req: RpcRequest<{
            sessionId: SessionId;
            [key: string]: unknown;
        }>): Promise<Envelope<unknown>>;
    };
    workspace?: {
        create(req: RpcRequest<{
            path: string;
        }>): Promise<Envelope<{
            workspace: {
                workspaceId: WorkspaceId;
            };
        }>>;
    };
    events: {
        mux(req: RpcRequest<Record<string, never>>, signal: AbortSignal): AsyncIterable<RpcRequest<MuxFrame>>;
    };
}
/** Build the rc-shaped ApiProxy over the alpha Typert Gateway. */
export declare function makeApiProxy(gateway: TypertGatewayService): ApiProxy;
/**
 * Fetch-shaped gateway carrier. Extension RPC frames arrive as
 * `POST /api/<method>` with body `{ type, rpcId, method, payload }` and are
 * answered with the rc envelope body. Methods intercepted by the deferral /
 * workspace wrappers are routed through the wrapped api object so the
 * wrappers keep working; everything else dispatches through the gateway.
 */
export declare function toFetchHandler(api: ApiProxy, gateway: TypertGatewayService): {
    fetch: (request: Request) => Promise<Response>;
};
//# sourceMappingURL=apiproxy-shim.d.ts.map