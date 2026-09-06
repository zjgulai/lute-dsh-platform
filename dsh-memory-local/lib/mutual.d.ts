export interface MutualOptions {
    /** 心跳间隔（毫秒），默认 10min */
    heartbeatMs: number;
    /** 失联告警阈值（毫秒），默认 25min */
    warnMs: number;
    /** 失联重启阈值（毫秒），默认 35min */
    deadMs: number;
    /** 任务中豁免倍数，默认 ×2 */
    workingFactor: number;
    /** 拉起冷却（毫秒），默认 60s */
    restartCooldownMs: number;
    /** 互维网络目录，默认 ~/.lingxu_net */
    netDir: string;
}
/** 互维网络目录定位 */
export declare function netDir(opts?: MutualOptions): string;
export declare function writeHeartbeat(opts?: MutualOptions, taskRunning?: boolean): void;
export declare function readHeartbeat(which: 'a' | 'web', opts?: MutualOptions): {
    ts: number;
    pid: number;
    task_running: boolean;
    ageMs: number;
} | null;
/** 失联分级判定（纯函数，A 侧 judge_stamp 的 B 侧镜像） */
export declare function judgeStamp(stamp: {
    ageMs: number;
    task_running: boolean;
} | null, opts?: MutualOptions): 'alive' | 'alive_working' | 'warning' | 'dead' | 'no_stamp';
/** 检测 harness 进程是否存在
 * P1 完善（GPT 审查·wmic 兼容）：wmic 在 Win11+ 已被移除——失败时
 * fallback PowerShell Get-CimInstance（Win）；非 Windows 用 ps 查询。 */
export declare function harnessRunning(): Promise<boolean>;
/** detached 拉起 A 侧 harness.guardian（幂等：先确认不存在） */
export declare function ensureHarness(python?: string, opts?: MutualOptions): Promise<'started' | 'already' | 'failed'>;
export interface VerifyTask {
    id: string;
    type: 'verify' | 'knowledge_sync';
    from: 'A' | 'B';
    to: 'B' | 'A';
    payload: {
        claim: string;
        evidence?: string;
        expected?: string;
        source_ref?: string;
    };
    status: 'pending' | 'processing' | 'done';
    created_at: number;
}
export interface VerifyResult {
    task_id: string;
    verdict: 'pass' | 'fail' | 'needs_revision';
    whitebox: {
        judgment: string;
        best: string;
        d_norm: number;
        record_id: string;
    };
    llm_review: {
        conclusion: string;
        reason: string;
    };
    reasons: string[];
    evidence: string[];
    verifier: 'B';
    at: number;
}
/** 扫描互维目录里 A→B 的 pending 任务 */
export declare function scanTasks(opts?: MutualOptions): VerifyTask[];
/** 白箱通道：智慧之书 base_verify（通过 bridge 调用，或本地注入） */
export declare function whiteboxVerify(claim: string, verifyFn: (c: string) => Promise<{
    judgment: string;
    best: string;
    d_norm: number;
    record_id: string;
}>): Promise<VerifyResult['whitebox']>;
/** 复核通道：DeepSeek 独立复核（在白箱判定之上） */
export declare function llmReview(claim: string, whitebox: VerifyResult['whitebox'], reviewFn: (c: string, w: VerifyResult['whitebox']) => Promise<{
    conclusion: string;
    reason: string;
}>): Promise<VerifyResult['llm_review']>;
/** 综合 verdict（白箱优先） */
export declare function combineVerdict(w: VerifyResult['whitebox'], l: VerifyResult['llm_review']): VerifyResult['verdict'];
export declare function safeTaskId(id: string): boolean;
/** 处理单个任务：双通道验证 → 写回 result */
export declare function processTask(task: VerifyTask, verifyFn: (c: string) => Promise<{
    judgment: string;
    best: string;
    d_norm: number;
    record_id: string;
}>, reviewFn: (c: string, w: VerifyResult['whitebox']) => Promise<{
    conclusion: string;
    reason: string;
}>, opts?: MutualOptions): Promise<VerifyResult | null>;
export declare function log(opts: MutualOptions, msg: string): void;
export declare function writeLastContact(opts?: MutualOptions): void;
export declare function installMutualMaintenance(ctx: {
    logger: {
        info(m: string): void;
    };
    effect(fn: () => () => void, name?: string): void;
}, config?: Partial<MutualOptions>, hooks?: {
    verify?: (c: string) => Promise<{
        judgment: string;
        best: string;
        d_norm: number;
        record_id: string;
    }>;
    review?: (c: string, w: VerifyResult['whitebox']) => Promise<{
        conclusion: string;
        reason: string;
    }>;
}): void;
declare const _default: {
    installMutualMaintenance: typeof installMutualMaintenance;
    writeHeartbeat: typeof writeHeartbeat;
    readHeartbeat: typeof readHeartbeat;
    judgeStamp: typeof judgeStamp;
    scanTasks: typeof scanTasks;
    processTask: typeof processTask;
};
export default _default;
