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
import { randomUUID } from 'node:crypto';
/** Runtime branded-constructor shim: `RpcId(uuid)` is identity. */
export const RpcId = (value) => value;
/** rc client method → alpha typert endpoint (dot → slash, plus renames). */
const METHOD_MAP = {
    'session.history': 'session/page',
};
/** Translate an rc dot-method into the alpha slash-endpoint. `$events*` names pass through. */
export function toEndpoint(method) {
    if (method.startsWith('$events'))
        return method;
    const mapped = METHOD_MAP[method];
    if (mapped !== undefined)
        return mapped;
    if (/^[A-Za-z][A-Za-z0-9-]*\.[A-Za-z][A-Za-z0-9-]*$/.test(method))
        return method.replace('.', '/');
    return method;
}
/** Build the rc-shaped ApiProxy over the alpha Typert Gateway. */
export function makeApiProxy(gateway) {
    // alpha controller descriptors declare one wire parameter named `request`;
    // the args container must therefore be `{ request: payload }` (invoke takes
    // namespace/method separately). invoke() throws TypertGatewayError carrying
    // the zod cause — enrich the relayed message so wire mismatches are visible.
    const rpc = (endpoint) => (payload) => {
        const [ns, m] = endpoint.split('/');
        return gateway
            .invoke({ namespace: ns, method: m, args: { request: payload } }, new AbortController().signal)
            .then((value) => ({ result: { ok: true, value } }))
            .catch((error) => {
            const e = error;
            let message = e instanceof Error ? e.message : String(error);
            const cause = e.cause;
            if (cause instanceof Error && message.includes('boundary validation')) {
                message += ` | zod: ${cause.message.slice(0, 400)}`;
            }
            return { result: { ok: false, error: { code: e.code ?? 'internal', message } } };
        });
    };
    return {
        sessions: {
            list: rpc('session/list'),
            create: rpc('session/create'),
            // alpha `session/page` takes {address, throughSeq} and returns
            // {records, hasMore, projections}; rc `session.history` takes
            // {sessionId} and returns {events, hasMore?, projections?}.
            // Resolve the cursor from session/list's projections.asOfSeq, then
            // reshape records[{type:'event', event}] into events[{event}].
            history: (async (req) => {
                const { sessionId } = req.payload;
                let throughSeq = -1;
                try {
                    const listed = await gateway.dispatchRpc('session/list', { args: { request: {} } }, new AbortController().signal);
                    if (listed.ok === true && listed.value !== undefined) {
                        const items = listed.value.items;
                        const item = Array.isArray(items) ? items.find((entry) => entry.sessionId === sessionId) : undefined;
                        if (item?.projections !== undefined && typeof item.projections.asOfSeq === 'number')
                            throughSeq = item.projections.asOfSeq;
                    }
                }
                catch {
                    /* best-effort cursor: -1 yields an empty page instead of failing */
                }
                let pageResult;
                try {
                    const value = await gateway.invoke({ namespace: 'session', method: 'page', args: { request: { address: { kind: 'session', sessionId }, throughSeq } } }, new AbortController().signal);
                    pageResult = { ok: true, value };
                }
                catch (error) {
                    const e = error;
                    let message = e instanceof Error ? e.message : String(error);
                    const cause = e.cause;
                    if (cause instanceof Error)
                        message += ` | zod: ${cause.message.slice(0, 400)}`;
                    pageResult = { ok: false, error: { code: e.code ?? 'internal', message } };
                }
                if (pageResult.ok !== true) {
                    return { result: pageResult };
                }
                const value = pageResult.value;
                const events = (Array.isArray(value.records) ? value.records : [])
                    .filter((record) => record?.type === 'event' && record.event !== undefined)
                    .map((record) => ({ event: record.event }));
                const reshaped = {
                    events,
                    hasMore: value.hasMore ?? false,
                };
                if (value.projections !== undefined)
                    reshaped.projections = value.projections;
                return { result: { ok: true, value: reshaped } };
            }),
            // alpha requires a requestId on session/prompt; the rc panel never sends one.
            prompt: ((req) => {
                const payload = { ...req.payload };
                if (payload.requestId === undefined)
                    payload.requestId = randomUUID();
                return rpc('session/prompt')(payload);
            }),
        },
        workspace: { create: rpc('workspace/create') },
        events: {
            async *mux(_req, signal) {
                const stream = gateway.openWireStream('$events', { args: {} }, signal);
                let clientId;
                for await (const frame of stream) {
                    if (frame.type === 'ready') {
                        clientId = frame.clientId;
                        continue;
                    }
                    if (frame.type !== 'emit' && frame.type !== 'waterfall')
                        continue;
                    const payload = { type: frame.event ?? 'session/event', event: frame.args };
                    if (frame.eventId !== undefined)
                        payload.eventId = frame.eventId;
                    yield { rpcId: randomUUID(), payload };
                    // alpha requires each waterfall event to be acked before the source
                    // settles; the rc extension never acks, so ack on its behalf.
                    if (frame.type === 'waterfall' && frame.eventId !== undefined && clientId !== undefined) {
                        gateway
                            .dispatchRpc('$events/result', { args: { clientId, eventId: frame.eventId, outcome: { kind: 'next' } } }, signal)
                            .catch(() => { });
                    }
                }
            },
        },
    };
}
/* ------------------------------ fetch handler ----------------------------- */
/**
 * Fetch-shaped gateway carrier. Extension RPC frames arrive as
 * `POST /api/<method>` with body `{ type, rpcId, method, payload }` and are
 * answered with the rc envelope body. Methods intercepted by the deferral /
 * workspace wrappers are routed through the wrapped api object so the
 * wrappers keep working; everything else dispatches through the gateway.
 */
