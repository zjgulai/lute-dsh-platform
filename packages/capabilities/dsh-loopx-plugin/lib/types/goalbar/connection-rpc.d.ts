import type { ConnectionRpcHandler, HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';
import type { GoalBarServiceHandle } from './service.ts';
export declare const GOALBAR_RPC_CHANNEL: "/loopx";
/**
 * Close the generic Connection carrier around the GoalBar V2 business union.
 * No exception value or request payload is ever rendered into the carrier.
 */
export declare function createGoalBarConnectionHandler(service: GoalBarServiceHandle): ConnectionRpcHandler;
export declare function registerGoalBarConnectionRpc(connection: HostConnectionHandle, service: GoalBarServiceHandle): () => Promise<void>;
