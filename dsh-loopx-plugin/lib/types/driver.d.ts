import type { Context } from '@deepseek-ai/cordis';
import type { Agent, AgentStatus, PreStepDecision } from '@deepseek-ai/dsh-agent';
import type { SessionEvent, UserMessage } from '@deepseek-ai/dsh-session';
import type { FileRunner, LoopXCommand } from './cli.ts';
import type { GoalBarDriverActionReceipt, GoalBarSessionCapture } from './goalbar/events.ts';
export declare const name = "dsh-loopx-driver";
export declare const inject: string[];
declare const CONTINUATION_SCHEMA = "loopx_dsh_continuation_v0";
type TimerHandle = unknown;
export interface DriverClock {
    setTimeout(callback: () => void, delayMs: number): TimerHandle;
    clearTimeout(handle: TimerHandle): void;
}
interface LoopXContinuationMessageSource {
    readonly kind: 'loopx-continuation';
    readonly schemaVersion: typeof CONTINUATION_SCHEMA;
    readonly goalId: string;
    readonly agentId: string;
    readonly turnInstanceId: string;
}
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        'loopx-continuation': LoopXContinuationMessageSource;
    }
}
export interface LoopXDriverOptions {
    readonly isLiveAgent: (agent: Agent) => boolean;
    readonly runner?: FileRunner | undefined;
    readonly resolveCommand?: (signal: AbortSignal) => Promise<LoopXCommand>;
    readonly clock?: DriverClock | undefined;
    readonly makeTurnInstanceId?: (() => string) | undefined;
    readonly retryDelaysMs?: readonly number[] | undefined;
    readonly runDetached?: (<T>(operation: () => Promise<T>) => Promise<T>) | undefined;
    readonly warn?: ((message: string) => void) | undefined;
}
/** Exact-session driver with typed activation and no binding mirror or failure counter. */
export declare class LoopXContinuationDriver {
    private readonly states;
    private readonly isLiveAgent;
    private readonly runner;
    private readonly commandResolver;
    private readonly clock;
    private readonly makeTurnInstanceId;
    private readonly retryDelaysMs;
    private readonly runDetached;
    private readonly warn;
    private command?;
    private disposed;
    constructor(options: LoopXDriverOptions);
    observeAgent(agent: Agent): void;
    onAgentDisposed(agent: Agent): void;
    onSessionStart(agent: Agent): void;
    onAgentStatus(agent: Agent, status: AgentStatus): void;
    onInboxInserted(agent: Agent, message: UserMessage): void;
    onInboxClaimed(agent: Agent, message: UserMessage): void;
    onInboxDiscarded(agent: Agent, message: UserMessage): void;
    onAgentError(agent: Agent): void;
    evaluateActivatedSession(capture: GoalBarSessionCapture): Promise<GoalBarDriverActionReceipt>;
    cancelQueued(capture: GoalBarSessionCapture): Promise<GoalBarDriverActionReceipt>;
    onSessionEvent(agent: Agent, event: SessionEvent): void;
    onPreStep(agent: Agent, messages: UserMessage[], signal: AbortSignal, next: () => Promise<PreStepDecision>): Promise<PreStepDecision>;
    dispose(): Promise<void>;
    private stateFor;
    private captureIsLive;
    private ready;
    private requestEvaluation;
    private evaluate;
    private ensureReady;
    private buildPlan;
    private authorityStillAllows;
    private reservationIsCurrent;
    private loopXCommand;
    private resolveBinding;
    private readQuota;
    private readHeartbeat;
    private schedule;
    private resolveEvaluationWaiterBatch;
    private resolveEvaluationWaiters;
    private cancelPending;
    private retireReservation;
    private restoreOtherMessages;
    private stopState;
}
export declare function apply(ctx: Context): void;
export {};