export function toFetchHandler(api, gateway) {
    const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    return {
        fetch: async (request) => {
            const url = new URL(request.url);
            const path = url.pathname.replace(/^\/api\//, '');
            let body = {};
            try {
                body = (await request.json());
            }
            catch {
                /* empty body is tolerated */
            }
            try {
                if (path === 'respond') {
                    // alpha host interactions are direct ask(); nothing to relay — ack.
                    return json({ result: { ok: true, value: undefined } }, 200);
                }
                const method = body.method ?? path;
                // Route on the RC method name (dot format, rc namespace naming) so the
                // deferral/workspace wrappers intercept their methods; only methods the
                // wrapped api does not own fall through to the generic gateway dispatch.
                const mapped = toEndpoint(method);
                const [rcNs, rcM] = method.split('.');
                let envelope;
                const sessionsApi = api.sessions;
                const workspaceApi = api.workspace;
                if (rcNs === 'session' && rcM !== undefined && typeof sessionsApi[rcM] === 'function') {
                    envelope = await sessionsApi[rcM]({
                        rpcId: body.rpcId ?? '',
                        payload: body.payload ?? {},
                    });
                }
                else if (rcNs === 'workspace' && rcM !== undefined && workspaceApi !== undefined && typeof workspaceApi[rcM] === 'function') {
                    envelope = await workspaceApi[rcM]({
                        rpcId: body.rpcId ?? '',
                        payload: body.payload ?? {},
                    });
                }
                else {
                    // session/workspace controllers use a single `request` wire param;
                    // other alpha controllers (directoryPicker etc.) use named fields.
                    const [ns] = mapped.split('/');
                    const args = ns === 'session' || ns === 'workspace'
                        ? { request: body.payload ?? {} }
                        : (body.payload ?? {});
                    const result = await gateway.dispatchRpc(mapped, { args }, request.signal);
                    envelope = { result: result };
                }
                return json(envelope, 200);
            }
            catch (error) {
                return json({ result: { ok: false, error: { code: 'internal', message: String(error) } } }, 500);
            }
        },
    };
}
//# sourceMappingURL=apiproxy-shim.js.map