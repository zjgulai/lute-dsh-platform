import { c as LoopXCliError, d as runJsonCommand, f as runJsonMutationCommand, l as resolveLoopXCommand, s as resolvePluginLoopXCommand, u as runFile } from "./managed-runtime-YLwD9k45.js";
import { a as goalBarCoordinator, o as latestSessionEventSeq, t as LoopXContinuationDriver } from "./driver-9L2bPvkK.js";
import { LoopXInitError, initializeLoopX } from "./init-command.js";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
//#region build-temp/host/goalbar/protocol.js
const GOALBAR_REQUEST_VERSION = "loopx_goalbar_request_v2";
const GOALBAR_RESPONSE_VERSION = "loopx_goalbar_response_v2";
const GOALBAR_ENDPOINTS = Object.freeze({
	read: "goalbar/read",
	watch: "goalbar/watch",
	start: "goalbar/start",
	pause: "goalbar/pause"
});
Object.freeze([
	"session_unavailable",
	"cli_unavailable",
	"binding_read_failed",
	"activation_read_failed",
	"todo_read_failed",
	"protocol_mismatch"
]);
Object.freeze([
	"binding_mismatch",
	"binding_validation_failed",
	"not_actionable",
	"action_in_flight"
]);
Object.freeze(["transport_error", "protocol_error"]);
const LOOPX_AGENT_ID_PATTERN = /^[a-z][a-z0-9_.:@-]{0,79}$/u;
const GOAL_ID_MAX_LENGTH = 512;
function record$2(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function exactRecord$1(value, expectedKeys) {
	const candidate = record$2(value);
	if (candidate === void 0) return void 0;
	const keys = Reflect.ownKeys(candidate);
	if (keys.some((key) => typeof key !== "string") || keys.length !== expectedKeys.length) return;
	const allowed = new Set(expectedKeys);
	return keys.every((key) => typeof key === "string" && allowed.has(key)) ? candidate : void 0;
}
function isOneOf(value, choices) {
	return typeof value === "string" && choices.includes(value);
}
function isSequence(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isCursor(value) {
	return value === null || isSequence(value);
}
const SOURCE_REVISION_PATTERN = /^sha256:[0-9a-f]{64}$/u;
function isGoalBarSourceRevision(value) {
	return typeof value === "string" && SOURCE_REVISION_PATTERN.test(value);
}
function isGoalBarSessionId(value) {
	return typeof value === "string" && value.length > 0 && [...value].length <= 128 && value.trim() === value && !/[\s\u0000-\u001f/\\'"]/u.test(value);
}
function isGoalBarGoalId(value) {
	return typeof value === "string" && value.length > 0 && [...value].length <= GOAL_ID_MAX_LENGTH && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}
function isGoalBarRevisionGoalId(value) {
	return isGoalBarGoalId(value) && value !== "." && value !== ".." && !value.includes("/") && !value.includes("\\");
}
function isGoalBarAgentId(value) {
	return typeof value === "string" && LOOPX_AGENT_ID_PATTERN.test(value);
}
function decodeGoalBarRequestV1(endpoint, value) {
	const op = Object.entries(GOALBAR_ENDPOINTS).find(([, candidate]) => candidate === endpoint)?.[0];
	if (op === void 0) return void 0;
	if (op === "read") {
		const input = exactRecord$1(value, [
			"v",
			"op",
			"sessionId"
		]);
		return input?.v === "loopx_goalbar_request_v2" && input.op === op && isGoalBarSessionId(input.sessionId) ? {
			v: GOALBAR_REQUEST_VERSION,
			op,
			sessionId: input.sessionId
		} : void 0;
	}
	if (op === "watch") {
		const input = exactRecord$1(value, [
			"v",
			"op",
			"sessionId",
			"afterSessionEventSeq",
			"sourceRevision",
			"expected",
			"agentStatus"
		]);
		const expected = input?.expected === null ? null : exactRecord$1(input?.expected, ["goalId", "loopxAgentId"]);
		return input?.v === "loopx_goalbar_request_v2" && input.op === op && isGoalBarSessionId(input.sessionId) && isCursor(input.afterSessionEventSeq) && isGoalBarSourceRevision(input.sourceRevision) && (expected === null || isGoalBarRevisionGoalId(expected?.goalId) && isGoalBarAgentId(expected.loopxAgentId)) && (input.agentStatus === null || isOneOf(input.agentStatus, ["idle", "running"])) ? {
			v: GOALBAR_REQUEST_VERSION,
			op,
			sessionId: input.sessionId,
			afterSessionEventSeq: input.afterSessionEventSeq,
			sourceRevision: input.sourceRevision,
			expected: expected === null ? null : {
				goalId: expected.goalId,
				loopxAgentId: expected.loopxAgentId
			},
			agentStatus: input.agentStatus
		} : void 0;
	}
	const input = exactRecord$1(value, [
		"v",
		"op",
		"sessionId",
		"expected"
	]);
	const expected = exactRecord$1(input?.expected, ["goalId", "loopxAgentId"]);
	return input?.v === "loopx_goalbar_request_v2" && input.op === op && isGoalBarSessionId(input.sessionId) && isGoalBarGoalId(expected?.goalId) && isGoalBarAgentId(expected.loopxAgentId) ? {
		v: GOALBAR_REQUEST_VERSION,
		op,
		sessionId: input.sessionId,
		expected: {
			goalId: expected.goalId,
			loopxAgentId: expected.loopxAgentId
		}
	} : void 0;
}
//#endregion
//#region build-temp/host/goalbar/read-model.js
const GOALBAR_HOST_SURFACE = "deepseek-harness-native";
const GOALBAR_PROJECT_REGISTRY = ".loopx/registry.json";
const GOALBAR_ACTIVE_STATE_ROOT = ".codex/goals";
const GOALBAR_ACTIVE_STATE_FILE = "ACTIVE_GOAL_STATE.md";
const SOURCE_REVISION_FAILURE = `sha256:${createHash("sha256").update("loopx-goalbar-source-revision-unavailable-v1").digest("hex")}`;
const BINDING_SCHEMA = "loopx_thread_agent_binding_resolution_v0";
const ACTIVATION_TRANSITION_SCHEMA$1 = "loopx_goal_activation_transition_v1";
const ACTIVATION_READBACK_SCHEMA$1 = "loopx_goal_activation_readback_v1";
const TODO_PROJECTION_SCHEMA = "agent_lane_todo_list_projection_v0";
const TODO_PROJECTION_VIEW = "explicit_limit_cold_path";
const READ_ATTEMPTS = 3;
var GoalBarSourceRevisionError = class extends Error {};
function unavailableGoalBarSourceRevision() {
	return SOURCE_REVISION_FAILURE;
}
function frame(hash, label, value) {
	const labelBytes = Buffer.from(label, "utf8");
	const lengths = Buffer.allocUnsafe(8);
	lengths.writeUInt32BE(labelBytes.length, 0);
	lengths.writeUInt32BE(value.length, 4);
	hash.update(lengths);
	hash.update(labelBytes);
	hash.update(value);
}
function isContained(root, candidate) {
	const pathFromRoot = relative(root, candidate);
	return pathFromRoot === "" || !pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot);
}
function validatedSourcePaths(options) {
	if (!isAbsolute(options.cwd) || resolve(options.cwd) !== options.cwd) throw new GoalBarSourceRevisionError("project cwd must be absolute and normalized");
	const paths = [resolve(options.cwd, GOALBAR_PROJECT_REGISTRY)];
	if (options.goalId !== void 0) {
		if (!isGoalBarGoalId(options.goalId) || options.goalId === "." || options.goalId === ".." || options.goalId.includes("/") || options.goalId.includes("\\")) throw new GoalBarSourceRevisionError("goal id is not a safe path segment");
		paths.push(resolve(options.cwd, GOALBAR_ACTIVE_STATE_ROOT, options.goalId, GOALBAR_ACTIVE_STATE_FILE));
	}
	if (options.goalId === void 0 !== (options.loopxAgentId === void 0) || options.loopxAgentId !== void 0 && !isGoalBarAgentId(options.loopxAgentId)) throw new GoalBarSourceRevisionError("source revision requires an exact binding pair");
	if (paths.some((candidate) => !isContained(options.cwd, candidate))) throw new GoalBarSourceRevisionError("source path escaped project cwd");
	return paths;
}
async function readRevisionSource(cwd, path) {
	try {
		const resolved = await realpath(path);
		if (!isContained(await realpath(cwd), resolved)) throw new GoalBarSourceRevisionError("source resolved outside project cwd");
		return {
			exists: true,
			content: await readFile(resolved)
		};
	} catch (error) {
		if (error?.code === "ENOENT") return {
			exists: false,
			content: Buffer.alloc(0)
		};
		throw error instanceof GoalBarSourceRevisionError ? error : new GoalBarSourceRevisionError("authoritative source read failed");
	}
}
/** Hash only the fixed authoritative paths; contents and local paths never cross the wire. */
async function computeGoalBarSourceRevision(options) {
	const paths = validatedSourcePaths(options);
	const hash = createHash("sha256");
	frame(hash, "contract", Buffer.from("loopx-goalbar-source-revision-v1"));
	if (options.goalId !== void 0 && options.loopxAgentId !== void 0) {
		frame(hash, "binding.goal-id", Buffer.from(options.goalId, "utf8"));
		frame(hash, "binding.agent-id", Buffer.from(options.loopxAgentId, "utf8"));
	}
	for (let index = 0; index < paths.length; index += 1) {
		const source = await readRevisionSource(options.cwd, paths[index]);
		frame(hash, index === 0 ? "registry.exists" : "active-state.exists", Buffer.from(source.exists ? "1" : "0"));
		frame(hash, index === 0 ? "registry.content" : "active-state.content", source.content);
	}
	return `sha256:${hash.digest("hex")}`;
}
/**
* Observe the same authoritative bytes before and after their CLI-derived read.
* A concurrent equal-size write or atomic replacement retries the whole model.
*/
async function readStableGoalBarModel(options, revisionReader = computeGoalBarSourceRevision) {
	let lastRevision = await revisionReader({ cwd: options.cwd });
	for (let attempt = 0; attempt < READ_ATTEMPTS; attempt += 1) {
		const registryBefore = attempt === 0 ? lastRevision : await revisionReader({ cwd: options.cwd });
		const binding = await readGoalBarBinding(options, options.sessionId);
		const registryAfter = await revisionReader({ cwd: options.cwd });
		lastRevision = registryAfter;
		if (registryBefore !== registryAfter) continue;
		if (binding.kind === "fault") return {
			model: binding,
			sourceRevision: registryAfter
		};
		if (binding.kind === "missing") return {
			model: {
				kind: "hidden",
				reason: "binding_missing"
			},
			sourceRevision: registryAfter
		};
		if (binding.kind === "ambiguous") return {
			model: {
				kind: "hidden",
				reason: "binding_ambiguous",
				uniquePairCount: binding.uniquePairCount
			},
			sourceRevision: registryAfter
		};
		if (binding.kind === "unavailable") return {
			model: {
				kind: "fault",
				code: "binding_read_failed"
			},
			sourceRevision: registryAfter
		};
		const exact = {
			goalId: binding.goalId,
			loopxAgentId: binding.loopxAgentId
		};
		const sourceBefore = await revisionReader({
			cwd: options.cwd,
			...exact
		});
		const registryGuard = await revisionReader({ cwd: options.cwd });
		if (registryGuard !== registryAfter) {
			lastRevision = registryGuard;
			continue;
		}
		const [activation, progress] = await Promise.all([readGoalBarActivation(options, binding.goalId), readGoalBarProgress(options, binding.goalId, binding.loopxAgentId)]);
		const sourceAfter = await revisionReader({
			cwd: options.cwd,
			...exact
		});
		lastRevision = sourceAfter;
		if (sourceBefore !== sourceAfter) continue;
		const fault = preferredReadFault(activation, progress);
		if (fault !== void 0) return {
			model: {
				...fault,
				binding
			},
			sourceRevision: sourceAfter
		};
		if (activation.kind !== "value" || progress.kind !== "value") return {
			model: {
				kind: "fault",
				code: "protocol_mismatch",
				binding
			},
			sourceRevision: sourceAfter
		};
		return {
			model: {
				kind: "present",
				snapshot: {
					sessionId: options.sessionId,
					...exact,
					goalActivation: activation.goalActivation,
					agentStatus: options.agentStatus,
					progress: progress.progress
				}
			},
			sourceRevision: sourceAfter
		};
	}
	return {
		model: {
			kind: "fault",
			code: "binding_read_failed"
		},
		sourceRevision: lastRevision
	};
}
function record$1(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function safeCount(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function parseBindingPairs(value) {
	if (!Array.isArray(value)) return void 0;
	const pairs = /* @__PURE__ */ new Map();
	for (const item of value) {
		const candidate = record$1(item);
		if (!isGoalBarGoalId(candidate?.goal_id) || !isGoalBarAgentId(candidate.agent_id)) return void 0;
		const pair = {
			goalId: candidate.goal_id,
			loopxAgentId: candidate.agent_id
		};
		pairs.set(`${pair.goalId}\u0000${pair.loopxAgentId}`, pair);
	}
	return [...pairs.values()];
}
/**
* Validate the authoritative resolver relation while retaining process status.
* Duplicate records for one exact pair are collapsed before the 0/1/>1 test.
*/
function decodeThreadAgentBindingResolutionV0(value, expectedSessionId, exitCode) {
	const input = record$1(value);
	const pairs = parseBindingPairs(input?.matches);
	if (!isGoalBarSessionId(expectedSessionId) || !safeCount(exitCode) || input?.schema_version !== BINDING_SCHEMA || pairs === void 0) return void 0;
	if (input.status === "missing") return exitCode === 0 && input.ok === true && input.host_surface === "deepseek-harness-native" && input.thread_id === expectedSessionId && input.goal_id === null && input.agent_id === null && pairs.length === 0 ? { kind: "missing" } : void 0;
	if (input.status === "bound") {
		const pair = pairs.length === 1 ? pairs[0] : void 0;
		return exitCode === 0 && input.ok === true && input.host_surface === "deepseek-harness-native" && input.thread_id === expectedSessionId && pair !== void 0 && input.goal_id === pair.goalId && input.agent_id === pair.loopxAgentId ? {
			kind: "bound",
			goalId: pair.goalId,
			loopxAgentId: pair.loopxAgentId
		} : void 0;
	}
	if (input.status === "ambiguous") return exitCode !== 0 && input.ok === false && input.host_surface === "deepseek-harness-native" && input.thread_id === expectedSessionId && input.goal_id === null && input.agent_id === null && input.error_kind === "thread_agent_binding_ambiguous" && pairs.length > 1 ? {
		kind: "ambiguous",
		uniquePairCount: pairs.length
	} : void 0;
	if (input.status === "unavailable") {
		const errorKind = input.error_kind;
		const exactEcho = errorKind === "thread_agent_binding_resolution_failed" && input.host_surface === "deepseek-harness-native" && input.thread_id === expectedSessionId;
		const redactedInvalidRequest = errorKind === "thread_agent_binding_invalid_request" && input.host_surface === null && input.thread_id === null;
		return exitCode !== 0 && input.ok === false && input.goal_id === null && input.agent_id === null && pairs.length === 0 && (exactEcho || redactedInvalidRequest) ? { kind: "unavailable" } : void 0;
	}
}
function decodeGoalActivationPreviewV1(value, expectedGoalId, exitCode) {
	const input = record$1(value);
	const readback = record$1(input?.readback);
	if (!isGoalBarGoalId(expectedGoalId) || exitCode !== 0 || input?.schema_version !== ACTIVATION_TRANSITION_SCHEMA$1 || input.goal_id !== expectedGoalId || input.ok !== true || input.dry_run !== true || input.execute !== false || input.written !== false || input.partial_write !== false || input.after_state !== "stopped" || readback?.schema_version !== ACTIVATION_READBACK_SCHEMA$1) return void 0;
	if (input.before_state === "active") return input.changed === true && readback.status === "not_executed" && readback.verified === false ? "active" : void 0;
	if (input.before_state === "stopped") return input.changed === false && readback.status === "not_required" && readback.verified === true ? "stopped" : void 0;
}
function decodeAgentLaneTodoProgressV0(value, expectedGoalId, expectedAgentId, exitCode) {
	const input = record$1(value);
	const projection = record$1(input?.todo_list_projection);
	const agentTodos = record$1(input?.agent_todos);
	const items = agentTodos?.items;
	const returnedItems = input?.todos;
	const processed = agentTodos?.done_count;
	const remaining = agentTodos?.open_count;
	const total = agentTodos?.total_count;
	const returnedCount = input?.returned_todo_count;
	if (!isGoalBarGoalId(expectedGoalId) || !isGoalBarAgentId(expectedAgentId) || exitCode !== 0 || input?.ok !== true || input.read_only !== true || input.command !== "list" || input.goal_id !== expectedGoalId || input.agent_id_filter !== expectedAgentId || input.role !== "agent" || input.explicit_limit !== 1 || projection?.schema_version !== TODO_PROJECTION_SCHEMA || projection.view !== TODO_PROJECTION_VIEW || projection.item_limit_per_role !== 1 || projection.counts_cover_full_match !== true || !safeCount(processed) || !safeCount(remaining) || !safeCount(total) || !Number.isSafeInteger(processed + remaining) || processed + remaining !== total || !safeCount(input.todo_count) || !safeCount(returnedCount) || !safeCount(projection.matched_todo_count) || !safeCount(projection.returned_todo_count) || total !== projection.matched_todo_count || input.todo_count !== returnedCount || returnedCount !== projection.returned_todo_count || !Array.isArray(items) || !Array.isArray(returnedItems) || items.length !== returnedCount || returnedItems.length !== returnedCount || returnedCount > 1) return void 0;
	return {
		processed,
		remaining,
		total
	};
}
async function executeJsonRead(options, args) {
	const runner = options.runner ?? runFile;
	let exitCode;
	const recordingRunner = async (file, fileArgs, runOptions) => {
		const result = await runner(file, fileArgs, runOptions);
		exitCode = result.exitCode;
		return result;
	};
	const payload = await runJsonCommand(options.command, args, {
		runner: recordingRunner,
		cwd: options.cwd,
		env: options.env,
		signal: options.signal,
		attempts: READ_ATTEMPTS,
		retryDelaysMs: options.retryDelaysMs
	});
	if (exitCode === void 0) throw new LoopXCliError("transport", "LoopX command result was unavailable", true);
	return {
		exitCode,
		payload
	};
}
function fixedFault(error, stageCode) {
	return {
		kind: "fault",
		code: error instanceof LoopXCliError && error.kind === "missing" ? "cli_unavailable" : stageCode
	};
}
async function readGoalBarBinding(options, sessionId) {
	if (!isGoalBarSessionId(sessionId)) return {
		kind: "fault",
		code: "protocol_mismatch"
	};
	try {
		const result = await executeJsonRead(options, [
			"--registry",
			GOALBAR_PROJECT_REGISTRY,
			"--format",
			"json",
			"resolve-agent-thread",
			"--host-surface",
			GOALBAR_HOST_SURFACE,
			"--thread-id",
			sessionId
		]);
		const decoded = decodeThreadAgentBindingResolutionV0(result.payload, sessionId, result.exitCode);
		return decoded === void 0 || decoded.kind === "unavailable" ? {
			kind: "fault",
			code: "binding_read_failed"
		} : decoded;
	} catch (error) {
		return fixedFault(error, "binding_read_failed");
	}
}
async function readGoalBarActivation(options, goalId) {
	if (!isGoalBarGoalId(goalId)) return {
		kind: "fault",
		code: "protocol_mismatch"
	};
	try {
		const result = await executeJsonRead(options, [
			"--registry",
			GOALBAR_PROJECT_REGISTRY,
			"--format",
			"json",
			"goal-lifecycle",
			"--goal-id",
			goalId,
			"--operation",
			"stop"
		]);
		const goalActivation = decodeGoalActivationPreviewV1(result.payload, goalId, result.exitCode);
		return goalActivation === void 0 ? {
			kind: "fault",
			code: "activation_read_failed"
		} : {
			kind: "value",
			goalActivation
		};
	} catch (error) {
		return fixedFault(error, "activation_read_failed");
	}
}
async function readGoalBarProgress(options, goalId, loopxAgentId) {
	if (!isGoalBarGoalId(goalId) || !isGoalBarAgentId(loopxAgentId)) return {
		kind: "fault",
		code: "protocol_mismatch"
	};
	try {
		const result = await executeJsonRead(options, [
			"--registry",
			GOALBAR_PROJECT_REGISTRY,
			"--format",
			"json",
			"todo",
			"list",
			"--goal-id",
			goalId,
			"--role",
			"agent",
			"--agent-id",
			loopxAgentId,
			"--limit",
			"1"
		]);
		const progress = decodeAgentLaneTodoProgressV0(result.payload, goalId, loopxAgentId, result.exitCode);
		return progress === void 0 ? {
			kind: "fault",
			code: "todo_read_failed"
		} : {
			kind: "value",
			progress
		};
	} catch (error) {
		return fixedFault(error, "todo_read_failed");
	}
}
function preferredReadFault(activation, progress) {
	const faults = [activation, progress].filter((result) => result.kind === "fault");
	if (faults.length === 0) return void 0;
	return faults.find((fault) => fault.code === "cli_unavailable") ?? faults.find((fault) => fault.code === "protocol_mismatch") ?? faults[0];
}
//#endregion
//#region build-temp/host/goalbar/service.js
const ACTIVATION_TRANSITION_SCHEMA = "loopx_goal_activation_transition_v1";
const ACTIVATION_READBACK_SCHEMA = "loopx_goal_activation_readback_v1";
const AMBIGUOUS_LOG_CODE = "dsh_loopx_goalbar_binding_ambiguous";
const DEFAULT_WATCH_TIMEOUT_MS = 25e3;
const MAX_WATCH_TIMEOUT_MS = 3e4;
const DEFAULT_ACTION_TIMEOUT_MS = 2e4;
const MAX_ACTION_TIMEOUT_MS = 6e4;
const DEFAULT_ACTION_MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_ACTION_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
function deferred() {
	let settled = false;
	let settle;
	return {
		promise: new Promise((resolve) => {
			settle = resolve;
		}),
		resolve() {
			if (settled) return;
			settled = true;
			settle();
		}
	};
}
function boundedInteger(value, fallback, maximum) {
	return Number.isSafeInteger(value) && (value ?? -1) >= 0 ? Math.min(value, maximum) : fallback;
}
function record(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function exactRecord(value, keys) {
	const input = record(value);
	if (input === void 0) return void 0;
	const actual = Reflect.ownKeys(input);
	const allowed = new Set(keys);
	return actual.length === keys.length && actual.every((key) => typeof key === "string" && allowed.has(key)) ? input : void 0;
}
/** Strict verified relation for the existing lifecycle execution V1 receipt. */
function decodeGoalBarLifecycleExecutionV1(value, goalId, targetState) {
	const input = record(value);
	const readback = exactRecord(input?.readback, [
		"schema_version",
		"status",
		"verified",
		"goal_id",
		"expected_state",
		"source_state",
		"target_state"
	]);
	return input?.schema_version === ACTIVATION_TRANSITION_SCHEMA && input.goal_id === goalId && (input.before_state === "active" || input.before_state === "stopped") && input.after_state === targetState && input.ok === true && input.dry_run === false && input.execute === true && typeof input.changed === "boolean" && typeof input.written === "boolean" && input.partial_write === false && readback?.schema_version === ACTIVATION_READBACK_SCHEMA && readback.status === "verified" && readback.verified === true && readback.goal_id === goalId && readback.expected_state === targetState && readback.source_state === targetState && readback.target_state === targetState;
}
function fixedGoalBarFailureResponseV1(request) {
	if (request.op === "read") return {
		v: GOALBAR_RESPONSE_VERSION,
		op: "read",
		sessionId: request.sessionId,
		result: {
			kind: "fault",
			code: "protocol_mismatch",
			baseSessionEventSeq: null,
			sourceRevision: unavailableGoalBarSourceRevision()
		}
	};
	if (request.op === "watch") return {
		v: GOALBAR_RESPONSE_VERSION,
		op: "watch",
		sessionId: request.sessionId,
		result: {
			kind: "fault",
			code: "session_unavailable"
		}
	};
	return {
		v: GOALBAR_RESPONSE_VERSION,
		op: request.op,
		sessionId: request.sessionId,
		result: {
			kind: "unknown",
			code: "operation_result_unknown"
		}
	};
}
var GoalBarService = class {
	getAgent;
	coordinator;
	watchService;
	runner;
	env;
	retryDelaysMs;
	commandResolver;
	watchTimeoutMs;
	actionTimeoutMs;
	actionMaxOutputBytes;
	warn;
	disposal = new AbortController();
	activeAction;
	disposed = false;
	constructor(options) {
		this.getAgent = options.getAgent;
		this.coordinator = options.coordinator;
		this.watchService = options.coordinator.openWatchService();
		this.runner = options.runner;
		this.env = options.env;
		this.retryDelaysMs = options.retryDelaysMs;
		this.watchTimeoutMs = boundedInteger(options.watchTimeoutMs, DEFAULT_WATCH_TIMEOUT_MS, MAX_WATCH_TIMEOUT_MS);
		this.actionTimeoutMs = boundedInteger(options.actionTimeoutMs, DEFAULT_ACTION_TIMEOUT_MS, MAX_ACTION_TIMEOUT_MS);
		this.actionMaxOutputBytes = boundedInteger(options.actionMaxOutputBytes, DEFAULT_ACTION_MAX_OUTPUT_BYTES, MAX_ACTION_MAX_OUTPUT_BYTES);
		this.warn = options.warn ?? (() => {});
		this.commandResolver = options.resolveCommand ?? (options.command === void 0 ? (signal) => resolveLoopXCommand({
			runner: this.runner,
			signal,
			env: this.env
		}) : async () => options.command);
	}
	async handle(request, signal) {
		try {
			if (request.op === "read") return await this.readResponse(request, signal);
			if (request.op === "watch") return await this.watchResponse(request, signal);
			return await this.actionResponse(request, signal);
		} catch {
			return fixedGoalBarFailureResponseV1(request);
		}
	}
	async dispose() {
		if (!this.disposed) {
			this.disposed = true;
			this.disposal.abort();
			this.watchService.dispose();
		}
		await this.activeAction?.completion;
	}
	capture(sessionId) {
		if (this.disposed) return void 0;
		let agent;
		try {
			agent = this.getAgent(sessionId);
		} catch {
			return;
		}
		if (agent === void 0) return void 0;
		const session = agent.session;
		const cwd = session.header.cwd;
		return String(agent.id) === sessionId && String(session.id) === sessionId && agent.session === session && (agent.status === "idle" || agent.status === "running") && typeof cwd === "string" && cwd.length > 0 ? {
			agent,
			session,
			sessionId,
			cwd
		} : void 0;
	}
	captureIsCurrent(capture) {
		try {
			return this.getAgent(capture.sessionId) === capture.agent && capture.agent.session === capture.session && String(capture.agent.id) === capture.sessionId && String(capture.session.id) === capture.sessionId;
		} catch {
			return false;
		}
	}
	combinedSignal(signal) {
		return AbortSignal.any([signal, this.disposal.signal]);
	}
	logAmbiguity(sessionId, count) {
		const boundedSessionId = [...sessionId].slice(0, 128).join("");
		const boundedCount = Math.min(Math.max(count, 0), 9999);
		try {
			this.warn(`${AMBIGUOUS_LOG_CODE} session_id=${boundedSessionId} count=${boundedCount}`);
		} catch {}
	}
	async waitForAdmittedMutation(signal) {
		const admitted = this.activeAction;
		if (admitted === void 0) return !signal.aborted;
		if (signal.aborted) return false;
		return await new Promise((resolve) => {
			let settled = false;
			const finish = (value) => {
				if (settled) return;
				settled = true;
				signal.removeEventListener("abort", aborted);
				resolve(value);
			};
			const aborted = () => {
				finish(false);
			};
			signal.addEventListener("abort", aborted, { once: true });
			admitted.mutationSettled.then(() => {
				finish(!signal.aborted);
			}, () => {
				finish(false);
			});
		});
	}
	async readResult(sessionId, signal) {
		const capture = this.capture(sessionId);
		if (capture === void 0) return {
			kind: "fault",
			code: "session_unavailable",
			baseSessionEventSeq: null,
			sourceRevision: unavailableGoalBarSourceRevision()
		};
		const baseSessionEventSeq = latestSessionEventSeq(capture.session);
		const operationSignal = this.combinedSignal(signal);
		if (!await this.waitForAdmittedMutation(operationSignal) || !this.captureIsCurrent(capture)) return this.readFault(capture, "session_unavailable", baseSessionEventSeq);
		let command;
		try {
			command = await this.commandResolver(operationSignal);
		} catch (error) {
			const code = error instanceof LoopXCliError && error.kind === "missing" ? "cli_unavailable" : operationSignal.aborted ? "session_unavailable" : "binding_read_failed";
			return this.readFault(capture, code, baseSessionEventSeq);
		}
		if (operationSignal.aborted || !this.captureIsCurrent(capture)) return this.readFault(capture, "session_unavailable", baseSessionEventSeq);
		let stableRead;
		try {
			stableRead = await readStableGoalBarModel({
				command,
				cwd: capture.cwd,
				runner: this.runner,
				signal: operationSignal,
				env: this.env,
				retryDelaysMs: this.retryDelaysMs,
				sessionId: String(capture.agent.id),
				agentStatus: capture.agent.status
			});
		} catch {
			return {
				kind: "fault",
				code: "binding_read_failed",
				baseSessionEventSeq,
				sourceRevision: unavailableGoalBarSourceRevision()
			};
		}
		const { model, sourceRevision } = stableRead;
		if (operationSignal.aborted || !this.captureIsCurrent(capture)) return this.readFault(capture, "session_unavailable", baseSessionEventSeq);
		if (model.kind === "hidden") {
			if (model.reason === "binding_ambiguous") this.logAmbiguity(sessionId, model.uniquePairCount);
			return {
				kind: "hidden",
				reason: model.reason,
				baseSessionEventSeq,
				sourceRevision
			};
		}
		if (model.kind === "fault") return {
			kind: "fault",
			code: model.code,
			baseSessionEventSeq,
			sourceRevision
		};
		return {
			kind: "present",
			baseSessionEventSeq,
			sourceRevision,
			snapshot: {
				...model.snapshot,
				agentStatus: capture.agent.status
			}
		};
	}
	async readFault(capture, code, baseSessionEventSeq) {
		try {
			return {
				kind: "fault",
				code,
				baseSessionEventSeq,
				sourceRevision: await computeGoalBarSourceRevision({ cwd: capture.cwd })
			};
		} catch {
			return {
				kind: "fault",
				code,
				baseSessionEventSeq,
				sourceRevision: unavailableGoalBarSourceRevision()
			};
		}
	}
	async readResponse(request, signal) {
		return {
			v: GOALBAR_RESPONSE_VERSION,
			op: "read",
			sessionId: request.sessionId,
			result: await this.readResult(request.sessionId, signal)
		};
	}
	async watchResponse(request, signal) {
		const capture = this.capture(request.sessionId);
		let result;
		if (capture === void 0) result = {
			kind: "fault",
			code: "session_unavailable"
		};
		else result = await this.waitForWatchChange(capture, request, signal);
		return {
			v: GOALBAR_RESPONSE_VERSION,
			op: "watch",
			sessionId: request.sessionId,
			result
		};
	}
	async waitForWatchChange(capture, request, signal) {
		const operationSignal = this.combinedSignal(signal);
		const deadline = Date.now() + this.watchTimeoutMs;
		let cursor = request.afterSessionEventSeq;
		const upperBound = latestSessionEventSeq(capture.session);
		if (cursor !== null && (upperBound === null || cursor > upperBound)) return {
			kind: "fault",
			code: "session_unavailable"
		};
		while (!operationSignal.aborted && this.captureIsCurrent(capture)) {
			const remaining = Math.max(0, deadline - Date.now());
			const receipt = await this.watchService.waitForSessionChange(capture.session, cursor, {
				signal: operationSignal,
				timeoutMs: remaining,
				observedAgentStatus: request.agentStatus,
				isSessionCurrent: () => this.captureIsCurrent(capture),
				getAgentStatus: () => capture.agent.status
			});
			if (receipt.kind === "runtime_changed" && receipt.sessionId === request.sessionId) {
				try {
					const revision = await computeGoalBarSourceRevision({
						cwd: capture.cwd,
						goalId: request.expected?.goalId,
						loopxAgentId: request.expected?.loopxAgentId
					});
					if (!this.captureIsCurrent(capture)) return {
						kind: "fault",
						code: "session_unavailable"
					};
					if (revision !== request.sourceRevision) return {
						kind: "source_changed",
						sessionEventSeq: latestSessionEventSeq(capture.session) ?? cursor
					};
				} catch {
					return {
						kind: "fault",
						code: "session_unavailable"
					};
				}
				return {
					kind: "runtime_changed",
					sessionEventSeq: latestSessionEventSeq(capture.session) ?? cursor,
					agentStatus: receipt.agentStatus
				};
			}
			if (receipt.kind === "candidate" && receipt.sessionId === request.sessionId) cursor = receipt.sessionEventSeq;
			else if (receipt.kind === "timeout") cursor = receipt.sessionEventSeq;
			else return {
				kind: "fault",
				code: "session_unavailable"
			};
			try {
				const revision = await computeGoalBarSourceRevision({
					cwd: capture.cwd,
					goalId: request.expected?.goalId,
					loopxAgentId: request.expected?.loopxAgentId
				});
				if (!this.captureIsCurrent(capture)) return {
					kind: "fault",
					code: "session_unavailable"
				};
				if (revision !== request.sourceRevision) return {
					kind: "source_changed",
					sessionEventSeq: cursor
				};
			} catch {
				return {
					kind: "fault",
					code: "session_unavailable"
				};
			}
			if (receipt.kind === "timeout" || Date.now() >= deadline) return {
				kind: "timeout",
				sessionEventSeq: cursor
			};
		}
		return {
			kind: "fault",
			code: "session_unavailable"
		};
	}
	actionAdmission() {
		const mutation = deferred();
		const completion = deferred();
		return {
			mutationSettled: mutation.promise,
			completion: completion.promise,
			resolveMutation: () => {
				mutation.resolve();
			},
			resolveCompletion: () => {
				completion.resolve();
			}
		};
	}
	async actionResponse(request, signal) {
		if (this.activeAction !== void 0) return {
			v: GOALBAR_RESPONSE_VERSION,
			op: request.op,
			sessionId: request.sessionId,
			result: {
				kind: "rejected",
				code: "action_in_flight"
			}
		};
		const admission = this.actionAdmission();
		this.activeAction = admission;
		let result;
		try {
			result = await this.executeAction(request, signal, admission);
		} finally {
			admission.resolveMutation();
			if (this.activeAction === admission) this.activeAction = void 0;
			admission.resolveCompletion();
		}
		return {
			v: GOALBAR_RESPONSE_VERSION,
			op: request.op,
			sessionId: request.sessionId,
			result
		};
	}
	async executeAction(request, signal, admission) {
		const capture = this.capture(request.sessionId);
		if (capture === void 0) return {
			kind: "rejected",
			code: "binding_validation_failed"
		};
		const validationSignal = this.combinedSignal(signal);
		let command;
		try {
			command = await this.commandResolver(validationSignal);
		} catch {
			return {
				kind: "rejected",
				code: "binding_validation_failed"
			};
		}
		if (validationSignal.aborted || !this.captureIsCurrent(capture)) return {
			kind: "rejected",
			code: "binding_validation_failed"
		};
		const cliOptions = {
			command,
			cwd: capture.cwd,
			runner: this.runner,
			signal: validationSignal,
			env: this.env,
			retryDelaysMs: this.retryDelaysMs
		};
		const binding = await readGoalBarBinding(cliOptions, String(capture.agent.id));
		if (binding.kind === "ambiguous") this.logAmbiguity(request.sessionId, binding.uniquePairCount);
		if (validationSignal.aborted || !this.captureIsCurrent(capture)) return {
			kind: "rejected",
			code: "binding_validation_failed"
		};
		if (binding.kind !== "bound") return {
			kind: "rejected",
			code: "binding_validation_failed"
		};
		if (binding.goalId !== request.expected.goalId || binding.loopxAgentId !== request.expected.loopxAgentId) return {
			kind: "rejected",
			code: "binding_mismatch"
		};
		const activation = await readGoalBarActivation(cliOptions, binding.goalId);
		if (validationSignal.aborted || !this.captureIsCurrent(capture)) return {
			kind: "rejected",
			code: "binding_validation_failed"
		};
		if (!(activation.kind === "value" && (request.op === "start" ? activation.goalActivation === "stopped" && capture.agent.status === "idle" : activation.goalActivation === "active"))) return {
			kind: "rejected",
			code: "not_actionable"
		};
		if (validationSignal.aborted || !this.captureIsCurrent(capture) || request.op === "start" && capture.agent.status !== "idle") return {
			kind: "rejected",
			code: "binding_validation_failed"
		};
		const targetState = request.op === "start" ? "active" : "stopped";
		const operation = request.op === "start" ? "resume" : "stop";
		let verified = false;
		try {
			await runJsonMutationCommand(command, [
				"--registry",
				GOALBAR_PROJECT_REGISTRY,
				"--format",
				"json",
				"goal-lifecycle",
				"--goal-id",
				binding.goalId,
				"--operation",
				operation,
				"--execute"
			], {
				runner: this.runner,
				cwd: capture.cwd,
				env: this.env,
				timeoutMs: this.actionTimeoutMs,
				maxOutputBytes: this.actionMaxOutputBytes,
				validate: (payload) => decodeGoalBarLifecycleExecutionV1(payload, binding.goalId, targetState)
			});
			verified = true;
		} catch {
			return {
				kind: "unknown",
				code: "operation_result_unknown"
			};
		} finally {
			admission.resolveMutation();
		}
		if (!verified) return {
			kind: "unknown",
			code: "operation_result_unknown"
		};
		let driverReceipt;
		try {
			driverReceipt = request.op === "start" ? await this.coordinator.evaluateActivatedSession(capture) : await this.coordinator.cancelQueued(capture);
		} catch {
			driverReceipt = {
				kind: "unavailable",
				reason: "driver_unavailable"
			};
		}
		const postRead = await this.readResult(request.sessionId, this.disposal.signal);
		if (postRead.kind !== "present" || postRead.snapshot.goalId !== request.expected.goalId || postRead.snapshot.loopxAgentId !== request.expected.loopxAgentId) return {
			kind: "applied_with_warning",
			code: "post_read_failed"
		};
		if (driverReceipt.kind !== "applied") return {
			kind: "applied_with_warning",
			code: "driver_sync_failed",
			snapshot: postRead.snapshot,
			baseSessionEventSeq: postRead.baseSessionEventSeq,
			sourceRevision: postRead.sourceRevision
		};
		return {
			kind: "succeeded",
			snapshot: postRead.snapshot,
			baseSessionEventSeq: postRead.baseSessionEventSeq,
			sourceRevision: postRead.sourceRevision
		};
	}
};
function createGoalBarService(options) {
	return new GoalBarService(options);
}
//#endregion
//#region build-temp/host/goalbar/connection-rpc.js
const GOALBAR_RPC_CHANNEL = "/loopx";
function badRequestCarrier() {
	return {
		ok: false,
		error: {
			code: "bad-request",
			message: "invalid LoopX GoalBar request",
			details: { issues: [] }
		}
	};
}
function successCarrier(value) {
	return {
		ok: true,
		value
	};
}
/**
* Close the generic Connection carrier around the GoalBar V2 business union.
* No exception value or request payload is ever rendered into the carrier.
*/
function createGoalBarConnectionHandler(service) {
	return async (endpoint, payload, signal) => {
		let request;
		try {
			request = decodeGoalBarRequestV1(endpoint, payload);
			if (request === void 0) return badRequestCarrier();
			try {
				return successCarrier(await service.handle(request, signal));
			} catch {
				return successCarrier(fixedGoalBarFailureResponseV1(request));
			}
		} catch {
			return request === void 0 ? badRequestCarrier() : successCarrier(fixedGoalBarFailureResponseV1(request));
		}
	};
}
function registerGoalBarConnectionRpc(connection, service) {
	return connection.rpc.handle(GOALBAR_RPC_CHANNEL, createGoalBarConnectionHandler(service), { authority: "loopback" });
}
//#endregion
//#region build-temp/host/index.js
const name = "dsh-loopx-plugin";
const inject = [
	"agents",
	"connection",
	"loopxBootstrap"
];
/** Package-root Host plugin: one GoalBar service, never a second Driver. */
function apply(ctx) {
	ctx.effect(() => {
		const service = createGoalBarService({
			getAgent: (sessionId) => ctx.agents.get(sessionId),
			coordinator: goalBarCoordinator,
			resolveCommand: (signal) => resolvePluginLoopXCommand({ signal }),
			warn: (message) => {
				ctx.logger.warn(message);
			}
		});
		const disposeRpc = registerGoalBarConnectionRpc(ctx.connection, service);
		return async () => {
			await service.dispose();
			await disposeRpc();
		};
	}, "dsh-loopx GoalBar Host service");
}
//#endregion
export { GOALBAR_RPC_CHANNEL, GoalBarService, LoopXCliError, LoopXContinuationDriver, LoopXInitError, apply, createGoalBarConnectionHandler, createGoalBarService, decodeGoalBarLifecycleExecutionV1, initializeLoopX, inject, name, registerGoalBarConnectionRpc, resolveLoopXCommand, resolvePluginLoopXCommand, runFile, runJsonCommand, runJsonMutationCommand };
