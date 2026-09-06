import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { GoalBarUiErrorCode } from './useGoalBar.ts';
export declare const GOALBAR_LOCALE_NAMESPACE: "loopx.goalbar";
declare const en: {
    readonly 'region.label': "LoopX Goal status";
    readonly 'goal.label': "Goal {goalId}";
    readonly 'status.active': "Active";
    readonly 'status.running': "Running";
    readonly 'status.paused': "Paused";
    readonly 'action.start': "Start";
    readonly 'action.pause': "Pause";
    readonly 'action.refresh': "Refresh";
    readonly 'action.refreshing': "Refreshing";
    readonly 'progress.label': "Agent-lane todos: {processed} of {total} processed";
    readonly 'progress.empty': "No agent-lane todos";
    readonly 'error.session_unavailable': "The session is unavailable. Refresh to retry.";
    readonly 'error.cli_unavailable': "LoopX is unavailable. Refresh to retry.";
    readonly 'error.binding_read_failed': "The LoopX binding could not be read. Refresh to retry.";
    readonly 'error.activation_read_failed': "Goal status could not be read. Refresh to retry.";
    readonly 'error.todo_read_failed': "Todo progress could not be read. Refresh to retry.";
    readonly 'error.protocol_mismatch': "LoopX returned an unsupported status. Refresh to retry.";
    readonly 'error.transport_error': "LoopX is temporarily unreachable. Refresh to retry.";
    readonly 'error.protocol_error': "LoopX returned an unsupported response. Refresh to retry.";
    readonly 'error.binding_mismatch': "The LoopX binding changed. Refresh before trying again.";
    readonly 'error.binding_validation_failed': "The LoopX binding could not be verified. Refresh before trying again.";
    readonly 'error.not_actionable': "That action is no longer available. Refresh to continue.";
    readonly 'error.action_in_flight': "Another LoopX action is in progress. Refresh to check its result.";
    readonly 'error.operation_result_unknown': "The action result is uncertain. Refresh before trying again.";
    readonly 'error.driver_sync_failed': "LoopX changed, but the session did not sync. Refresh to check.";
    readonly 'error.post_read_failed': "LoopX changed, but the latest status is unavailable. Refresh to check.";
};
export type GoalBarLocaleKey = keyof typeof en;
export declare const GOALBAR_LOCALES: Readonly<{
    en: {
        readonly 'region.label': "LoopX Goal status";
        readonly 'goal.label': "Goal {goalId}";
        readonly 'status.active': "Active";
        readonly 'status.running': "Running";
        readonly 'status.paused': "Paused";
        readonly 'action.start': "Start";
        readonly 'action.pause': "Pause";
        readonly 'action.refresh': "Refresh";
        readonly 'action.refreshing': "Refreshing";
        readonly 'progress.label': "Agent-lane todos: {processed} of {total} processed";
        readonly 'progress.empty': "No agent-lane todos";
        readonly 'error.session_unavailable': "The session is unavailable. Refresh to retry.";
        readonly 'error.cli_unavailable': "LoopX is unavailable. Refresh to retry.";
        readonly 'error.binding_read_failed': "The LoopX binding could not be read. Refresh to retry.";
        readonly 'error.activation_read_failed': "Goal status could not be read. Refresh to retry.";
        readonly 'error.todo_read_failed': "Todo progress could not be read. Refresh to retry.";
        readonly 'error.protocol_mismatch': "LoopX returned an unsupported status. Refresh to retry.";
        readonly 'error.transport_error': "LoopX is temporarily unreachable. Refresh to retry.";
        readonly 'error.protocol_error': "LoopX returned an unsupported response. Refresh to retry.";
        readonly 'error.binding_mismatch': "The LoopX binding changed. Refresh before trying again.";
        readonly 'error.binding_validation_failed': "The LoopX binding could not be verified. Refresh before trying again.";
        readonly 'error.not_actionable': "That action is no longer available. Refresh to continue.";
        readonly 'error.action_in_flight': "Another LoopX action is in progress. Refresh to check its result.";
        readonly 'error.operation_result_unknown': "The action result is uncertain. Refresh before trying again.";
        readonly 'error.driver_sync_failed': "LoopX changed, but the session did not sync. Refresh to check.";
        readonly 'error.post_read_failed': "LoopX changed, but the latest status is unavailable. Refresh to check.";
    };
    zh: Record<"region.label" | "goal.label" | "status.active" | "status.running" | "status.paused" | "action.start" | "action.pause" | "action.refresh" | "action.refreshing" | "progress.label" | "progress.empty" | "error.session_unavailable" | "error.cli_unavailable" | "error.binding_read_failed" | "error.activation_read_failed" | "error.todo_read_failed" | "error.protocol_mismatch" | "error.transport_error" | "error.protocol_error" | "error.binding_mismatch" | "error.binding_validation_failed" | "error.not_actionable" | "error.action_in_flight" | "error.operation_result_unknown" | "error.driver_sync_failed" | "error.post_read_failed", string>;
}>;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'loopx.goalbar': GoalBarLocaleKey;
    }
}
export type GoalBarTranslate = Translate<GoalBarLocaleKey>;
export declare function goalBarErrorKey(code: GoalBarUiErrorCode): GoalBarLocaleKey;
export {};
