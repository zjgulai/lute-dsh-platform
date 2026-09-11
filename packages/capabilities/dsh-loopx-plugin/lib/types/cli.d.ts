export type LoopXCliErrorKind = 'aborted' | 'missing' | 'timeout' | 'transport' | 'output_limit' | 'exit' | 'typed_failure' | 'invalid_json' | 'invalid_schema';
export declare class LoopXCliError extends Error {
    readonly kind: LoopXCliErrorKind;
    readonly retryable: boolean;
    readonly exitCode?: number | undefined;
    constructor(kind: LoopXCliErrorKind, message: string, retryable: boolean, exitCode?: number | undefined);
}
export interface FileResult {
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
}
export interface FileRunOptions {
    readonly cwd?: string | undefined;
    readonly env?: NodeJS.ProcessEnv | undefined;
    readonly signal?: AbortSignal | undefined;
    readonly timeoutMs?: number | undefined;
    readonly maxOutputBytes?: number | undefined;
}
export type FileRunner = (file: string, args: readonly string[], options: FileRunOptions) => Promise<FileResult>;
export interface LoopXCommand {
    readonly file: string;
    readonly prefix: readonly string[];
    readonly skillCommand: string;
    readonly version: string;
}
export interface ManagedLoopXLauncher {
    readonly path: string;
    readonly pythonBins: readonly string[];
}
export interface ResolveLoopXCommandOptions {
    readonly runner?: FileRunner | undefined;
    readonly signal?: AbortSignal | undefined;
    readonly env?: NodeJS.ProcessEnv | undefined;
    readonly managedLauncher?: ManagedLoopXLauncher | undefined;
}
export declare const runFile: FileRunner;
export interface JsonCommandOptions extends FileRunOptions {
    readonly runner?: FileRunner | undefined;
    readonly attempts?: number | undefined;
    readonly retryDelaysMs?: readonly number[] | undefined;
    readonly validate?: ((payload: Record<string, unknown>) => boolean) | undefined;
}
export type JsonMutationCommandOptions = Omit<JsonCommandOptions, 'attempts' | 'retryDelaysMs' | 'signal'>;
/**
 * Execute one mutation exactly once. Caller cancellation is intentionally not
 * accepted: admission is fenced before this function is called, and the real
 * runner waits for child close after every forced termination.
 */
export declare function runJsonMutationCommand(command: LoopXCommand, args: readonly string[], options?: JsonMutationCommandOptions): Promise<Record<string, unknown>>;
/** Execute fixed argv and retry only transport/timeout/untyped-exit failures. */
export declare function runJsonCommand(command: LoopXCommand, args: readonly string[], options?: JsonCommandOptions): Promise<Record<string, unknown>>;
/** Resolve the console script first, then the stable Python module fallback. */
export declare function resolveLoopXCommand(options?: ResolveLoopXCommandOptions): Promise<LoopXCommand>;
