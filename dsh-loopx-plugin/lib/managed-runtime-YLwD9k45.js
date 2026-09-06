import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
//#region build-temp/host/cli.js
var LoopXCliError = class extends Error {
	kind;
	retryable;
	exitCode;
	constructor(kind, message, retryable, exitCode) {
		super(message);
		this.kind = kind;
		this.retryable = retryable;
		this.exitCode = exitCode;
		this.name = "LoopXCliError";
	}
};
const DEFAULT_TIMEOUT_MS = 2e4;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const FORCE_KILL_GRACE_MS = 250;
function transportKind(error) {
	if (error.code === "ENOENT") return new LoopXCliError("missing", "required executable is unavailable", false);
	return new LoopXCliError("transport", "could not start the LoopX command", true);
}
const runFile = (file, args, options) => new Promise((resolve, reject) => {
	if (options.signal?.aborted) {
		reject(new LoopXCliError("aborted", "operation was cancelled", false));
		return;
	}
	const child = spawn(file, [...args], {
		cwd: options.cwd,
		env: options.env ?? process.env,
		shell: false,
		stdio: [
			"ignore",
			"pipe",
			"pipe"
		]
	});
	const stdout = [];
	const stderr = [];
	const limit = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
	let outputBytes = 0;
	let settled = false;
	let terminalError;
	let forceKillTimer;
	const cleanup = () => {
		clearTimeout(timer);
		if (forceKillTimer !== void 0) clearTimeout(forceKillTimer);
		options.signal?.removeEventListener("abort", abort);
	};
	const fail = (error) => {
		if (settled || terminalError !== void 0) return;
		terminalError = error;
		clearTimeout(timer);
		options.signal?.removeEventListener("abort", abort);
		child.kill("SIGTERM");
		forceKillTimer = setTimeout(() => {
			if (!settled) child.kill("SIGKILL");
		}, FORCE_KILL_GRACE_MS);
	};
	const collect = (target, chunk) => {
		if (terminalError !== void 0) return;
		outputBytes += chunk.byteLength;
		if (outputBytes > limit) {
			fail(new LoopXCliError("output_limit", "LoopX output exceeded its bounded limit", false));
			return;
		}
		target.push(chunk);
	};
	const abort = () => {
		fail(new LoopXCliError("aborted", "operation was cancelled", false));
	};
	const timer = setTimeout(() => {
		fail(new LoopXCliError("timeout", "LoopX command timed out", true));
	}, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	options.signal?.addEventListener("abort", abort, { once: true });
	child.stdout.on("data", (chunk) => collect(stdout, chunk));
	child.stderr.on("data", (chunk) => collect(stderr, chunk));
	child.on("error", (error) => fail(transportKind(error)));
	child.on("close", (code) => {
		if (settled) return;
		settled = true;
		cleanup();
		if (terminalError !== void 0) {
			reject(terminalError);
			return;
		}
		resolve({
			exitCode: code ?? 1,
			stdout: Buffer.concat(stdout).toString("utf8"),
			stderr: Buffer.concat(stderr).toString("utf8")
		});
	});
});
function recordPayload(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function parsePayload(stdout) {
	try {
		return recordPayload(JSON.parse(stdout));
	} catch {
		return;
	}
}
async function wait(delayMs, signal) {
	if (delayMs <= 0) return;
	await new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new LoopXCliError("aborted", "operation was cancelled", false));
			return;
		}
		const timer = setTimeout(done, delayMs);
		function done() {
			signal?.removeEventListener("abort", aborted);
			resolve();
		}
		function aborted() {
			clearTimeout(timer);
			signal?.removeEventListener("abort", aborted);
			reject(new LoopXCliError("aborted", "operation was cancelled", false));
		}
		signal?.addEventListener("abort", aborted, { once: true });
	});
}
/**
* Execute one mutation exactly once. Caller cancellation is intentionally not
* accepted: admission is fenced before this function is called, and the real
* runner waits for child close after every forced termination.
*/
async function runJsonMutationCommand(command, args, options = {}) {
	const runner = options.runner ?? runFile;
	let result;
	try {
		result = await runner(command.file, [...command.prefix, ...args], {
			cwd: options.cwd,
			env: options.env,
			timeoutMs: options.timeoutMs,
			maxOutputBytes: options.maxOutputBytes
		});
	} catch (error) {
		throw error instanceof LoopXCliError ? error : new LoopXCliError("transport", "LoopX mutation command failed to execute", false);
	}
	const payload = parsePayload(result.stdout);
	if (result.exitCode !== 0) throw new LoopXCliError(payload === void 0 ? "exit" : "typed_failure", "LoopX mutation command did not verify", false, result.exitCode);
	if (payload === void 0) throw new LoopXCliError("invalid_json", "LoopX mutation command returned invalid JSON", false);
	if (options.validate !== void 0 && !options.validate(payload)) throw new LoopXCliError("invalid_schema", "LoopX mutation command returned an incompatible response schema", false);
	return payload;
}
/** Execute fixed argv and retry only transport/timeout/untyped-exit failures. */
async function runJsonCommand(command, args, options = {}) {
	const runner = options.runner ?? runFile;
	const attempts = Math.max(1, options.attempts ?? 1);
	const retryDelays = options.retryDelaysMs ?? [200, 750];
	let lastError;
	for (let attempt = 0; attempt < attempts; attempt += 1) try {
		const result = await runner(command.file, [...command.prefix, ...args], options);
		const payload = parsePayload(result.stdout);
		if (payload !== void 0) {
			if (options.validate !== void 0 && !options.validate(payload)) throw new LoopXCliError("invalid_schema", "LoopX returned an incompatible response schema", false);
			return payload;
		}
		if (result.exitCode === 0) throw new LoopXCliError("invalid_json", "LoopX returned invalid JSON", false);
		throw new LoopXCliError("exit", "LoopX exited without a typed response", true, result.exitCode);
	} catch (error) {
		const failure = error instanceof LoopXCliError ? error : new LoopXCliError("transport", "LoopX command failed to execute", true);
		lastError = failure;
		if (!failure.retryable || attempt + 1 >= attempts) throw failure;
		await wait(retryDelays[attempt] ?? retryDelays.at(-1) ?? 0, options.signal);
	}
	throw lastError ?? new LoopXCliError("transport", "LoopX command failed", true);
}
function versionText(stdout) {
	const value = stdout.trim().split(/\r?\n/u)[0]?.trim();
	return value && value.length <= 120 ? value : void 0;
}
function shellWord(value) {
	return /^[A-Za-z0-9_./:-]+$/u.test(value) ? value : `'${value.replaceAll("'", `'"'"'`)}'`;
}
/** Resolve the console script first, then the stable Python module fallback. */
async function resolveLoopXCommand(options = {}) {
	const runner = options.runner ?? runFile;
	const configured = options.env?.LOOPX_BIN ?? process.env.LOOPX_BIN;
	const python = options.env?.PYTHON_BIN ?? process.env.PYTHON_BIN ?? "python3";
	const managedLauncher = options.managedLauncher;
	const managedCandidates = configured || managedLauncher === void 0 ? [] : [...new Set(managedLauncher.pythonBins)].map((pythonBin) => ({
		file: pythonBin,
		prefix: [managedLauncher.path],
		skillCommand: [shellWord(pythonBin), shellWord(managedLauncher.path)].join(" ")
	}));
	const candidates = configured ? [{
		file: configured,
		prefix: [],
		skillCommand: "\"$LOOPX_BIN\""
	}] : [
		...managedCandidates,
		{
			file: "loopx",
			prefix: [],
			skillCommand: "loopx"
		},
		{
			file: python,
			prefix: ["-m", "loopx.cli"],
			skillCommand: `${shellWord(python)} -m loopx.cli`
		}
	];
	for (const candidate of candidates) try {
		const result = await runner(candidate.file, [...candidate.prefix, "--version"], {
			env: options.env,
			signal: options.signal,
			timeoutMs: 5e3,
			maxOutputBytes: 16 * 1024
		});
		const version = result.exitCode === 0 ? versionText(result.stdout) : void 0;
		if (version?.startsWith("loopx ")) return {
			...candidate,
			version
		};
	} catch (error) {
		if (error instanceof LoopXCliError && error.kind === "aborted") throw error;
	}
	throw new LoopXCliError("missing", "LoopX CLI is unavailable", false);
}
//#endregion
//#region build-temp/host/managed-runtime.js
const MANAGED_LAUNCHER_NAME = "loopx_cli.py";
const MANAGED_SITE_PACKAGES_NAME = "site-packages";
const PYTHON_CANDIDATES = Object.freeze([
	"python3",
	"python3.14",
	"python3.13",
	"python3.12",
	"python3.11"
]);
function configuredPluginPython(options) {
	return options.pythonBin ?? options.env?.PYTHON_BIN ?? process.env.PYTHON_BIN;
}
function pluginPythonCandidates(options) {
	const explicit = configuredPluginPython(options);
	return explicit === void 0 ? PYTHON_CANDIDATES : [explicit];
}
function pluginAgentsHome(options) {
	const configured = options.env?.DSH_AGENTS_HOME ?? process.env.DSH_AGENTS_HOME;
	return configured?.trim() ? configured : join(homedir(), ".agents");
}
function pluginRuntimeDir(options) {
	return resolve(options.runtimeDir ?? join(pluginAgentsHome(options), "runtime", "dsh-loopx-plugin"));
}
/** Resolve the exact CLI surface shared by bootstrap, Driver, and GoalBar. */
async function resolvePluginLoopXCommand(options = {}) {
	const launcherPath = join(pluginRuntimeDir(options), MANAGED_LAUNCHER_NAME);
	const env = options.pythonBin === void 0 ? options.env : {
		...options.env ?? process.env,
		PYTHON_BIN: options.pythonBin
	};
	const hasManagedLauncher = await stat(launcherPath).then((value) => value.isFile(), () => false);
	return resolveLoopXCommand({
		...options,
		runner: options.runner ?? runFile,
		env,
		managedLauncher: hasManagedLauncher ? {
			path: launcherPath,
			pythonBins: pluginPythonCandidates(options)
		} : void 0
	});
}
//#endregion
export { pluginPythonCandidates as a, LoopXCliError as c, runJsonCommand as d, runJsonMutationCommand as f, pluginAgentsHome as i, resolveLoopXCommand as l, MANAGED_SITE_PACKAGES_NAME as n, pluginRuntimeDir as o, configuredPluginPython as r, resolvePluginLoopXCommand as s, MANAGED_LAUNCHER_NAME as t, runFile as u };
