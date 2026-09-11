import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { GoalBarClientFaultCode, GoalBarAgentStatusV1, GoalBarExpectedBindingV1, GoalBarRequestV1, GoalBarResponseFor } from '../goalbar/protocol.ts';
export type GoalBarRpcOutcome<T> = {
    readonly ok: true;
    readonly response: T;
} | {
    readonly ok: false;
    readonly code: GoalBarClientFaultCode;
};
export type GoalBarReadResponseV1 = GoalBarResponseFor<Extract<GoalBarRequestV1, {
    readonly op: 'read';
}>>;
export type GoalBarWatchResponseV1 = GoalBarResponseFor<Extract<GoalBarRequestV1, {
    readonly op: 'watch';
}>>;
export type GoalBarStartResponseV1 = GoalBarResponseFor<Extract<GoalBarRequestV1, {
    readonly op: 'start';
}>>;
export type GoalBarPauseResponseV1 = GoalBarResponseFor<Extract<GoalBarRequestV1, {
    readonly op: 'pause';
}>>;
export interface GoalBarWatchAnchorV1 {
    readonly afterSessionEventSeq: number | null;
    readonly sourceRevision: string;
    readonly expected: GoalBarExpectedBindingV1 | null;
    readonly agentStatus: GoalBarAgentStatusV1 | null;
}
/** The four browser operations consumed by one mounted GoalBar instance. */
export interface GoalBarRpc {
    read(sessionId: string, signal: AbortSignal): Promise<GoalBarRpcOutcome<GoalBarReadResponseV1>>;
    watch(sessionId: string, anchor: GoalBarWatchAnchorV1, signal: AbortSignal): Promise<GoalBarRpcOutcome<GoalBarWatchResponseV1>>;
    start(sessionId: string, expected: GoalBarExpectedBindingV1, signal: AbortSignal): Promise<GoalBarRpcOutcome<GoalBarStartResponseV1>>;
    pause(sessionId: string, expected: GoalBarExpectedBindingV1, signal: AbortSignal): Promise<GoalBarRpcOutcome<GoalBarPauseResponseV1>>;
}
type ConnectionRpcCaller = Pick<ClientConnectionRpc, 'call'>;
/**
 * Wrap DSH's generic Connection caller with the closed GoalBar V2 wire.
 * Carrier errors and thrown values are deliberately discarded at this boundary.
 */
export declare function createGoalBarRpc(caller: ConnectionRpcCaller): GoalBarRpc;
export {};
