"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCloudTasksError = exports.CloudTasksError = exports.CloudTasksErrorCode = void 0;
var CloudTasksErrorCode;
(function (CloudTasksErrorCode) {
    CloudTasksErrorCode["HTTP"] = "HTTP";
    CloudTasksErrorCode["IO"] = "IO";
    CloudTasksErrorCode["UNIMPLEMENTED"] = "UNIMPLEMENTED";
    CloudTasksErrorCode["MESSAGE"] = "MESSAGE";
})(CloudTasksErrorCode || (exports.CloudTasksErrorCode = CloudTasksErrorCode = {}));
class CloudTasksError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'CloudTasksError';
    }
}
exports.CloudTasksError = CloudTasksError;
function extractMessage(err) {
    if (typeof err === 'string')
        return err;
    if (err instanceof Error)
        return err.message;
    if (typeof err === 'object' && err && 'message' in err) {
        const m = err.message;
        if (typeof m === 'string')
            return m;
    }
    return 'Cloud tasks error';
}
function extractCode(err, fallback) {
    const values = Object.values(CloudTasksErrorCode);
    if (typeof err === 'object' && err && 'code' in err) {
        const c = err.code;
        if (typeof c === 'string' && values.includes(c))
            return c;
    }
    return fallback;
}
function toCloudTasksError(err, fallbackCode = CloudTasksErrorCode.IO) {
    if (err instanceof CloudTasksError)
        return err;
    const message = extractMessage(err);
    const code = extractCode(err, fallbackCode);
    return new CloudTasksError(message, code);
}
exports.toCloudTasksError = toCloudTasksError;
