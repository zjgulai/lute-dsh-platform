/**
 * host 插件上下文的最小契约（本包只使用 sessionController 与 tools）。
 * 由类型供给覆盖不到的宿主面在此显式声明，避免 checkJs 下的隐式 any。
 */
interface SessionControllerContract {
  list(input: Record<string, unknown>): Promise<{ items?: Array<Record<string, unknown>> }>;
  inspect(sessionId: string): Promise<Record<string, unknown>>;
  rename(input: { sessionId: string; title: string }): Promise<{ title: string; seq?: number }>;
}

interface HostToolRegistration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  output: Record<string, unknown>;
  timeoutMs: number;
  execute(args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

interface RenameConversationsContext {
  sessionController: SessionControllerContract;
  tools: { register(tool: HostToolRegistration): unknown };
}
