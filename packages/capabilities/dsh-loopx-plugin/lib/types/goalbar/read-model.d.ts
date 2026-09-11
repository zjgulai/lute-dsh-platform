import type { FileRunner, LoopXCommand } from '../cli.ts';
import type { GoalBarActivationV1, GoalBarAgentStatusV1, GoalBarProgressV1, GoalBarReadFaultCode, GoalBarSnapshotV1 } from './protocol.ts';
export declare const GOALBAR_HOST_SURFACE: "deepseek-harness-native";
export declare const GOALBAR_PROJECT_REGISTRY: ".loopx/registry.json";
export declare const GOALBAR_ACTIVE_STATE_ROOT: ".codex/goals";
export declare const GOALBAR_ACTIVE_STATE_FILE: "ACTIVE_GOAL_STATE.md";
export interface GoalBarCliReadOptions {
    readonly command: LoopXCommand;
    readonly cwd: string;
    readonly runner?: FileRunner | undefined;
    readonly signal?: AbortSignal | undefined;
    readonly env?: NodeJS.ProcessEnv | undefined;
    readonly retryDelaysMs?: readonly number[] | undefined;
}
export interface GoalBarReadModelOptions extends GoalBarCliReadOptions {
    readonly sessionId: string;
    readonly agentStatus: GoalBarAgentStatusV1;
}
export interface GoalBarSourceRevisionOptions {
    readonly cwd: string;
    readonly goalId?: string | undefined;
    readonly loopxAgentId?: string | undefined;
}
export declare class GoalBarSourceRevisionError extends Error {
}
export declare function unavailableGoalBarSourceRevision(): string;
/** Hash only the fixed authoritative paths; contents and local paths never cross the wire. */
export declare function computeGoalBarSourceRevision(options: GoalBarSourceRevisionOptions): Promise<string>;
export interface GoalBarStableReadResult {
    readonly model: GoalBarReadModelResult;
    readonly sourceRevision: string;
}
export type GoalBarSourceRevisionReader = (options: GoalBarSourceRevisionOptions) => Promise<string>;
/**
 * Observe the same authoritative bytes before and after their CLI-derived read.
 * A concurrent equal-size write or atomic replacement retries the whole model.
 */
export declare function readStableGoalBarModel(options: GoalBarReadModelOptions, revisionReader?: GoalBarSourceRevisionReader): Promise<GoalBarStableReadResult>;
export type DecodedBindingResolutionV0 = {
    readonly kind: 'missing';
} | {
    readonly kind: 'bound';
    readonly goalId: string;
    readonly loopxAgentId: string;
} | {
    readonly kind: 'ambiguous';
    readonly uniquePairCount: number;
} | {
    readonly kind: 'unavailable';
};
export type GoalBarBindingReadResult = DecodedBindingResolutionV0 | {
    readonly kind: 'fault';
    readonly code: GoalBarReadFaultCode;
};
export type GoalBarActivationReadResult = {
    readonly kind: 'value';
    readonly goalActivation: GoalBarActivationV1;
} | {
    readonly kind: 'fault';
    readonly code: GoalBarReadFaultCode;
};
export type GoalBarProgressReadResult = {
    readonly kind: 'value';
    readonly progress: GoalBarProgressV1;
} | {
    readonly kind: 'fault';
    readonly code: GoalBarReadFaultCode;
};
export type GoalBarReadModelResult = {
    readonly kind: 'hidden';
    readonly reason: 'binding_missing';
} | {
    readonly kind: 'hidden';
    readonly reason: 'binding_ambiguous';
    readonly uniquePairCount: number;
} | {
    readonly kind: 'present';
    readonly snapshot: GoalBarSnapshotV1;
} | {
    readonly kind: 'fault';
    readonly code: GoalBarReadFaultCode;
    readonly binding?: BindingPair | undefined;
};
export interface BindingPair {
    readonly goalId: string;
    readonly loopxAgentId: string;
}
/**
 * Validate the authoritative resolver relation while retaining process status.
 * Duplicate records for one exact pair are collapsed before the 0/1/>1 test.
 */
export declare function decodeThreadAgentBindingResolutionV0(value: unknown, expectedSessionId: string, exitCode: number): DecodedBindingResolutionV0 | undefined;
export declare function decodeGoalActivationPreviewV1(value: unknown, expectedGoalId: string, exitCode: number): GoalBarActivationV1 | undefined;
export declare function decodeAgentLaneTodoProgressV0(value: unknown, expectedGoalId: string, expectedAgentId: string, exitCode: number): GoalBarProgressV1 | undefined;
export declare function readGoalBarBinding(options: GoalBarCliReadOptions, sessionId: string): Promise<GoalBarBindingReadResult>;
export declare function readGoalBarActivation(options: GoalBarCliReadOptions, goalId: string): Promise<GoalBarActivationReadResult>;
export declare function readGoalBarProgress(options: GoalBarCliReadOptions, goalId: string, loopxAgentId: string): Promise<GoalBarProgressReadResult>;
export declare function readGoalBarModel(options: GoalBarReadModelOptions): Promise<GoalBarReadModelResult>;
