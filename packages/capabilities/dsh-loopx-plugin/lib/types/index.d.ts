import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh-loopx-plugin";
export declare const inject: string[];
/** Package-root Host plugin: one GoalBar service, never a second Driver. */
export declare function apply(ctx: Context): void;
export { LoopXCliError, resolveLoopXCommand, runFile, runJsonCommand, runJsonMutationCommand, } from './cli.ts';
export type { FileResult, FileRunner, FileRunOptions, JsonCommandOptions, JsonMutationCommandOptions, LoopXCliErrorKind, LoopXCommand, } from './cli.ts';
export { createGoalBarConnectionHandler, GOALBAR_RPC_CHANNEL, registerGoalBarConnectionRpc, } from './goalbar/connection-rpc.ts';
export { createGoalBarService, decodeGoalBarLifecycleExecutionV1, GoalBarService, } from './goalbar/service.ts';
export type { GoalBarCoordinatorPort, GoalBarServiceHandle, GoalBarServiceOptions, } from './goalbar/service.ts';
export { LoopXContinuationDriver } from './driver.ts';
export type { DriverClock, LoopXDriverOptions } from './driver.ts';
export { initializeLoopX, LoopXInitError, } from './init-command.ts';
export type { LoopXInitOptions, LoopXInitStage, LoopXInitSummary, } from './init-command.ts';
export { resolvePluginLoopXCommand } from './managed-runtime.ts';
export type { LoopXRuntimeOptions } from './managed-runtime.ts';
