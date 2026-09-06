import type { Context } from '@deepseek-ai/cordis';
import type { LoopXCliErrorKind } from './cli.ts';
import type { LoopXRuntimeOptions } from './managed-runtime.ts';
export declare const name = "dsh-loopx-init-command";
export declare const inject: string[];
declare const HOST_SURFACE = "deepseek-harness-native";
export type LoopXInitStage = 'probe' | 'install_cli' | 'install_skills' | 'readback';
export type LoopXInitCauseKind = LoopXCliErrorKind | 'incompatible' | 'readback_mismatch';
export declare class LoopXInitError extends Error {
    readonly stage: LoopXInitStage;
    readonly causeKind?: LoopXInitCauseKind | undefined;
    constructor(stage: LoopXInitStage, message: string, causeKind?: LoopXInitCauseKind | undefined);
}
export interface LoopXInitOptions extends LoopXRuntimeOptions {
    readonly skillsDir?: string | undefined;
}
export interface LoopXInitSummary {
    readonly cliVersion: string;
    readonly cliInstalled: boolean;
    readonly skillsInstalled: true;
    readonly skillsChanged: boolean;
    readonly hostSurface: typeof HOST_SURFACE;
}
export type LoopXBootstrapStatus = Readonly<{
    readonly state: 'ready';
} | {
    readonly state: 'failed';
    readonly stage: LoopXInitStage | 'unknown';
    readonly causeKind: LoopXInitCauseKind | 'unknown';
}>;
declare module '@deepseek-ai/cordis' {
    interface Context {
        readonly loopxBootstrap: LoopXBootstrapStatus;
    }
}
/** Install/upgrade LoopX once when needed, then install and verify DSH skills. */
export declare function initializeLoopX(options?: LoopXInitOptions): Promise<LoopXInitSummary>;
/** Register the explicit repair command without changing LoopX readiness. */
export declare function registerLoopXInitCommand(ctx: Context, options?: LoopXInitOptions): void;
/**
 * Make the installed plugin ready before DSH finishes loading this row.
 *
 * Startup failures are isolated to LoopX: DSH still boots and the registered
 * command remains as an explicit retry surface. The awaited happy path keeps a
 * freshly installed profile from racing its first `skill.list` readback.
 */
export declare function apply(ctx: Context, options?: LoopXInitOptions): Promise<void>;
export {};
