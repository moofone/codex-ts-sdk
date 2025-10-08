"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodexClient = void 0;
const events_1 = require("events");
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const submissions_1 = require("../internal/submissions");
const StatusStore_1 = require("../internal/StatusStore");
const nativeModule_1 = require("../internal/nativeModule");
const AsyncEventQueue_1 = require("../internal/AsyncEventQueue");
const CodexError_1 = require("../errors/CodexError");
const logger_1 = require("../utils/logger");
const retry_1 = require("../utils/retry");
const models_1 = require("../utils/models");
const path_1 = require("../utils/path");
const EVENT_STREAM_CLOSED = 'eventStreamClosed';
const DEFAULT_MODEL = 'gpt-5-codex';
const DEFAULT_SUMMARY = 'auto';
const DEFAULT_APPROVAL_POLICY = 'on-request';
const DEFAULT_SANDBOX_POLICY = {
    mode: 'workspace-write',
    network_access: false,
    exclude_tmpdir_env_var: false,
    exclude_slash_tmp: false,
};
const VERSION_PATTERN = /\d+\.\d+\.\d+/;
const APPROVAL_POLICY_VALUES = ['untrusted', 'on-failure', 'on-request', 'never'];
const REASONING_EFFORT_VALUES = ['minimal', 'low', 'medium', 'high'];
const REASONING_SUMMARY_VALUES = ['auto', 'concise', 'detailed', 'none'];
class CodexClient extends events_1.EventEmitter {
    config;
    native;
    session;
    requestCounter = 0;
    eventLoop;
    abortEventLoop = false;
    logger;
    plugins;
    pluginsInitialized = false;
    statusStore = new StatusStore_1.StatusStore();
    skipVersionCheck;
    constructor(config = {}) {
        super();
        this.config = config;
        this.logger = config.logger ?? {};
        this.plugins = [...(config.plugins ?? [])];
        this.skipVersionCheck = config.skipVersionCheck ?? process.env.CODEX_SKIP_VERSION_CHECK === '1';
        if (!this.skipVersionCheck) {
            this.warnOnVersionMismatch();
        }
    }
    registerPlugin(plugin) {
        this.plugins.push(plugin);
        if (this.pluginsInitialized && plugin.initialize) {
            const result = plugin.initialize({ client: this, logger: this.logger });
            if (result) {
                Promise.resolve(result).catch((error) => {
                    (0, logger_1.log)(this.logger, 'warn', 'Plugin initialization failed', {
                        plugin: plugin.name,
                        error: error instanceof Error ? error.message : String(error),
                    });
                });
            }
        }
    }
    warnOnVersionMismatch() {
        if (this.skipVersionCheck) {
            return;
        }
        try {
            const nativeVersion = resolveNativeVersion(this.config);
            if (!nativeVersion) {
                (0, logger_1.log)(this.logger, 'debug', 'Unable to determine native binding version');
                return;
            }
            (0, logger_1.log)(this.logger, 'debug', 'Codex native version detected', {
                nativeVersion,
            });
        }
        catch (error) {
            (0, logger_1.log)(this.logger, 'warn', 'Failed to validate codex versions', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    async connect() {
        if (this.native) {
            return;
        }
        const attempt = async () => {
            let module;
            try {
                module = (0, nativeModule_1.loadNativeModule)({
                    modulePath: this.config.nativeModulePath,
                    logger: this.logger,
                });
            }
            catch (error) {
                throw this.wrapConnectionError('Failed to load Codex native module', error);
            }
            const ctor = module.NativeCodex;
            const codexHome = this.resolveCodexHome();
            try {
                this.native = new ctor(codexHome ? { codexHome } : undefined);
            }
            catch (error) {
                throw this.wrapConnectionError('Failed to initialise Codex native bindings', error, codexHome);
            }
            await this.initializePlugins();
            this.emit('connected');
        };
        try {
            await (0, retry_1.withRetry)(attempt, this.config.retryPolicy, this.logger, 'connect');
        }
        catch (error) {
            this.native = undefined;
            if (error instanceof CodexError_1.CodexError) {
                throw error;
            }
            throw this.wrapConnectionError('Codex connection failed', error);
        }
    }
    async createConversation(options = {}) {
        if (this.session) {
            await this.closeSession();
        }
        await this.connect();
        if (!this.native) {
            throw new CodexError_1.CodexConnectionError('Native bindings not initialised');
        }
        this.statusStore.clear();
        const overrides = (0, nativeModule_1.formatOverrides)(options.overrides);
        try {
            this.session = await this.native.createConversation(overrides ? { overrides } : undefined);
        }
        catch (error) {
            throw this.wrapSessionError('Failed to create Codex conversation', error, options.overrides);
        }
        this.startEventLoop();
        return this.session.conversationId;
    }
    async sendMessage(text, options = {}) {
        const session = this.requireSession();
        const items = [
            {
                type: 'text',
                text,
            },
        ];
        for (const i of options.images ?? []) {
            items.push({ type: 'localImage', path: i });
        }
        const submission = (0, submissions_1.createUserInputSubmission)(this.generateRequestId(), items);
        await this.submit(session, submission);
    }
    async sendUserTurn(text, options = {}) {
        const session = this.requireSession();
        const items = options.items ?? [
            {
                type: 'text',
                text,
            },
        ];
        const resolved = (0, models_1.resolveModelVariant)(options.model ?? this.config.defaultModel ?? DEFAULT_MODEL, options.effort ?? this.config.defaultEffort);
        const submission = (0, submissions_1.createUserTurnSubmission)(this.generateRequestId(), {
            items,
            cwd: options.cwd ?? process.cwd(),
            approvalPolicy: options.approvalPolicy ?? this.config.approvalPolicy ?? DEFAULT_APPROVAL_POLICY,
            sandboxPolicy: options.sandboxPolicy ?? this.config.sandboxPolicy ?? DEFAULT_SANDBOX_POLICY,
            model: resolved.model,
            effort: options.effort ?? resolved.effort ?? this.config.defaultEffort,
            summary: options.summary ?? this.config.defaultSummary ?? DEFAULT_SUMMARY,
        });
        await this.submit(session, submission);
    }
    async interruptConversation() {
        const session = this.requireSession();
        const submission = (0, submissions_1.createInterruptSubmission)(this.generateRequestId());
        await this.submit(session, submission);
    }
    async respondToExecApproval(requestId, decision) {
        const session = this.requireSession();
        const submission = (0, submissions_1.createExecApprovalSubmission)(this.generateRequestId(), {
            id: requestId,
            decision,
        });
        await this.submit(session, submission);
    }
    async respondToPatchApproval(requestId, decision) {
        const session = this.requireSession();
        const submission = (0, submissions_1.createPatchApprovalSubmission)(this.generateRequestId(), {
            id: requestId,
            decision,
        });
        await this.submit(session, submission);
    }
    async overrideTurnContext(options) {
        if (!options || typeof options !== 'object') {
            throw new TypeError('overrideTurnContext requires an options object');
        }
        const hasOverride = options.cwd !== undefined ||
            options.approvalPolicy !== undefined ||
            options.sandboxPolicy !== undefined ||
            options.model !== undefined ||
            options.effort !== undefined ||
            options.summary !== undefined;
        if (!hasOverride) {
            throw new TypeError('overrideTurnContext requires at least one override property');
        }
        const normalized = {};
        if (options.cwd !== undefined) {
            if (typeof options.cwd !== 'string' || !options.cwd.trim()) {
                throw new TypeError('overrideTurnContext cwd must be a non-empty string when provided');
            }
            normalized.cwd = options.cwd.trim();
        }
        if (options.approvalPolicy !== undefined) {
            if (!isAskForApprovalValue(options.approvalPolicy)) {
                throw new TypeError('overrideTurnContext approvalPolicy must be a valid AskForApproval value');
            }
            normalized.approvalPolicy = options.approvalPolicy;
        }
        if (options.sandboxPolicy !== undefined) {
            if (!isSandboxPolicyValue(options.sandboxPolicy)) {
                throw new TypeError('overrideTurnContext sandboxPolicy must be a valid SandboxPolicy value');
            }
            normalized.sandboxPolicy = options.sandboxPolicy;
        }
        let normalizedEffort = options.effort;
        if (normalizedEffort !== undefined && normalizedEffort !== null && !isReasoningEffortValue(normalizedEffort)) {
            throw new TypeError('overrideTurnContext effort must be minimal, low, medium, high or null');
        }
        if (options.model !== undefined) {
            if (typeof options.model !== 'string' || !options.model.trim()) {
                throw new TypeError('overrideTurnContext model must be a non-empty string when provided');
            }
            const trimmedModel = options.model.trim();
            const effortForResolution = normalizedEffort !== undefined && normalizedEffort !== null ? normalizedEffort : undefined;
            const resolved = (0, models_1.resolveModelVariant)(trimmedModel, effortForResolution);
            normalized.model = resolved.model;
            if (normalizedEffort !== undefined && normalizedEffort !== null) {
                normalizedEffort = resolved.effort;
            }
        }
        if (normalizedEffort !== undefined) {
            normalized.effort = normalizedEffort;
        }
        if (options.summary !== undefined) {
            if (!isReasoningSummaryValue(options.summary)) {
                throw new TypeError('overrideTurnContext summary must be auto, concise, detailed or none');
            }
            normalized.summary = options.summary;
        }
        const session = this.requireSession();
        const submission = (0, submissions_1.createOverrideTurnContextSubmission)(this.generateRequestId(), normalized);
        await this.submit(session, submission);
    }
    async addToHistory(text) {
        if (typeof text !== 'string') {
            throw new TypeError('addToHistory text must be a string');
        }
        if (!text.trim()) {
            throw new TypeError('addToHistory text cannot be empty');
        }
        const session = this.requireSession();
        const submission = (0, submissions_1.createAddToHistorySubmission)(this.generateRequestId(), { text });
        await this.submit(session, submission);
    }
    async getHistoryEntry(options) {
        const normalized = this.normalizeGetHistoryEntryOptions(options);
        const session = this.requireSession();
        const submission = (0, submissions_1.createGetHistoryEntryRequestSubmission)(this.generateRequestId(), normalized);
        await this.submit(session, submission);
    }
    async listMcpTools() {
        const session = this.requireSession();
        const submission = (0, submissions_1.createListMcpToolsSubmission)(this.generateRequestId());
        await this.submit(session, submission);
    }
    async listCustomPrompts() {
        const session = this.requireSession();
        const submission = (0, submissions_1.createListCustomPromptsSubmission)(this.generateRequestId());
        await this.submit(session, submission);
    }
    async compact() {
        const session = this.requireSession();
        const submission = (0, submissions_1.createCompactSubmission)(this.generateRequestId());
        await this.submit(session, submission);
    }
    async review(request) {
        const reviewRequest = this.normalizeReviewRequest(request);
        const session = this.requireSession();
        const submission = (0, submissions_1.createReviewSubmission)(this.generateRequestId(), { reviewRequest });
        await this.submit(session, submission);
    }
    async getPath() {
        const session = this.requireSession();
        const submission = (0, submissions_1.createGetPathSubmission)(this.generateRequestId());
        await this.submit(session, submission);
    }
    async getStatus(options = {}) {
        const { refresh = true } = options;
        if (refresh) {
            const session = this.requireSession();
            const submission = (0, submissions_1.createStatusSubmission)(this.generateRequestId());
            await this.submit(session, submission);
        }
        return this.statusStore.getStatus();
    }
    async shutdown() {
        const session = this.requireSession();
        const submission = (0, submissions_1.createShutdownSubmission)(this.generateRequestId());
        await this.submit(session, submission);
    }
    async close() {
        await this.closeSession();
    }
    events(signal) {
        const queue = new AsyncEventQueue_1.AsyncEventQueue();
        const onEvent = (event) => queue.enqueue(event);
        const onError = (error) => {
            queue.fail(error);
            cleanup();
        };
        const onClosed = () => {
            queue.close();
            cleanup();
        };
        this.on('event', onEvent);
        this.on('error', onError);
        this.on(EVENT_STREAM_CLOSED, onClosed);
        let cleaned = false;
        const cleanup = () => {
            if (cleaned) {
                return;
            }
            cleaned = true;
            this.off('event', onEvent);
            this.off('error', onError);
            this.off(EVENT_STREAM_CLOSED, onClosed);
            if (signal) {
                signal.removeEventListener('abort', abortHandler);
            }
        };
        const abortHandler = () => {
            queue.close();
            cleanup();
        };
        if (signal) {
            if (signal.aborted) {
                queue.close();
                cleanup();
            }
            else {
                signal.addEventListener('abort', abortHandler);
            }
        }
        return {
            [Symbol.asyncIterator]: () => ({
                next: () => queue.next(),
                return: () => {
                    queue.close();
                    cleanup();
                    return Promise.resolve({ value: undefined, done: true });
                },
                throw: (err) => {
                    cleanup();
                    const normalized = err instanceof Error ? err : new Error('Iterator aborted', { cause: err });
                    return Promise.reject(normalized);
                },
            }),
        };
    }
    async testModelAvailability(model) {
        try {
            await this.createConversation({
                overrides: { model },
            });
            await this.closeSession();
            return true;
        }
        catch {
            return false;
        }
    }
    normalizeGetHistoryEntryOptions(options) {
        if (!options || typeof options !== 'object') {
            throw new TypeError('getHistoryEntry options must be an object');
        }
        const { offset, logId } = options;
        if (!Number.isSafeInteger(offset) || offset < 0) {
            throw new TypeError('getHistoryEntry offset must be a non-negative integer');
        }
        if (!Number.isSafeInteger(logId) || logId < 0) {
            throw new TypeError('getHistoryEntry logId must be a non-negative integer');
        }
        return { offset, logId };
    }
    normalizeReviewRequest(request) {
        if (!request || typeof request !== 'object') {
            throw new TypeError('review request must be an object');
        }
        const { prompt } = request;
        if (typeof prompt !== 'string' || !prompt.trim()) {
            throw new TypeError('review prompt must be a non-empty string');
        }
        let hintSource;
        if ('user_facing_hint' in request) {
            hintSource = request.user_facing_hint;
        }
        else if ('userFacingHint' in request) {
            hintSource = request.userFacingHint;
        }
        if (typeof hintSource !== 'string' || !hintSource.trim()) {
            throw new TypeError('review userFacingHint must be a non-empty string');
        }
        return {
            prompt: prompt.trim(),
            user_facing_hint: hintSource.trim(),
        };
    }
    async submit(session, submission) {
        const processed = await this.applyBeforeSubmit(submission);
        try {
            await session.submit(JSON.stringify(processed));
        }
        catch (error) {
            throw this.wrapSessionError('Failed to submit request to Codex session', error, processed);
        }
    }
    async applyBeforeSubmit(submission) {
        let current = submission;
        for (const plugin of this.plugins) {
            if (!plugin.beforeSubmit) {
                continue;
            }
            try {
                const next = await plugin.beforeSubmit(current);
                if (next) {
                    current = next;
                }
            }
            catch (error) {
                (0, logger_1.log)(this.logger, 'warn', 'Plugin beforeSubmit hook failed', {
                    plugin: plugin.name,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        return current;
    }
    async dispatchAfterEvent(event) {
        for (const plugin of this.plugins) {
            if (!plugin.afterEvent) {
                continue;
            }
            try {
                await plugin.afterEvent(event);
            }
            catch (error) {
                (0, logger_1.log)(this.logger, 'warn', 'Plugin afterEvent hook failed', {
                    plugin: plugin.name,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    }
    isGetHistoryEntryResponseEventMessage(msg) {
        if (msg.type !== 'get_history_entry_response') {
            return false;
        }
        const candidate = msg;
        return typeof candidate.offset === 'number' && typeof candidate.log_id === 'number';
    }
    isMcpListToolsResponseEventMessage(msg) {
        if (msg.type !== 'mcp_list_tools_response') {
            return false;
        }
        const candidate = msg;
        return typeof candidate.tools === 'object' && candidate.tools !== null;
    }
    isListCustomPromptsResponseEventMessage(msg) {
        if (msg.type !== 'list_custom_prompts_response') {
            return false;
        }
        const candidate = msg;
        if (!Array.isArray(candidate.custom_prompts)) {
            return false;
        }
        return candidate.custom_prompts.every((prompt) => {
            if (!prompt || typeof prompt !== 'object') {
                return false;
            }
            const entry = prompt;
            return (typeof entry.name === 'string' &&
                typeof entry.path === 'string' &&
                typeof entry.content === 'string');
        });
    }
    isEnteredReviewModeEventMessage(msg) {
        if (msg.type !== 'entered_review_mode') {
            return false;
        }
        const candidate = msg;
        return typeof candidate.prompt === 'string' && typeof candidate.user_facing_hint === 'string';
    }
    async dispatchOnError(error) {
        for (const plugin of this.plugins) {
            if (!plugin.onError) {
                continue;
            }
            try {
                await plugin.onError(error);
            }
            catch (hookError) {
                (0, logger_1.log)(this.logger, 'warn', 'Plugin onError hook failed', {
                    plugin: plugin.name,
                    error: hookError instanceof Error ? hookError.message : String(hookError),
                });
            }
        }
    }
    startEventLoop() {
        if (!this.session || this.eventLoop) {
            return;
        }
        const session = this.session;
        this.abortEventLoop = false;
        this.eventLoop = (async () => {
            try {
                while (!this.abortEventLoop) {
                    let payload;
                    try {
                        payload = await session.nextEvent();
                    }
                    catch (error) {
                        this.emit('error', error);
                        await this.dispatchOnError(error);
                        break;
                    }
                    if (!payload) {
                        break;
                    }
                    let event;
                    try {
                        event = JSON.parse(payload);
                    }
                    catch (error) {
                        (0, logger_1.log)(this.logger, 'warn', 'Failed to parse Codex event payload', {
                            payload,
                            error: error instanceof Error ? error.message : String(error),
                        });
                        continue;
                    }
                    this.emit('event', event);
                    await this.dispatchAfterEvent(event);
                    this.routeEvent(event);
                }
            }
            finally {
                this.eventLoop = undefined;
                this.emit(EVENT_STREAM_CLOSED);
            }
        })();
    }
    routeEvent(event) {
        switch (event.msg.type) {
            case 'session_configured':
                this.statusStore.updateSessionInfo(event.msg);
                this.emit('sessionConfigured', event.msg);
                break;
            case 'session.created':
                this.emit('sessionCreated', event.msg);
                break;
            case 'turn.started':
                this.emit('turnStarted', event.msg);
                break;
            case 'turn.completed':
                this.emit('turnCompleted', event.msg);
                break;
            case 'token_count':
                this.statusStore.updateFromTokenCountEvent(event.msg);
                this.emit('tokenCount', event.msg);
                break;
            case 'task_started':
                this.statusStore.updateFromTaskStartedEvent(event.msg);
                this.emit('taskStarted', event.msg);
                break;
            case 'task_complete':
                this.statusStore.updateFromTaskCompleteEvent(event.msg);
                this.emit('taskComplete', event.msg);
                break;
            case 'exec_approval_request':
                this.emit('execCommandApproval', event.msg);
                break;
            case 'apply_patch_approval_request':
                this.emit('applyPatchApproval', event.msg);
                break;
            case 'notification':
                this.emit('notification', event.msg);
                break;
            case 'conversation_path':
                this.emit('conversationPath', event.msg);
                break;
            case 'shutdown_complete':
                this.emit('shutdownComplete', event.msg);
                break;
            case 'turn_context':
                this.emit('turnContext', event.msg);
                break;
            case 'get_history_entry_response':
                if (this.isGetHistoryEntryResponseEventMessage(event.msg)) {
                    this.emit('historyEntry', event.msg);
                }
                break;
            case 'mcp_list_tools_response':
                if (this.isMcpListToolsResponseEventMessage(event.msg)) {
                    this.emit('mcpTools', event.msg);
                }
                break;
            case 'list_custom_prompts_response':
                if (this.isListCustomPromptsResponseEventMessage(event.msg)) {
                    this.emit('customPrompts', event.msg);
                }
                break;
            case 'entered_review_mode':
                if (this.isEnteredReviewModeEventMessage(event.msg)) {
                    this.emit('enteredReviewMode', event.msg);
                }
                break;
            case 'exited_review_mode':
                this.emit('exitedReviewMode', event.msg);
                break;
            default:
                break;
        }
    }
    async closeSession() {
        this.abortEventLoop = true;
        const session = this.session;
        const eventLoop = this.eventLoop;
        this.session = undefined;
        this.eventLoop = undefined;
        this.statusStore.clear();
        if (session) {
            try {
                await session.close();
            }
            catch (error) {
                (0, logger_1.log)(this.logger, 'warn', 'Failed to close Codex session', {
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        if (eventLoop) {
            await Promise.race([
                eventLoop.catch(() => undefined),
                new Promise((resolve) => setTimeout(resolve, 2000)),
            ]);
        }
        else {
            this.emit(EVENT_STREAM_CLOSED);
        }
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    once(event, listener) {
        return super.once(event, listener);
    }
    off(event, listener) {
        return super.off(event, listener);
    }
    requireSession() {
        if (!this.session) {
            throw new CodexError_1.CodexSessionError('No active Codex session. Call createConversation first.');
        }
        return this.session;
    }
    async initializePlugins() {
        if (this.pluginsInitialized) {
            return;
        }
        for (const plugin of this.plugins) {
            try {
                await plugin.initialize?.({ client: this, logger: this.logger });
            }
            catch (error) {
                (0, logger_1.log)(this.logger, 'warn', 'Plugin initialization failed', {
                    plugin: plugin.name,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        this.pluginsInitialized = true;
    }
    generateRequestId() {
        this.requestCounter += 1;
        return `req_${this.requestCounter}_${Date.now()}`;
    }
    resolveCodexHome() {
        const configured = this.config.codexHome ?? process.env.CODEX_HOME;
        if (!configured) {
            return undefined;
        }
        return (0, path_1.expandHomePath)(configured);
    }
    wrapConnectionError(message, cause, codexHome) {
        return new CodexError_1.CodexConnectionError(message, {
            cause: cause instanceof Error ? cause.message : String(cause),
            codexHome: codexHome ?? this.config.codexHome ?? process.env.CODEX_HOME,
        });
    }
    wrapSessionError(message, cause, details) {
        return new CodexError_1.CodexSessionError(message, {
            cause: errorMessage(cause),
            details,
        });
    }
}
exports.CodexClient = CodexClient;
function isAskForApprovalValue(value) {
    return typeof value === 'string' && APPROVAL_POLICY_VALUES.includes(value);
}
function isReasoningEffortValue(value) {
    return typeof value === 'string' && REASONING_EFFORT_VALUES.includes(value);
}
function isReasoningSummaryValue(value) {
    return typeof value === 'string' && REASONING_SUMMARY_VALUES.includes(value);
}
function isSandboxPolicyValue(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const candidate = value;
    if (candidate.mode === 'danger-full-access' || candidate.mode === 'read-only') {
        return true;
    }
    if (candidate.mode === 'workspace-write') {
        const workspacePolicy = value;
        if (typeof workspacePolicy.network_access !== 'boolean' ||
            typeof workspacePolicy.exclude_tmpdir_env_var !== 'boolean' ||
            typeof workspacePolicy.exclude_slash_tmp !== 'boolean') {
            return false;
        }
        if (workspacePolicy.writable_roots !== undefined &&
            (!Array.isArray(workspacePolicy.writable_roots) ||
                workspacePolicy.writable_roots.some((entry) => typeof entry !== 'string'))) {
            return false;
        }
        return true;
    }
    return false;
}
function resolveNativeVersion(config) {
    const moduleVersion = detectVersionFromNativeModule(config);
    if (moduleVersion && moduleVersion !== '0.0.0') {
        return moduleVersion;
    }
    if (moduleVersion === '0.0.0') {
        throw new Error('Native module reports version 0.0.0 – rebuild codex-rs from a tagged release to embed a real version.');
    }
    const cargoVersion = detectVersionFromCargoToml(config);
    if (cargoVersion) {
        return cargoVersion;
    }
    return moduleVersion;
}
function normalizeVersion(raw) {
    const trimmed = raw.trim();
    const match = trimmed.match(VERSION_PATTERN);
    return match ? match[0] : trimmed;
}
function detectVersionFromNativeModule(config) {
    try {
        const module = (0, nativeModule_1.loadNativeModule)({
            modulePath: config.nativeModulePath,
            logger: config.logger,
        });
        const detected = typeof module.cliVersion === 'function'
            ? module.cliVersion()
            : typeof module.version === 'function'
                ? module.version()
                : undefined;
        if (typeof detected === 'string' && detected.trim()) {
            return normalizeVersion(detected);
        }
    }
    catch {
        // Best-effort only
    }
    return undefined;
}
function detectVersionFromCargoToml(config) {
    for (const manifest of gatherCargoTomlCandidates(config)) {
        try {
            if (!(0, node_fs_1.existsSync)(manifest)) {
                continue;
            }
            const contents = (0, node_fs_1.readFileSync)(manifest, 'utf8');
            const workspaceMatch = contents.match(/\[workspace\.package][^[]*version\s*=\s*"([^"]+)"/);
            if (workspaceMatch?.[1]) {
                return normalizeVersion(workspaceMatch[1]);
            }
            const packageMatch = contents.match(/\[package][^[]*name\s*=\s*"codex-cli"[^[]*version\s*=\s*"([^"]+)"/);
            if (packageMatch?.[1]) {
                return normalizeVersion(packageMatch[1]);
            }
            const genericMatch = contents.match(/\[package][^[]*version\s*=\s*"([^"]+)"/);
            if (genericMatch?.[1]) {
                return normalizeVersion(genericMatch[1]);
            }
        }
        catch {
            // ignore and try next manifest
        }
    }
    return undefined;
}
function gatherCargoTomlCandidates(config) {
    const nativeDir = config.nativeModulePath
        ? node_path_1.default.dirname(config.nativeModulePath)
        : node_path_1.default.join(process.cwd(), 'native', 'codex-napi');
    return [
        node_path_1.default.join(nativeDir, '..', 'Cargo.toml'),
        node_path_1.default.join(nativeDir, '..', 'codex-rs', 'Cargo.toml'),
    ];
}
// No additional fallbacks – the native module must expose the correct version.
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
