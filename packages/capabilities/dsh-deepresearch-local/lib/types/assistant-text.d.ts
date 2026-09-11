/** Read live Agent assistant text from the session log, not nonexistent `.messages`. */
import type { AgentHandle } from '@deepseek-ai/dsh-agent';
type SessionLike = {
    readonly id: {
        toString?(): string;
    } | string;
    deriveMessages(): ReadonlyArray<{
        role?: string;
        content?: unknown;
    }>;
    /**
     * 运行时实例提供 events（dsh-session 实现里有 `this.events`，本文件的草稿推送
     * 依赖它），但该包的**公开声明未暴露**此成员——属 ADR-0017 记录过的「上游类型
     * 完整性缺口」同型。故声明为可选并在读取处兜底；上游补齐后可改回必需。
     */
    readonly events?: ReadonlyArray<{
        type: string;
        data?: unknown;
    }>;
};
/** Flatten text out of a message content payload. */
export declare function messageText(content: unknown): string;
/** Latest assembled assistant prose, or in-flight stream chunks if the message is not on the surface yet. */
export declare function assistantTextFromSession(session: SessionLike): string;
/** Latest assistant text for a live generation Agent. */
export declare function lastAssistantText(handle: AgentHandle): string;
/** Stream draft updates from `session/event` plus a deriveMessages poll. */
export declare function watchDraft(handle: AgentHandle, onDraft: (text: string) => void, maxChars?: number): () => void;
export {};
//# sourceMappingURL=assistant-text.d.ts.map