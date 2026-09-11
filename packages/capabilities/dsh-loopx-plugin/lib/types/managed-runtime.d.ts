import type { FileRunner, LoopXCommand } from './cli.ts';
export declare const MANAGED_LAUNCHER_NAME = "loopx_cli.py";
export declare const MANAGED_SITE_PACKAGES_NAME = "site-packages";
export interface LoopXRuntimeOptions {
    readonly runner?: FileRunner | undefined;
    readonly signal?: AbortSignal | undefined;
    readonly env?: NodeJS.ProcessEnv | undefined;
    readonly runtimeDir?: string | undefined;
    readonly pythonBin?: string | undefined;
}
export declare function configuredPluginPython(options: LoopXRuntimeOptions): string | undefined;
export declare function pluginPythonCandidates(options: LoopXRuntimeOptions): readonly string[];
export declare function pluginAgentsHome(options: LoopXRuntimeOptions): string;
export declare function pluginRuntimeDir(options: LoopXRuntimeOptions): string;
/** Resolve the exact CLI surface shared by bootstrap, Driver, and GoalBar. */
export declare function resolvePluginLoopXCommand(options?: LoopXRuntimeOptions): Promise<LoopXCommand>;
