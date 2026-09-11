import type { Agent } from '@deepseek-ai/dsh-agent';
import type { FileRunner, LoopXCommand } from '../cli.ts';
import type { GoalBarDriverActionReceipt, GoalBarSessionCapture, GoalBarWatchService } from './events.ts';
import type { GoalBarRequestV1, GoalBarResponseV1 } from './protocol.ts';
export interface GoalBarCoordinatorPort {
    openWatchService(): GoalBarWatchService;
    evaluateActivatedSession(capture: GoalBarSessionCapture): Promise<GoalBarDriverActionReceipt>;
    cancelQueued(capture: GoalBarSessionCapture): Promise<GoalBarDriverActionReceipt>;
}
export interface GoalBarServiceOptions {
    readonly getAgent: (sessionId: string) => Agent | undefined;
    readonly coordinator: GoalBarCoordinatorPort;
    readonly command?: LoopXCommand | undefined;
    readonly resolveCommand?: (signal: AbortSignal) => Promise<LoopXCommand>;
    readonly runner?: FileRunner | undefined;
    readonly env?: NodeJS.ProcessEnv | undefined;
    readonly retryDelaysMs?: readonly number[] | undefined;
    readonly watchTimeoutMs?: number | undefined;
    readonly actionTimeoutMs?: number | undefined;
    readonly actionMaxOutputBytes?: number | undefined;
    readonly warn?: ((message: string) => void) | undefined;
}
export interface GoalBarServiceHandle {
    handle(request: GoalBarRequestV1, signal: AbortSignal): Promise<GoalBarResponseV1>;
    dispose(): Promise<void>;
}
/** Strict verified relation for the existing lifecycle execution V1 receipt. */
export declare function decodeGoalBarLifecycleExecutionV1(value: unknown, goalId: string, targetState: 'active' | 'stopped'): boolean;
export declare function fixedGoalBarFailureResponseV1(request: GoalBarRequestV1): GoalBarResponseV1;
export declare class GoalBarService implements GoalBarServiceHandle {
    private readonly getAgent;
    private readonly coordinator;
    private readonly watchService;
    private readonly runner;
    private readonly env;
    private readonly retryDelaysMs;
    private readonly commandResolver;
    private readonly watchTimeoutMs;
    private readonly actionTimeoutMs;
    private readonly actionMaxOutputBytes;
    private readonly warn;
    private readonly disposal;
    private activeAction?;
    private disposed;
    constructor(options: GoalBarServiceOptions);
    handle(request: GoalBarRequestV1, signal: AbortSignal): Promise<GoalBarResponseV1>;
    dispose(): Promise<void>;
    private capture;
    private captureIsCurrent;
    private combinedSignal;
    private logAmbiguity;
    private waitForAdmittedMutation;
    private readResult;
    private readFault;
    private readResponse;
    private watchResponse;
    private waitForWatchChange;
    private actionAdmission;
    private actionResponse;
    private executeAction;
}
export declare function createGoalBarService(options: GoalBarServiceOptions): GoalBarService;
