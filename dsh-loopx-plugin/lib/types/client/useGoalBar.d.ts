import type { GoalBarActionRejectionCode, GoalBarClientFaultCode, GoalBarReadFaultCode, GoalBarSnapshotV1 } from '../goalbar/protocol.ts';
import type { GoalBarRpc } from './rpc.ts';
export type GoalBarAction = 'start' | 'pause';
export type GoalBarUiErrorCode = GoalBarReadFaultCode | GoalBarClientFaultCode | GoalBarActionRejectionCode | 'operation_result_unknown' | 'driver_sync_failed' | 'post_read_failed';
export type GoalBarConnectionResetSubscriber = (listener: () => void) => () => void;
export interface UseGoalBarOptions {
    /** Exact DSH Session identity supplied by the slot's inject(sessionId) face. */
    readonly rpcSessionId: string;
    readonly rpc: GoalBarRpc;
    readonly subscribeConnectionReset?: GoalBarConnectionResetSubscriber | undefined;
}
export interface UseGoalBarResult {
    readonly snapshot: GoalBarSnapshotV1 | null;
    readonly errorCode: GoalBarUiErrorCode | null;
    readonly syncing: boolean;
    readonly pendingAction: boolean;
    readonly action: GoalBarAction | null;
    readonly actionDisabled: boolean;
    readonly refresh: () => void;
    readonly requestAction: (action: GoalBarAction) => void;
}
/**
 * Own the read/watch/action lifecycle for exactly one mounted component.
 * There is intentionally no shared client cache: every instance has its own
 * generation, cursor, AbortController, and same-frame action fence.
 */
export declare function useGoalBar({ rpcSessionId, rpc, subscribeConnectionReset, }: UseGoalBarOptions): UseGoalBarResult;
