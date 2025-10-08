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
exports.loginWithApiKey = void 0;
const fs_1 = require("fs");
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const CodexError_1 = require("./errors/CodexError");
const path_1 = require("./utils/path");
const defaultFileSystem = {
    existsSync: fs_1.existsSync,
    writeFileSync: fs_1.writeFileSync,
};
function loginWithApiKey(apiKey, options = {}) {
    const trimmed = apiKey?.trim();
    if (!trimmed) {
        throw new CodexError_1.CodexAuthError('API key must be a non-empty string');
    }
    const { fs: fileSystemOverrides, codexHome: configuredHome } = options;
    const codexHome = resolveCodexHome(configuredHome);
    const authFile = path.join(codexHome, 'auth.json');
    const payload = {
        openai_api_key: trimmed,
        tokens: null,
        last_refresh: null,
    };
    const fileSystem = fileSystemOverrides ?? defaultFileSystem;
    try {
        if (!fileSystem.existsSync(codexHome)) {
            throw new CodexError_1.CodexAuthError(`Codex home not found at ${codexHome}`);
        }
        fileSystem.writeFileSync(authFile, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
    }
    catch (error) {
        if (error instanceof CodexError_1.CodexAuthError) {
            throw error;
        }
        throw new CodexError_1.CodexAuthError('Failed to persist API key to auth.json', {
            cause: errorMessage(error),
            authFile,
        });
    }
}
exports.loginWithApiKey = loginWithApiKey;
function resolveCodexHome(configured) {
    if (configured && configured.trim()) {
        return path.resolve((0, path_1.expandHomePath)(configured));
    }
    const envHome = process.env.CODEX_HOME;
    if (envHome && envHome.trim()) {
        return path.resolve((0, path_1.expandHomePath)(envHome));
    }
    const systemHome = os.homedir();
    /* istanbul ignore next -- Cannot mock os.homedir in ESM environment */
    if (!systemHome) {
        /* istanbul ignore next */
        throw new CodexError_1.CodexAuthError('Unable to determine home directory for Codex runtime');
    }
    return path.join(systemHome, '.codex');
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
