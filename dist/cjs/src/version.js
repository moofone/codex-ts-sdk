"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCodexCliVersion = void 0;
const node_path_1 = __importDefault(require("node:path"));
const nativeModule_1 = require("./internal/nativeModule");
const SEMVER_PATTERN = /\d+\.\d+\.\d+/;
function normalizeVersion(raw) {
    const trimmed = raw.trim();
    const match = trimmed.match(SEMVER_PATTERN);
    /* istanbul ignore next -- Fallback for non-semver versions */
    return match ? match[0] : trimmed;
}
function getCodexCliVersion(options) {
    const attempt = (opts) => {
        const module = (0, nativeModule_1.loadNativeModule)(opts);
        if (typeof module.cliVersion !== 'function') {
            throw new Error('Native module does not expose cliVersion(); rebuild codex-rs and the N-API binding.');
        }
        return normalizeVersion(module.cliVersion());
    };
    try {
        return attempt(options);
    }
    catch (primaryError) {
        if (options?.modulePath) {
            throw primaryError;
        }
        const fallbackPath = node_path_1.default.join(process.cwd(), 'native', 'codex-napi', 'index.js');
        return attempt({ ...options, modulePath: fallbackPath });
    }
}
exports.getCodexCliVersion = getCodexCliVersion;
