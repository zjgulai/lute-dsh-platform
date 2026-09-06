import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session';
import type { GoalBarAgentStatusV1 } from './protocol.ts';
export interface GoalBarSessionCapture {
    readonly agent: Agent;
    readonly session: Session;
}
export type GoalBarSessionNotification = {
    readonly kind: 'candidate';
    readonly sessionId: string;
    readonly sessionEventSeq: number;
} | {
    readonly kind: 'runtime_changed';
    readonly sessionId: string;
    readonly agentStatus: GoalBarAgentStatusV1;
};
export type GoalBarSessionWaitReceipt = GoalBarSessionNotification | {
    readonly kind: 'timeout';
    readonly sessionEventSeq: number | null;
} | {
    readonly kind: 'session_unavailable';
} | {
    readonly kind: 'aborted';
} | {
    readonly kind: 'service_disposed';
};
export type GoalBarDriverActionReceipt = {
    readonly kind: 'applied';
} | {
    readonly kind: 'unavailable';
    readonly reason: 'driver_unavailable' | 'session_unavailable' | 'evaluation_unavailable';
};
export interface GoalBarDriverBridge {
    evaluateActivatedSession(capture: GoalBarSessionCapture): Promise<GoalBarDriverActionReceipt>;
    cancelQueued(capture: GoalBarSessionCapture): Promise<GoalBarDriverActionReceipt>;
}
export interface GoalBarSessionWaitOptions {
    readonly signal: AbortSignal;
    readonly timeoutMs: number;
    readonly observedAgentStatus: GoalBarAgentStatusV1 | null;
    readonly isSessionCurrent: () => boolean;
    readonly getAgentStatus: () => GoalBarAgentStatusV1 | undefined;
}
export interface GoalBarWatchService {
    waitForSessionChange(session: Session, afterSessionEventSeq: number | null, options: GoalBarSessionWaitOptions): Promise<GoalBarSessionWaitReceipt>;
    dispose(): void;
}
export declare function latestSessionEventSeq(session: Session): number | null;
export declare function latestGoalBarCandidateSeq(session: Session): number | null;
/** Exact-Session event coordinator; it owns waiters, never business snapshots. */
export declare class GoalBarCoordinator {
    private readonly waiters;
    private driverBridge?;
    openWatchService(): GoalBarWatchService;
    publishSessionCandidate(session: Session, event: SessionEvent<'step/end'> | SessionEvent<'turn/end'>): void;
    publishAgentStatus(session: Session, status: GoalBarAgentStatusV1): void;
    invalidateSession(session: Session): void;
    registerDriverBridge(bridge: GoalBarDriverBridge): () => void;
    evaluateActivatedSession(capture: GoalBarSessionCapture): Promise<GoalBarDriverActionReceipt>;
    cancelQueued(capture: GoalBarSessionCapture): Promise<GoalBarDriverActionReceipt>;
    private waitForSessionChange;
    private settle;
    private invokeDriver;
}
export declare const goalBarCoordinator: GoalBarCoordinator;
