import type { Context } from '@deepseek-ai/cordis';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
/** Cordis service names required before the materialized Client plugin applies. */
export declare const inject: readonly ["connection", "locale", "slots"];
type GoalBarClientContext = Context & {
    readonly connection: ConnectionHandle;
};
/** Register the exact-Session LoopX GoalBar contribution and its owned copy. */
export declare function apply(ctx: GoalBarClientContext): void;
export {};
