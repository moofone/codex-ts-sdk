export var CloudTasksErrorCode;
(function (CloudTasksErrorCode) {
    CloudTasksErrorCode["HTTP"] = "HTTP";
    CloudTasksErrorCode["IO"] = "IO";
    CloudTasksErrorCode["UNIMPLEMENTED"] = "UNIMPLEMENTED";
    CloudTasksErrorCode["MESSAGE"] = "MESSAGE";
})(CloudTasksErrorCode || (CloudTasksErrorCode = {}));
export class CloudTasksError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'CloudTasksError';
    }
}
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
export function toCloudTasksError(err, fallbackCode = CloudTasksErrorCode.IO) {
    if (err instanceof CloudTasksError)
        return err;
    const message = extractMessage(err);
    const code = extractCode(err, fallbackCode);
    return new CloudTasksError(message, code);
}
//# sourceMappingURL=errors.js.map