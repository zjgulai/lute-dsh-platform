/**
 * host 插件上下文的最小契约（本包只使用 sessionController 与 tools）。
 * 由类型供给覆盖不到的宿主面在此显式声明，避免 checkJs 下的隐式 any。
 */
interface CostGuardSessionController {
  list(input: Record<string, unknown>): Promise<{ items?: Array<Record<string, any>> }>;
  inspect(sessionId: string): Promise<Record<string, any>>;
}

interface CostGuardToolRegistration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  output: Record<string, unknown>;
  timeoutMs: number;
  execute(args: Record<string, any>): Promise<Record<string, any>>;
}

interface CostGuardConfig {
  limits?: { sessionUsd?: number; taskUsd?: number; dayUsd?: number };
  compactKeepTokens?: number;
  maxSessions?: number;
  overrides?: Record<string, { hit?: number; miss?: number; out?: number }>;
}

interface CostGuardContext {
  sessionController: CostGuardSessionController;
  tools: { register(tool: CostGuardToolRegistration): unknown };
}
