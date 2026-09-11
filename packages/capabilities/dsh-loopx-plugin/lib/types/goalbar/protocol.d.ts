export declare const GOALBAR_REQUEST_VERSION: "loopx_goalbar_request_v2";
export declare const GOALBAR_RESPONSE_VERSION: "loopx_goalbar_response_v2";
export declare const GOALBAR_ENDPOINTS: Readonly<{
    readonly read: "goalbar/read";
    readonly watch: "goalbar/watch";
    readonly start: "goalbar/start";
    readonly pause: "goalbar/pause";
}>;
export declare const GOALBAR_READ_FAULT_CODES: readonly ["session_unavailable", "cli_unavailable", "binding_read_failed", "activation_read_failed", "todo_read_failed", "protocol_mismatch"];
export declare const GOALBAR_ACTION_REJECTION_CODES: readonly ["binding_mismatch", "binding_validation_failed", "not_actionable", "action_in_flight"];
export declare const GOALBAR_CLIENT_FAULT_CODES: readonly ["transport_error", "protocol_error"];
export type GoalBarOpV1 = keyof typeof GOALBAR_ENDPOINTS;
export type GoalBarEndpointV1 = (typeof GOALBAR_ENDPOINTS)[GoalBarOpV1];
export type GoalBarReadFaultCode = (typeof GOALBAR_READ_FAULT_CODES)[number];
export type GoalBarActionRejectionCode = (typeof GOALBAR_ACTION_REJECTION_CODES)[number];
export type GoalBarClientFaultCode = (typeof GOALBAR_CLIENT_FAULT_CODES)[number];
export type GoalBarActivationV1 = 'active' | 'stopped';
export type GoalBarAgentStatusV1 = 'idle' | 'running';
export interface GoalBarProgressV1 {
    readonly processed: number;
    readonly remaining: number;
    readonly total: number;
}
export interface GoalBarSnapshotV1 {
    readonly sessionId: string;
    readonly goalId: string;
    readonly loopxAgentId: string;
    readonly goalActivation: GoalBarActivationV1;
    readonly agentStatus: GoalBarAgentStatusV1;
    readonly progress: GoalBarProgressV1;
}
export interface GoalBarExpectedBindingV1 {
    readonly goalId: string;
    readonly loopxAgentId: string;
}
export type GoalBarRequestV1 = {
    readonly v: typeof GOALBAR_REQUEST_VERSION;
    readonly op: 'read';
    readonly sessionId: string;
} | {
    readonly v: typeof GOALBAR_REQUEST_VERSION;
    readonly op: 'watch';
    readonly sessionId: string;
    readonly afterSessionEventSeq: number | null;
    readonly sourceRevision: string;
    readonly expected: GoalBarExpectedBindingV1 | null;
    readonly agentStatus: GoalBarAgentStatusV1 | null;
} | {
    readonly v: typeof GOALBAR_REQUEST_VERSION;
    readonly op: 'start';
    readonly sessionId: string;
    readonly expected: GoalBarExpectedBindingV1;
} | {
    readonly v: typeof GOALBAR_REQUEST_VERSION;
    readonly op: 'pause';
    readonly sessionId: string;
    readonly expected: GoalBarExpectedBindingV1;
};
export type GoalBarReadResultV1 = {
    readonly kind: 'hidden';
    readonly reason: 'binding_missing' | 'binding_ambiguous';
    readonly baseSessionEventSeq: number | null;
    readonly sourceRevision: string;
} | {
    readonly kind: 'present';
    readonly snapshot: GoalBarSnapshotV1;
    readonly baseSessionEventSeq: number | null;
    readonly sourceRevision: string;
} | {
    readonly kind: 'fault';
    readonly code: GoalBarReadFaultCode;
    readonly baseSessionEventSeq: number | null;
    readonly sourceRevision: string;
};
export type GoalBarWatchResultV1 = {
    readonly kind: 'source_changed';
    readonly sessionEventSeq: number | null;
} | {
    readonly kind: 'runtime_changed';
    readonly sessionEventSeq: number | null;
    readonly agentStatus: GoalBarAgentStatusV1;
} | {
    readonly kind: 'timeout';
    readonly sessionEventSeq: number | null;
} | {
    readonly kind: 'fault';
    readonly code: 'session_unavailable';
};
export type GoalBarActionResultV1 = {
    readonly kind: 'succeeded';
    readonly snapshot: GoalBarSnapshotV1;
    readonly baseSessionEventSeq: number | null;
    readonly sourceRevision: string;
} | {
    readonly kind: 'rejected';
    readonly code: GoalBarActionRejectionCode;
} | {
    readonly kind: 'unknown';
    readonly code: 'operation_result_unknown';
} | {
    readonly kind: 'applied_with_warning';
    readonly code: 'driver_sync_failed';
    readonly snapshot: GoalBarSnapshotV1;
    readonly baseSessionEventSeq: number | null;
    readonly sourceRevision: string;
} | {
    readonly kind: 'applied_with_warning';
    readonly code: 'post_read_failed';
};
export type GoalBarResponseV1 = {
    readonly v: typeof GOALBAR_RESPONSE_VERSION;
    readonly op: 'read';
    readonly sessionId: string;
    readonly result: GoalBarReadResultV1;
} | {
    readonly v: typeof GOALBAR_RESPONSE_VERSION;
    readonly op: 'watch';
    readonly sessionId: string;
    readonly result: GoalBarWatchResultV1;
} | {
    readonly v: typeof GOALBAR_RESPONSE_VERSION;
    readonly op: 'start';
    readonly sessionId: string;
    readonly result: GoalBarActionResultV1;
} | {
    readonly v: typeof GOALBAR_RESPONSE_VERSION;
    readonly op: 'pause';
    readonly sessionId: string;
    readonly result: GoalBarActionResultV1;
};
export type GoalBarResponseFor<T extends GoalBarRequestV1> = T extends {
    readonly op: 'read';
} ? Extract<GoalBarResponseV1, {
    readonly op: 'read';
}> : T extends {
    readonly op: 'watch';
} ? Extract<GoalBarResponseV1, {
    readonly op: 'watch';
}> : T extends {
    readonly op: infer TOp extends 'start' | 'pause';
} ? Extract<GoalBarResponseV1, {
    readonly op: TOp;
}> : never;
export declare function isGoalBarSourceRevision(value: unknown): value is string;
export declare function isGoalBarSessionId(value: unknown): value is string;
export declare function isGoalBarGoalId(value: unknown): value is string;
export declare function isGoalBarAgentId(value: unknown): value is string;
export declare function endpointForGoalBarOp(op: GoalBarOpV1): GoalBarEndpointV1;
export declare function decodeGoalBarRequestV1(endpoint: string, value: unknown): GoalBarRequestV1 | undefined;
export declare function decodeGoalBarSnapshotV1(value: unknown, expected?: {
    readonly sessionId?: string | undefined;
    readonly binding?: GoalBarExpectedBindingV1 | undefined;
}): GoalBarSnapshotV1 | undefined;
export declare function decodeGoalBarResponseV1<T extends GoalBarRequestV1>(request: T, value: unknown): GoalBarResponseFor<T> | undefined;
