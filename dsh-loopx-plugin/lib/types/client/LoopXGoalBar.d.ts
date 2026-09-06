import type { JSX } from 'react';
import { type GoalBarTranslate } from './locale.ts';
import type { GoalBarRpc } from './rpc.ts';
import { type GoalBarConnectionResetSubscriber } from './useGoalBar.ts';
export interface LoopXGoalBarProps {
    /** Exact identity supplied only by conversation.input.dock inject(sessionId). */
    readonly rpcSessionId: string;
    readonly rpc: GoalBarRpc;
    readonly t: GoalBarTranslate;
    readonly subscribeConnectionReset?: GoalBarConnectionResetSubscriber | undefined;
}
/** Compact, accessible presentation for one exact LoopX Goal binding. */
export declare function LoopXGoalBar({ rpcSessionId, rpc, t, subscribeConnectionReset, }: LoopXGoalBarProps): JSX.Element | null;
