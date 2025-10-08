"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toNativeApplyParams = exports.toNativeConfig = exports.getCloudBindings = void 0;
const errors_1 = require("../errors");
function unimplemented() {
    return Promise.reject(new errors_1.CloudTasksError('Cloud tasks are not available in the current native binding. Upgrade codex-rs to rust-v0.45.0+ and rebuild.', errors_1.CloudTasksErrorCode.UNIMPLEMENTED));
}
function getCloudBindings() {
    const native = tryLoadNativeCloudModule();
    // Temporary diagnostic to confirm exported keys
    if (!native) {
        // Default implementation: throw UNIMPLEMENTED. Tests will mock this module.
        return {
            list: () => unimplemented(),
            listEnvironments: () => unimplemented(),
            create: () => unimplemented(),
            getDiff: () => unimplemented(),
            getMessages: () => unimplemented(),
            getText: () => unimplemented(),
            apply: () => unimplemented(),
            listAttempts: () => unimplemented(),
            close: () => { },
        };
    }
    const pick = (camel, snake) => {
        const obj = native;
        const candidate = (obj?.[camel] ?? obj?.[snake]);
        return typeof candidate === 'function' ? candidate : undefined;
    };
    const cloudTasksList = pick('cloudTasksList', 'cloud_tasks_list');
    const cloudTasksListEnvironments = pick('cloudTasksListEnvironments', 'cloud_tasks_list_environments');
    const cloudTasksCreate = pick('cloudTasksCreate', 'cloud_tasks_create');
    const cloudTasksGetDiff = pick('cloudTasksGetDiff', 'cloud_tasks_get_diff');
    const cloudTasksGetMessages = pick('cloudTasksGetMessages', 'cloud_tasks_get_messages');
    const cloudTasksGetText = pick('cloudTasksGetText', 'cloud_tasks_get_text');
    const cloudTasksApply = pick('cloudTasksApply', 'cloud_tasks_apply');
    const cloudTasksListAttempts = pick('cloudTasksListAttempts', 'cloud_tasks_list_attempts');
    if (!cloudTasksList)
        return { list: () => unimplemented(), listEnvironments: () => unimplemented(), create: () => unimplemented(), getDiff: () => unimplemented(), getMessages: () => unimplemented(), getText: () => unimplemented(), apply: () => unimplemented(), listAttempts: () => unimplemented(), close: () => { } };
    if (!cloudTasksCreate)
        return { list: () => unimplemented(), listEnvironments: () => unimplemented(), create: () => unimplemented(), getDiff: () => unimplemented(), getMessages: () => unimplemented(), getText: () => unimplemented(), apply: () => unimplemented(), listAttempts: () => unimplemented(), close: () => { } };
    if (!cloudTasksGetDiff)
        return { list: () => unimplemented(), listEnvironments: () => unimplemented(), create: () => unimplemented(), getDiff: () => unimplemented(), getMessages: () => unimplemented(), getText: () => unimplemented(), apply: () => unimplemented(), listAttempts: () => unimplemented(), close: () => { } };
    if (!cloudTasksGetMessages)
        return { list: () => unimplemented(), listEnvironments: () => unimplemented(), create: () => unimplemented(), getDiff: () => unimplemented(), getMessages: () => unimplemented(), getText: () => unimplemented(), apply: () => unimplemented(), listAttempts: () => unimplemented(), close: () => { } };
    if (!cloudTasksGetText)
        return { list: () => unimplemented(), listEnvironments: () => unimplemented(), create: () => unimplemented(), getDiff: () => unimplemented(), getMessages: () => unimplemented(), getText: () => unimplemented(), apply: () => unimplemented(), listAttempts: () => unimplemented(), close: () => { } };
    if (!cloudTasksApply)
        return { list: () => unimplemented(), listEnvironments: () => unimplemented(), create: () => unimplemented(), getDiff: () => unimplemented(), getMessages: () => unimplemented(), getText: () => unimplemented(), apply: () => unimplemented(), listAttempts: () => unimplemented(), close: () => { } };
    if (!cloudTasksListAttempts)
        return { list: () => unimplemented(), listEnvironments: () => unimplemented(), create: () => unimplemented(), getDiff: () => unimplemented(), getMessages: () => unimplemented(), getText: () => unimplemented(), apply: () => unimplemented(), listAttempts: () => unimplemented(), close: () => { } };
    return {
        async list(config, environmentId) {
            return await cloudTasksList(config, environmentId);
        },
        async listEnvironments(config) {
            if (cloudTasksListEnvironments) {
                return await cloudTasksListEnvironments(config);
            }
            return unimplemented();
        },
        async create(config, options) {
            // Native returns string id
            const id = await cloudTasksCreate(config, options);
            return { id };
        },
        async getDiff(config, taskId) {
            return await cloudTasksGetDiff(config, taskId);
        },
        async getMessages(config, taskId) {
            return await cloudTasksGetMessages(config, taskId);
        },
        async getText(config, taskId) {
            return await cloudTasksGetText(config, taskId);
        },
        async apply(config, taskId, diffOverride, preflight) {
            return await cloudTasksApply(config, taskId, diffOverride, !!preflight);
        },
        async listAttempts(config, taskId, turnId) {
            return await cloudTasksListAttempts(config, taskId, turnId);
        },
        close: () => { },
    };
}
exports.getCloudBindings = getCloudBindings;
// Lightweight native loader — mirrors the layout used by internal/nativeModule.ts
const module_1 = require("module");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const requireFromCwd = (0, module_1.createRequire)(path.join(process.cwd(), 'package.json'));
function resolveProjectRoot() {
    let currentDir = process.cwd();
    const visited = new Set();
    while (!visited.has(currentDir)) {
        visited.add(currentDir);
        const pkg = path.join(currentDir, 'package.json');
        const nativeDir = path.join(currentDir, 'native', 'codex-napi');
        if (fs.existsSync(pkg) && fs.existsSync(nativeDir)) {
            return currentDir;
        }
        const parent = path.dirname(currentDir);
        if (parent === currentDir)
            break;
        currentDir = parent;
    }
    const cwdNative = path.join(process.cwd(), 'native', 'codex-napi');
    if (fs.existsSync(cwdNative)) {
        return process.cwd();
    }
    return path.resolve(currentDir, '..');
}
function tryLoadNativeCloudModule() {
    if (process.env.CODEX_SKIP_NATIVE === '1') {
        return undefined;
    }
    try {
        const projectRoot = resolveProjectRoot();
        const nativeRoot = path.join(projectRoot, 'native', 'codex-napi');
        const candidates = [
            path.join(nativeRoot, 'index.js'),
            path.join(nativeRoot, 'index.node'),
            path.join(nativeRoot, 'prebuilt', `${process.platform}-${process.arch}`, 'index.js'),
            path.join(nativeRoot, 'prebuilt', `${process.platform}-${process.arch}`, 'index.node'),
        ];
        for (const file of candidates) {
            if (fs.existsSync(file)) {
                try {
                    return requireFromCwd(file);
                }
                catch {
                    // try next candidate
                }
            }
        }
    }
    catch {
        // Ignore
    }
    return undefined;
}
function toNativeConfig(options) {
    // Include both snake_case and camelCase keys to satisfy napi object mapping
    // which may expect camelCase properties (e.g., baseUrl) for #[napi(object)].
    const cfg = {
        base_url: options.baseUrl,
        baseUrl: options.baseUrl,
        bearer_token: options.bearerToken,
        bearerToken: options.bearerToken,
        chatgpt_account_id: options.chatGptAccountId,
        chatGptAccountId: options.chatGptAccountId,
        user_agent: options.userAgent,
        userAgent: options.userAgent,
        mock: options.mock,
        codex_home: options.codexHome || process.env.CODEX_HOME,
        codexHome: options.codexHome || process.env.CODEX_HOME,
    };
    return cfg;
}
exports.toNativeConfig = toNativeConfig;
function toNativeApplyParams(taskId, options) {
    return {
        taskId,
        diffOverride: options?.diffOverride,
        preflight: options?.dryRun === true,
    };
}
exports.toNativeApplyParams = toNativeApplyParams;
