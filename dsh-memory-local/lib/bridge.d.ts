/**
 * 灵枢 MCP stdio 桥：管理灵枢（AEIS）Python 子进程的生命周期，
 * 通过逐行 JSON-RPC 完成握手、工具发现与调用。
 *
 * 与官方 @deepseek-ai/dsh-mcp-client 不同，本桥零运行时依赖（不引入
 * @modelcontextprotocol/sdk），直接实现灵枢 server 使用的 2024-11-05 协议
 * 子集——与灵枢库 D-005「核心零外部依赖」的工程哲学一致。
 */
/** 灵枢 MCP server 暴露的原始工具（tools/list 结果项）。 */
export interface McpTool {
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
}
/** 一次 tools/call 的标准化结果。 */
export interface McpCallResult {
    content: Array<{
        type: string;
        text?: string;
        [key: string]: unknown;
    }>;
    isError: boolean;
}
/** 启动灵枢子进程的配置。 */
export interface BridgeOptions {
    /** Python 可执行文件（或 aeis-mcp console script），默认 python。 */
    python: string;
    /** 传给 python 的参数，默认 ['-m', 'aeis.mcp.server']。 */
    args: string[];
    /** 追加到子进程的环境变量（AEIS_DB / AEIS_IDENTITY / 密钥等）。 */
    env: Record<string, string>;
    /** 子进程工作目录。 */
    cwd?: string;
    /** 单次工具调用超时（毫秒），默认 60s。 */
    timeoutMs: number;
    /** 断线重连的最大间隔（毫秒），默认 30s。 */
    maxRetryDelayMs: number;
}
export declare class LingshuBridge {
    private readonly options;
    private proc;
    private rl;
    private nextId;
    private pending;
    private started;
    private disposed;
    private retryDelayMs;
    private retries;
    private retryTimer;
    private bootQueue;
    private readyState;
    constructor(options: BridgeOptions);
    /**
     * 启动灵枢进程并完成握手（initialize → notifications/initialized）。
     * 进程崩溃后自动指数退避重启，并重新握手。
     */
    start(): void;
    /** 拉取灵枢的全部工具清单（每次实时请求，不缓存）。 */
    listTools(): Promise<McpTool[]>;
    /** 调用灵枢的一个工具，返回标准化 MCP 结果。 */
    callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<McpCallResult>;
    /** 关闭进程并释放资源（写 stdin EOF 优雅退出，超时兜底 kill）。 */
    dispose(): void;
    /** 进程是否存活。 */
    get alive(): boolean;
    /** 桥是否已握手就绪（工具注册用；防止轮询访问 private readyState）。 */
    isReady(): boolean;
    /** 是否已达放弃终态（连续启动失败超上限，不再自动重启）。 */
    get gaveUp(): boolean;
    /** 等待握手完成（用于 apply 阶段同步就绪）。 */
    waitReady(): Promise<boolean>;
    private spawnAndHandshake;
    private handshake;
    private scheduleRetry;
    private writeRaw;
    private request;
    private settle;
    private rejectAll;
    private flushBootQueue;
}
