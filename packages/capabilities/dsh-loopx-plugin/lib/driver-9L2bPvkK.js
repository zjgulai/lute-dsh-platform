import { c as LoopXCliError, d as runJsonCommand, l as resolveLoopXCommand, s as resolvePluginLoopXCommand } from "./managed-runtime-YLwD9k45.js";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
//#region build-temp/host/goalbar/events.js
function isSequence(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isNewer(sequence, cursor) {
	return cursor === null || sequence > cursor;
}
function isCurrent(predicate) {
	try {
		return predicate();
	} catch {
		return false;
	}
}
function currentStatus(options) {
	try {
		return options.getAgentStatus();
	} catch {
		return;
	}
}
function runtimeReceipt(session, options) {
	const status = currentStatus(options);
	return status !== void 0 && status !== options.observedAgentStatus ? {
		kind: "runtime_changed",
		sessionId: String(session.id),
		agentStatus: status
	} : void 0;
}
function latestSessionEventSeq(session) {
	for (let index = session.events.length - 1; index >= 0; index -= 1) {
		const seq = session.events[index]?.seq;
		if (isSequence(seq)) return seq;
	}
	return null;
}
function latestGoalBarCandidateSeq(session) {
	for (let index = session.events.length - 1; index >= 0; index -= 1) {
		const event = session.events[index];
		if ((event?.type === "step/end" || event?.type === "turn/end") && isSequence(event.seq)) return event.seq;
	}
	return null;
}
/** Exact-Session event coordinator; it owns waiters, never business snapshots. */
var GoalBarCoordinator = class {
	waiters = /* @__PURE__ */ new Set();
	driverBridge;
	openWatchService() {
		const service = { disposed: false };
		return {
			waitForSessionChange: (session, cursor, options) => this.waitForSessionChange(service, session, cursor, options),
			dispose: () => {
				if (service.disposed) return;
				service.disposed = true;
				for (const waiter of [...this.waiters]) if (waiter.service === service) this.settle(waiter, { kind: "service_disposed" });
			}
		};
	}
	publishSessionCandidate(session, event) {
		if (!isSequence(event.seq)) return;
		for (const waiter of [...this.waiters]) {
			if (waiter.session !== session || !isNewer(event.seq, waiter.afterSessionEventSeq)) continue;
			this.settle(waiter, isCurrent(waiter.options.isSessionCurrent) ? {
				kind: "candidate",
				sessionId: String(session.id),
				sessionEventSeq: event.seq
			} : { kind: "session_unavailable" });
		}
	}
	publishAgentStatus(session, status) {
		for (const waiter of [...this.waiters]) {
			if (waiter.session !== session || waiter.options.observedAgentStatus === status) continue;
			this.settle(waiter, isCurrent(waiter.options.isSessionCurrent) ? {
				kind: "runtime_changed",
				sessionId: String(session.id),
				agentStatus: status
			} : { kind: "session_unavailable" });
		}
	}
	invalidateSession(session) {
		for (const waiter of [...this.waiters]) if (waiter.session === session) this.settle(waiter, { kind: "session_unavailable" });
	}
	registerDriverBridge(bridge) {
		this.driverBridge = bridge;
		let registered = true;
		return () => {
			if (!registered) return;
			registered = false;
			if (this.driverBridge === bridge) this.driverBridge = void 0;
		};
	}
	evaluateActivatedSession(capture) {
		return this.invokeDriver("evaluateActivatedSession", capture);
	}
	cancelQueued(capture) {
		return this.invokeDriver("cancelQueued", capture);
	}
	waitForSessionChange(service, session, afterSessionEventSeq, options) {
		if (service.disposed) return Promise.resolve({ kind: "service_disposed" });
		if (options.signal.aborted) return Promise.resolve({ kind: "aborted" });
		if (!isCurrent(options.isSessionCurrent)) return Promise.resolve({ kind: "session_unavailable" });
		const immediate = latestGoalBarCandidateSeq(session);
		if (immediate !== null && isNewer(immediate, afterSessionEventSeq)) return Promise.resolve({
			kind: "candidate",
			sessionId: String(session.id),
			sessionEventSeq: immediate
		});
		const runtime = runtimeReceipt(session, options);
		if (runtime !== void 0) return Promise.resolve(runtime);
		return new Promise((resolveReceipt) => {
			const timeoutMs = Number.isSafeInteger(options.timeoutMs) && options.timeoutMs >= 0 ? options.timeoutMs : 0;
			let waiter;
			const onAbort = () => {
				this.settle(waiter, { kind: "aborted" });
			};
			waiter = {
				service,
				session,
				afterSessionEventSeq,
				options,
				resolve: resolveReceipt,
				onAbort,
				timer: setTimeout(() => {
					this.settle(waiter, isCurrent(options.isSessionCurrent) ? {
						kind: "timeout",
						sessionEventSeq: latestSessionEventSeq(session) ?? afterSessionEventSeq
					} : { kind: "session_unavailable" });
				}, timeoutMs),
				settled: false
			};
			this.waiters.add(waiter);
			options.signal.addEventListener("abort", onAbort, { once: true });
			if (service.disposed) return this.settle(waiter, { kind: "service_disposed" });
			if (options.signal.aborted) return this.settle(waiter, { kind: "aborted" });
			if (!isCurrent(options.isSessionCurrent)) return this.settle(waiter, { kind: "session_unavailable" });
			const rechecked = latestGoalBarCandidateSeq(session);
			if (rechecked !== null && isNewer(rechecked, afterSessionEventSeq)) return this.settle(waiter, {
				kind: "candidate",
				sessionId: String(session.id),
				sessionEventSeq: rechecked
			});
			const recheckedRuntime = runtimeReceipt(session, options);
			if (recheckedRuntime !== void 0) this.settle(waiter, recheckedRuntime);
		});
	}
	settle(waiter, receipt) {
		if (waiter.settled) return;
		waiter.settled = true;
		this.waiters.delete(waiter);
		clearTimeout(waiter.timer);
		waiter.options.signal.removeEventListener("abort", waiter.onAbort);
		waiter.resolve(receipt);
	}
	async invokeDriver(operation, capture) {
		if (capture.agent.session !== capture.session) return {
			kind: "unavailable",
			reason: "session_unavailable"
		};
		const bridge = this.driverBridge;
		if (bridge === void 0) return {
			kind: "unavailable",
			reason: "driver_unavailable"
		};
		try {
			return await bridge[operation](capture);
		} catch {
			return {
				kind: "unavailable",
				reason: "driver_unavailable"
			};
		}
	}
};
const goalBarCoordinator = new GoalBarCoordinator();
//#endregion
//#region build-temp/host/driver.js
const name = "dsh-loopx-driver";
const inject = ["agents", "loopxBootstrap"];
const HOST_SURFACE = "deepseek-harness-native";
const RESOLUTION_SCHEMA = "loopx_thread_agent_binding_resolution_v0";
const HEARTBEAT_SCHEMA = "loopx_heartbeat_prompt_v0";
const CONTINUATION_SCHEMA = "loopx_dsh_continuation_v0";
const DEFAULT_WAIT_MS = 5 * 6e4;
const MAX_WAIT_MS = 1440 * 6e4;
const systemClock = Object.freeze({
	setTimeout(callback, delayMs) {
		return setTimeout(callback, delayMs);
	},
	clearTimeout(handle) {
		clearTimeout(handle);
	}
});
function continuationSource(message) {
	const source = exactRecord(message.source, [
		"kind",
		"schemaVersion",
		"goalId",
		"agentId",
		"turnInstanceId"
	]);
	return source?.kind === "loopx-continuation" && source.schemaVersion === CONTINUATION_SCHEMA && typeof source.goalId === "string" && source.goalId.length > 0 && typeof source.agentId === "string" && source.agentId.length > 0 && typeof source.turnInstanceId === "string" && source.turnInstanceId.length > 0 ? source : void 0;
}
function isDriverMessage(message) {
	return continuationSource(message) !== void 0;
}
function sameReservation(message, reservation) {
	const source = continuationSource(message);
	return message.id === reservation.messageId && source !== void 0 && isDeepStrictEqual(source, reservation.source) && isDeepStrictEqual(message.content, reservation.content);
}
function automaticMessage(plan) {
	const content = Object.freeze([Object.freeze({
		type: "text",
		text: plan.taskBody
	})]);
	return Object.freeze({
		id: randomUUID(),
		role: "user",
		content,
		source: Object.freeze({
			kind: "loopx-continuation",
			schemaVersion: CONTINUATION_SCHEMA,
			goalId: plan.goalId,
			agentId: plan.agentId,
			turnInstanceId: plan.turnInstanceId
		})
	});
}
function record(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function exactRecord(value, expectedKeys) {
	const candidate = record(value);
	if (candidate === void 0) return void 0;
	const keys = Reflect.ownKeys(candidate);
	if (keys.some((key) => typeof key !== "string") || keys.length !== expectedKeys.length) return;
	const allowed = new Set(expectedKeys);
	return keys.every((key) => typeof key === "string" && allowed.has(key)) ? candidate : void 0;
}
function eventCallId(value) {
	return typeof value === "string" && value.length > 0 ? value : void 0;
}
function exactUserActivation(event) {
	if (event.type !== "user/message") return false;
	const source = record(record(event.data)?.source);
	return source?.kind === "skill-invocation" && source.name === "loopx" && source.form === "instructions";
}
function exactModelActivationCall(event) {
	if (event.type !== "tool/call") return void 0;
	const data = record(event.data);
	const callId = eventCallId(data?.callId);
	if (callId === void 0 || data?.name !== "skill" || typeof data.arguments !== "string") return void 0;
	let parsed;
	try {
		parsed = JSON.parse(data.arguments);
	} catch {
		return;
	}
	return record(parsed)?.name === "loopx" ? callId : void 0;
}
function foldActivationEvent(projection, event) {
	if (projection.activated) return;
	if (exactUserActivation(event)) {
		projection.activated = true;
		projection.pendingModelCalls.clear();
		return;
	}
	if (event.type === "tool/call") {
		const callId = eventCallId(record(event.data)?.callId);
		if (callId === void 0) return;
		projection.pendingModelCalls.delete(callId);
		if (exactModelActivationCall(event) !== void 0) projection.pendingModelCalls.add(callId);
		return;
	}
	if (event.type !== "tool/result") return;
	const data = record(event.data);
	const message = record(data?.message);
	const source = record(message?.source);
	const callId = eventCallId(source?.callId);
	if (callId === void 0) return;
	const matched = projection.pendingModelCalls.delete(callId);
	const content = message?.content;
	const block = Array.isArray(content) && content.length === 1 ? record(content[0]) : void 0;
	const successful = source?.kind === "tool" && message?.role === "user" && block?.type === "tool-result" && block.toolCallId === callId && (block.isError === void 0 || block.isError === false) && data?.error === void 0;
	if (matched && successful) {
		projection.activated = true;
		projection.pendingModelCalls.clear();
	}
}
function foldSessionActivation(session) {
	const projection = {
		session,
		pendingModelCalls: /* @__PURE__ */ new Set(),
		activated: false
	};
	try {
		for (const event of session.events) foldActivationEvent(projection, event);
	} catch {
		projection.pendingModelCalls.clear();
		projection.activated = false;
	}
	return projection;
}
function exactBinding(payload, threadId) {
	if (payload.schema_version !== RESOLUTION_SCHEMA || payload.ok !== true || payload.status !== "bound" || payload.host_surface !== HOST_SURFACE || payload.thread_id !== threadId) return void 0;
	const goalId = typeof payload.goal_id === "string" ? payload.goal_id : "";
	const agentId = typeof payload.agent_id === "string" ? payload.agent_id : "";
	const matches = Array.isArray(payload.matches) ? payload.matches : [];
	const match = matches.length === 1 ? record(matches[0]) : void 0;
	return goalId.length > 0 && goalId.trim() === goalId && agentId.length > 0 && agentId.trim() === agentId && match?.goal_id === goalId && match.agent_id === agentId ? {
		goalId,
		agentId
	} : void 0;
}
function exactQuotaContext(payload, binding) {
	const identity = record(payload.agent_identity);
	return payload.mode === "should-run" && payload.goal_id === binding.goalId && identity?.agent_id === binding.agentId && identity.registered === true;
}
function exactQuotaReceipt(payload, turnInstanceId) {
	return record(payload.heartbeat_receipt)?.turn_instance_id === turnInstanceId;
}
function exactQuota(payload, binding, turnInstanceId) {
	return exactQuotaContext(payload, binding) && payload.ok === true && payload.should_run === true && exactQuotaReceipt(payload, turnInstanceId);
}
function schedulerWait(payload, currentToken, currentPolls) {
	const scheduler = record(payload.scheduler_hint);
	const local = record(record(scheduler?.unchanged_poll)?.local_scheduler);
	if (local === void 0) return { kind: "wait" };
	const reset = record(scheduler?.reset_policy);
	const token = typeof reset?.reset_token === "string" ? reset.reset_token : "";
	const unchangedPolls = token.length > 0 && token === currentToken ? currentPolls : 0;
	const rawLimit = local.unchanged_poll_limit;
	const limit = typeof rawLimit === "number" && Number.isSafeInteger(rawLimit) && rawLimit >= 0 ? rawLimit : void 0;
	if (limit !== void 0 && unchangedPolls >= limit) return {
		kind: "wait",
		schedulerToken: token,
		unchangedPolls
	};
	const progression = Array.isArray(local.example_progression_minutes) ? local.example_progression_minutes.filter((value) => typeof value === "number" && Number.isFinite(value) && value > 0) : [];
	const recommended = local.recommended_interval_minutes;
	const fallback = typeof recommended === "number" && Number.isFinite(recommended) && recommended > 0 ? recommended : DEFAULT_WAIT_MS / 6e4;
	const minutes = progression.length > 0 ? progression[Math.min(unchangedPolls, progression.length - 1)] ?? fallback : fallback;
	return {
		kind: "wait",
		delayMs: Math.min(Math.round(minutes * 6e4), MAX_WAIT_MS),
		schedulerToken: token,
		unchangedPolls: unchangedPolls + 1
	};
}
function exactHeartbeat(payload, binding, turnInstanceId) {
	if (payload.schema_version !== HEARTBEAT_SCHEMA || payload.ok !== true || payload.goal_id !== binding.goalId || payload.agent_id !== binding.agentId || payload.turn_instance_id !== turnInstanceId) return void 0;
	const taskBody = typeof payload.task_body === "string" ? payload.task_body : "";
	const assignments = [...taskBody.matchAll(/\bLOOPX_TURN=([^\s`'";]+)/gu)].map((match) => match[1]);
	return taskBody.length > 0 && taskBody.length <= 32e3 && assignments.length === 1 && assignments[0] === turnInstanceId ? taskBody : void 0;
}
function renderThrown(value) {
	if (value instanceof LoopXCliError) return `${value.kind}:${value.message}`;
	return value instanceof Error ? value.message : String(value);
}
/** Exact-session driver with typed activation and no binding mirror or failure counter. */
var LoopXContinuationDriver = class {
	states = /* @__PURE__ */ new Map();
	isLiveAgent;
	runner;
	commandResolver;
	clock;
	makeTurnInstanceId;
	retryDelaysMs;
	runDetached;
	warn;
	command;
	disposed = false;
	constructor(options) {
		this.isLiveAgent = options.isLiveAgent;
		this.runner = options.runner;
		this.commandResolver = options.resolveCommand ?? ((signal) => resolveLoopXCommand({
			runner: this.runner,
			signal
		}));
		this.clock = options.clock ?? systemClock;
		this.makeTurnInstanceId = options.makeTurnInstanceId ?? (() => `dsh-loopx-${randomUUID()}`);
		this.retryDelaysMs = options.retryDelaysMs ?? [200, 750];
		this.runDetached = options.runDetached ?? ((operation) => operation());
		this.warn = options.warn ?? (() => {});
	}
	observeAgent(agent) {
		const state = this.stateFor(agent);
		state.activation = foldSessionActivation(agent.session);
		if (agent.status === "idle") this.requestEvaluation(state);
	}
	onAgentDisposed(agent) {
		const state = this.states.get(agent);
		if (state === void 0) return;
		this.stopState(state);
		this.states.delete(agent);
	}
	onSessionStart(agent) {
		const state = this.stateFor(agent);
		this.cancelPending(state);
		this.retireReservation(state);
		state.competing = agent.inbox.hasPending;
		state.pauseAfterTurnError = false;
		state.schedulerToken = "";
		state.unchangedPolls = 0;
		state.commands.clear();
		state.activation = foldSessionActivation(agent.session);
		this.requestEvaluation(state);
	}
	onAgentStatus(agent, status) {
		if (status !== "idle") return;
		const state = this.stateFor(agent);
		if (state.reservation?.phase === "claimed" || state.reservation?.phase === "admitted") this.retireReservation(state);
		state.competing = agent.inbox.hasPending;
		if (!state.pauseAfterTurnError) this.requestEvaluation(state);
	}
	onInboxInserted(agent, message) {
		const state = this.stateFor(agent);
		if (state.reservation !== void 0 && sameReservation(message, state.reservation)) return;
		state.competing = true;
		if (message.source.kind === "user") state.pauseAfterTurnError = false;
		this.cancelPending(state);
	}
	onInboxClaimed(agent, message) {
		const state = this.stateFor(agent);
		if (state.reservation !== void 0 && sameReservation(message, state.reservation)) {
			state.reservation.phase = "claimed";
			return;
		}
		state.competing = true;
	}
	onInboxDiscarded(agent, message) {
		const state = this.states.get(agent);
		if (state?.reservation !== void 0 && sameReservation(message, state.reservation)) this.retireReservation(state);
	}
	onAgentError(agent) {
		const state = this.stateFor(agent);
		state.pauseAfterTurnError = true;
		this.cancelPending(state);
	}
	async evaluateActivatedSession(capture) {
		if (!this.captureIsLive(capture)) return {
			kind: "unavailable",
			reason: "session_unavailable"
		};
		const state = this.stateFor(capture.agent);
		if (state.stopping || state.activation.session !== capture.session) return {
			kind: "unavailable",
			reason: "session_unavailable"
		};
		state.activation = foldSessionActivation(capture.session);
		if (!state.activation.activated) return { kind: "applied" };
		state.pauseAfterTurnError = false;
		const evaluated = new Promise((resolve) => {
			state.evaluationWaiters.add({
				session: capture.session,
				resolve
			});
		});
		this.requestEvaluation(state);
		if (!await evaluated) return this.captureIsLive(capture) ? {
			kind: "unavailable",
			reason: "evaluation_unavailable"
		} : {
			kind: "unavailable",
			reason: "session_unavailable"
		};
		return this.captureIsLive(capture) && state.activation.session === capture.session ? { kind: "applied" } : {
			kind: "unavailable",
			reason: "session_unavailable"
		};
	}
	async cancelQueued(capture) {
		if (!this.captureIsLive(capture)) return {
			kind: "unavailable",
			reason: "session_unavailable"
		};
		const state = this.states.get(capture.agent);
		if (state === void 0) return { kind: "applied" };
		if (state.stopping || state.activation.session !== capture.session) return {
			kind: "unavailable",
			reason: "session_unavailable"
		};
		const reservation = state.reservation;
		if (reservation?.phase === "claimed" || reservation?.phase === "admitted") reservation.preserveAcrossPause = true;
		this.cancelPending(state);
		return this.captureIsLive(capture) && state.activation.session === capture.session ? { kind: "applied" } : {
			kind: "unavailable",
			reason: "session_unavailable"
		};
	}
	onSessionEvent(agent, event) {
		if (this.states.get(agent) === void 0) return;
		const state = this.stateFor(agent);
		const wasActivated = state.activation.activated;
		foldActivationEvent(state.activation, event);
		if (!wasActivated && state.activation.activated && agent.status === "idle" && !state.pauseAfterTurnError) this.requestEvaluation(state);
		if (event.type === "command/run") {
			state.commands.add(String(event.data.commandId));
			state.competing = true;
			this.cancelPending(state);
			return;
		}
		if (event.type === "command/done") {
			state.commands.delete(String(event.data.commandId));
			if (state.commands.size === 0) {
				state.competing = agent.inbox.hasPending;
				if (agent.status === "idle" && !state.pauseAfterTurnError) this.requestEvaluation(state);
			}
			return;
		}
		if (event.type === "user/message" && state.reservation !== void 0 && event.data.id === state.reservation.messageId) {
			state.reservation.phase = "admitted";
			return;
		}
		if (event.type === "turn/end" && (event.data.reason.kind === "max-tokens" || event.data.reason.kind === "aborted")) {
			state.pauseAfterTurnError = true;
			this.cancelPending(state);
		}
	}
	async onPreStep(agent, messages, signal, next) {
		const state = this.stateFor(agent);
		const reservation = state.reservation;
		const submitted = reservation === void 0 ? messages.find((message) => isDriverMessage(message)) : messages.find((message) => message.id === reservation.messageId) ?? messages.find((message) => isDriverMessage(message));
		if (submitted === void 0) return next();
		if (reservation === void 0 || !sameReservation(submitted, reservation) || reservation.phase !== "claimed") {
			if (reservation !== void 0 && submitted.id === reservation.messageId) this.retireReservation(state);
			this.restoreOtherMessages(agent, messages, submitted);
			return { kind: "reject" };
		}
		if (messages.some((message) => message.id !== submitted.id)) {
			this.retireReservation(state);
			this.restoreOtherMessages(agent, messages, submitted);
			return { kind: "reject" };
		}
		if (!await this.authorityStillAllows(state, reservation, signal)) {
			this.retireReservation(state);
			this.restoreOtherMessages(agent, messages, submitted);
			this.requestEvaluation(state);
			return { kind: "reject" };
		}
		let decision;
		try {
			decision = await next();
		} catch (error) {
			state.pauseAfterTurnError = true;
			this.retireReservation(state);
			throw error;
		}
		if (signal.aborted) {
			state.pauseAfterTurnError = true;
			this.retireReservation(state);
			return decision;
		}
		if (decision.kind === "reject") {
			state.pauseAfterTurnError = true;
			this.retireReservation(state);
			return decision;
		}
		const admitted = decision.messages.find((message) => message.id === reservation.messageId);
		if (decision.messages.length !== 1 || admitted === void 0 || !sameReservation(admitted, reservation)) {
			this.retireReservation(state);
			this.restoreOtherMessages(agent, decision.messages, submitted);
			return { kind: "reject" };
		}
		if (!await this.authorityStillAllows(state, reservation, signal)) {
			this.retireReservation(state);
			this.restoreOtherMessages(agent, decision.messages, submitted);
			return { kind: "reject" };
		}
		return decision;
	}
	async dispose() {
		if (this.disposed) return;
		this.disposed = true;
		const waits = [];
		for (const state of this.states.values()) {
			const activeAutomaticStep = state.reservation?.phase === "claimed" || state.reservation?.phase === "admitted";
			this.stopState(state);
			if (activeAutomaticStep && state.agent.status === "running") try {
				state.agent.cancel({ kind: "parent" });
				waits.push(state.agent.whenIdle());
			} catch (error) {
				this.warn(`dsh-loopx-driver: could not cancel active work: ${renderThrown(error)}`);
			}
			if (state.run !== void 0) waits.push(state.run);
		}
		await Promise.allSettled(waits);
		this.states.clear();
	}
	stateFor(agent) {
		const existing = this.states.get(agent);
		if (existing !== void 0) {
			if (existing.activation.session !== agent.session) {
				this.resolveEvaluationWaiters(existing, false);
				this.cancelPending(existing);
				this.retireReservation(existing);
				existing.competing = agent.inbox.hasPending;
				existing.pauseAfterTurnError = false;
				existing.schedulerToken = "";
				existing.unchangedPolls = 0;
				existing.commands.clear();
				existing.activation = foldSessionActivation(agent.session);
			}
			return existing;
		}
		const state = {
			agent,
			activation: foldSessionActivation(agent.session),
			requested: false,
			stopping: false,
			competing: agent.inbox.hasPending,
			pauseAfterTurnError: false,
			schedulerToken: "",
			unchangedPolls: 0,
			commands: /* @__PURE__ */ new Set(),
			evaluationWaiters: /* @__PURE__ */ new Set()
		};
		this.states.set(agent, state);
		return state;
	}
	captureIsLive(capture) {
		return !this.disposed && capture.agent.session === capture.session && this.isLiveAgent(capture.agent) && capture.agent.id === capture.session.id && capture.agent.id === capture.session.header.id;
	}
	ready(state) {
		return !this.disposed && !state.stopping && state.activation.session === state.agent.session && state.activation.activated && !state.pauseAfterTurnError && !state.competing && state.commands.size === 0 && state.reservation === void 0 && this.isLiveAgent(state.agent) && state.agent.status === "idle" && !state.agent.inbox.hasPending && state.agent.id === state.agent.session.id && state.agent.id === state.agent.session.header.id && typeof state.agent.session.header.cwd === "string" && state.agent.session.header.cwd.length > 0;
	}
	requestEvaluation(state) {
		if (state.stopping || this.disposed || state.activation.session !== state.agent.session || !state.activation.activated) return;
		state.requested = true;
		if (state.run !== void 0) return;
		let run;
		try {
			run = this.runDetached(async () => {
				while (state.requested && !state.stopping) {
					state.requested = false;
					const waiters = [...state.evaluationWaiters];
					for (const waiter of waiters) state.evaluationWaiters.delete(waiter);
					let evaluated = false;
					try {
						evaluated = await this.evaluate(state);
					} finally {
						this.resolveEvaluationWaiterBatch(state, waiters, evaluated);
					}
				}
			});
		} catch (error) {
			state.requested = false;
			this.resolveEvaluationWaiters(state, false);
			this.warn(`dsh-loopx-driver: could not start evaluation: ${renderThrown(error)}`);
			return;
		}
		state.run = run;
		const retire = () => {
			state.run = void 0;
			if (state.requested && !state.stopping) this.requestEvaluation(state);
		};
		run.then(retire, (error) => {
			this.warn(`dsh-loopx-driver: evaluation failed: ${renderThrown(error)}`);
			retire();
		});
	}
	async evaluate(state) {
		if (!this.ready(state)) return false;
		const controller = new AbortController();
		state.controller = controller;
		let evaluationStarted = false;
		let plan;
		try {
			plan = await state.agent.runMaintenance(async (maintenanceSignal) => {
				evaluationStarted = true;
				const signal = AbortSignal.any([controller.signal, maintenanceSignal]);
				return this.buildPlan(state, signal);
			});
		} catch (error) {
			const cancelled = error instanceof LoopXCliError && error.kind === "aborted";
			if (error instanceof LoopXCliError && error.kind === "missing") this.command = void 0;
			if (!controller.signal.aborted && !cancelled) this.warn(`dsh-loopx-driver: LoopX admission failed: ${renderThrown(error)}`);
			return evaluationStarted;
		} finally {
			if (state.controller === controller) state.controller = void 0;
		}
		if (plan.kind === "wait") {
			if (plan.schedulerToken !== void 0) state.schedulerToken = plan.schedulerToken;
			if (plan.unchangedPolls !== void 0) state.unchangedPolls = plan.unchangedPolls;
			if (plan.delayMs !== void 0) this.schedule(state, plan.delayMs);
			return true;
		}
		state.schedulerToken = "";
		state.unchangedPolls = 0;
		if (!this.ready(state) || state.agent.session !== plan.session) return true;
		const message = automaticMessage(plan);
		state.reservation = {
			messageId: message.id,
			content: message.content,
			source: message.source,
			session: plan.session,
			goalId: plan.goalId,
			agentId: plan.agentId,
			turnInstanceId: plan.turnInstanceId,
			phase: "queued",
			preserveAcrossPause: false
		};
		try {
			state.agent.followup(message);
		} catch (error) {
			this.retireReservation(state);
			this.warn(`dsh-loopx-driver: could not queue same-session work: ${renderThrown(error)}`);
		}
		return true;
	}
	ensureReady(state, signal, session) {
		if (signal.aborted || !this.ready(state) || state.agent.session !== session) throw new LoopXCliError("aborted", "automatic admission was fenced", false);
	}
	async buildPlan(state, signal) {
		const session = state.agent.session;
		this.ensureReady(state, signal, session);
		const command = await this.loopXCommand(signal);
		this.ensureReady(state, signal, session);
		const bindingPayload = await this.resolveBinding(command, state.agent, signal);
		this.ensureReady(state, signal, session);
		if (bindingPayload.ok !== true) throw new LoopXCliError("typed_failure", "LoopX binding authority rejected automatic continuation", false);
		const binding = exactBinding(bindingPayload, String(state.agent.id));
		if (binding === void 0) return {
			kind: "wait",
			schedulerToken: "",
			unchangedPolls: 0
		};
		const turnInstanceId = this.makeTurnInstanceId();
		const quota = await this.readQuota(command, state.agent, binding, turnInstanceId, signal);
		this.ensureReady(state, signal, session);
		if (quota.ok !== true) throw new LoopXCliError("typed_failure", "LoopX quota authority rejected automatic continuation", false);
		if (!exactQuotaContext(quota, binding) || quota.should_run === true && !exactQuotaReceipt(quota, turnInstanceId)) throw new LoopXCliError("invalid_schema", "LoopX quota response did not match the bound Goal and Agent", false);
		if (quota.should_run !== true) return schedulerWait(quota, state.schedulerToken, state.unchangedPolls);
		const heartbeat = await this.readHeartbeat(command, state.agent, binding, turnInstanceId, signal);
		this.ensureReady(state, signal, session);
		if (heartbeat.ok !== true) throw new LoopXCliError("typed_failure", "LoopX heartbeat authority rejected automatic continuation", false);
		const taskBody = exactHeartbeat(heartbeat, binding, turnInstanceId);
		if (taskBody === void 0) throw new LoopXCliError("invalid_schema", "LoopX heartbeat response did not match the bound Goal and Agent", false);
		return {
			kind: "queue",
			...binding,
			session,
			turnInstanceId,
			taskBody
		};
	}
	async authorityStillAllows(state, reservation, signal) {
		if (!this.reservationIsCurrent(state, reservation, signal)) return false;
		try {
			const command = await this.loopXCommand(signal);
			const binding = exactBinding(await this.resolveBinding(command, state.agent, signal), String(state.agent.id));
			if (binding?.goalId !== reservation.goalId || binding.agentId !== reservation.agentId) return false;
			if (reservation.preserveAcrossPause) return this.reservationIsCurrent(state, reservation, signal);
			const quota = await this.readQuota(command, state.agent, reservation, reservation.turnInstanceId, signal);
			return this.reservationIsCurrent(state, reservation, signal) && (reservation.preserveAcrossPause || exactQuota(quota, reservation, reservation.turnInstanceId));
		} catch (error) {
			if (error instanceof LoopXCliError && error.kind === "missing") this.command = void 0;
			if (!(error instanceof LoopXCliError && error.kind === "aborted")) this.warn(`dsh-loopx-driver: pre-step authority check failed: ${renderThrown(error)}`);
			return false;
		}
	}
	reservationIsCurrent(state, reservation, signal) {
		return !signal.aborted && !this.disposed && !state.stopping && !state.pauseAfterTurnError && !state.competing && state.activation.activated && state.activation.session === state.agent.session && state.agent.session === reservation.session && state.reservation === reservation && this.isLiveAgent(state.agent) && state.agent.id === reservation.session.id && state.agent.id === reservation.session.header.id;
	}
	async loopXCommand(signal) {
		if (this.command !== void 0) return this.command;
		const resolved = await this.commandResolver(signal);
		if (!signal.aborted) this.command = resolved;
		return resolved;
	}
	resolveBinding(command, agent, signal) {
		return runJsonCommand(command, [
			"--registry",
			".loopx/registry.json",
			"--format",
			"json",
			"resolve-agent-thread",
			"--host-surface",
			HOST_SURFACE,
			"--thread-id",
			String(agent.id)
		], {
			runner: this.runner,
			cwd: agent.session.header.cwd,
			signal,
			attempts: 3,
			retryDelaysMs: this.retryDelaysMs,
			validate: (payload) => payload.schema_version === RESOLUTION_SCHEMA && payload.host_surface === HOST_SURFACE && payload.thread_id === String(agent.id)
		});
	}
	readQuota(command, agent, binding, turnInstanceId, signal) {
		return runJsonCommand(command, [
			"--registry",
			".loopx/registry.json",
			"--format",
			"json",
			"quota",
			"should-run",
			"--goal-id",
			binding.goalId,
			"--agent-id",
			binding.agentId,
			"--runtime-profile",
			"generic_cli",
			"--include-detail",
			"scheduler",
			"--turn-instance-id",
			turnInstanceId
		], {
			runner: this.runner,
			cwd: agent.session.header.cwd,
			signal,
			attempts: 3,
			retryDelaysMs: this.retryDelaysMs,
			validate: (payload) => payload.goal_id === binding.goalId && typeof payload.ok === "boolean" && typeof payload.should_run === "boolean"
		});
	}
	readHeartbeat(command, agent, binding, turnInstanceId, signal) {
		return runJsonCommand(command, [
			"--registry",
			".loopx/registry.json",
			"--format",
			"json",
			"heartbeat-prompt",
			"--thin",
			"--goal-id",
			binding.goalId,
			"--agent-id",
			binding.agentId,
			"--runtime-profile",
			"generic_cli",
			"--turn-instance-id",
			turnInstanceId
		], {
			runner: this.runner,
			cwd: agent.session.header.cwd,
			signal,
			attempts: 3,
			retryDelaysMs: this.retryDelaysMs,
			validate: (payload) => payload.schema_version === HEARTBEAT_SCHEMA && payload.goal_id === binding.goalId && payload.agent_id === binding.agentId && payload.turn_instance_id === turnInstanceId
		});
	}
	schedule(state, delayMs) {
		if (state.stopping || this.disposed || state.activation.session !== state.agent.session || !state.activation.activated) return;
		if (state.timer !== void 0) this.clock.clearTimeout(state.timer);
		const handle = this.clock.setTimeout(() => {
			if (state.timer !== handle) return;
			state.timer = void 0;
			this.requestEvaluation(state);
		}, Math.max(0, Math.min(delayMs, MAX_WAIT_MS)));
		state.timer = handle;
	}
	resolveEvaluationWaiterBatch(state, waiters, evaluated) {
		for (const waiter of waiters) waiter.resolve(evaluated && !this.disposed && !state.stopping && state.activation.session === waiter.session && state.agent.session === waiter.session && this.isLiveAgent(state.agent));
	}
	resolveEvaluationWaiters(state, evaluated) {
		const waiters = [...state.evaluationWaiters];
		state.evaluationWaiters.clear();
		this.resolveEvaluationWaiterBatch(state, waiters, evaluated);
	}
	cancelPending(state) {
		state.requested = false;
		state.controller?.abort();
		state.controller = void 0;
		if (state.timer !== void 0) {
			this.clock.clearTimeout(state.timer);
			state.timer = void 0;
		}
		const reservation = state.reservation;
		if (reservation === void 0 || reservation.phase !== "queued") return;
		state.agent.inbox.remove(reservation.messageId);
		this.retireReservation(state);
	}
	retireReservation(state) {
		if (state.reservation === void 0) return;
		state.reservation.phase = "retired";
		state.reservation = void 0;
	}
	restoreOtherMessages(agent, messages, submitted) {
		for (const message of messages) {
			if (message.id === submitted.id || isDriverMessage(message)) continue;
			if (agent.inbox.nextStep.some((candidate) => candidate.id === message.id) || agent.inbox.nextTurn.some((candidate) => candidate.id === message.id)) continue;
			agent.send(message, "next-step", true);
		}
	}
	stopState(state) {
		state.stopping = true;
		this.resolveEvaluationWaiters(state, false);
		this.cancelPending(state);
	}
};
function apply(ctx) {
	const driver = new LoopXContinuationDriver({
		isLiveAgent: (agent) => ctx.agents.get(agent.id) === agent,
		resolveCommand: (signal) => resolvePluginLoopXCommand({ signal }),
		runDetached: (operation) => ctx.agents.withoutInitiator(operation),
		warn: (message) => {
			ctx.logger.warn(message);
		}
	});
	ctx.effect(function* () {
		const unregisterDriverBridge = goalBarCoordinator.registerDriverBridge(driver);
		ctx.on("agent/created", ({ agent }) => {
			driver.observeAgent(agent);
		});
		ctx.on("agent/disposed", ({ agent }) => {
			goalBarCoordinator.invalidateSession(agent.session);
			driver.onAgentDisposed(agent);
		});
		ctx.on("session/disposed", (session) => {
			goalBarCoordinator.invalidateSession(session);
		});
		ctx.on("agent/session-start", ({ agent }) => {
			driver.onSessionStart(agent);
		});
		ctx.on("agent/status", ({ agent, status }) => {
			if (status === "idle" || status === "running") goalBarCoordinator.publishAgentStatus(agent.session, status);
			driver.onAgentStatus(agent, status);
		});
		ctx.on("agent/inbox/inserted", ({ agent, message }) => driver.onInboxInserted(agent, message));
		ctx.on("agent/inbox/claimed", ({ agent, message }) => driver.onInboxClaimed(agent, message));
		ctx.on("agent/inbox/discarded", ({ agent, message }) => driver.onInboxDiscarded(agent, message));
		ctx.on("agent/error", ({ agent }) => {
			driver.onAgentError(agent);
		});
		ctx.on("agent/pre-step", ({ agent, messages, signal }, next) => driver.onPreStep(agent, messages, signal, next));
		ctx.on("session/event", (session, event) => {
			if (event.type === "step/end" || event.type === "turn/end") goalBarCoordinator.publishSessionCandidate(session, event);
			const agent = ctx.agents.get(session.id);
			if (agent?.session === session) driver.onSessionEvent(agent, event);
		});
		for (const agent of ctx.agents.list()) driver.observeAgent(agent);
		yield async () => {
			unregisterDriverBridge();
			await driver.dispose();
		};
	}, "dsh-loopx-driver lifecycle");
}
//#endregion
export { goalBarCoordinator as a, name as i, apply as n, latestSessionEventSeq as o, inject as r, LoopXContinuationDriver as t };
