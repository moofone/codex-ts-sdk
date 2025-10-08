export declare enum CloudTasksErrorCode {
    HTTP = "HTTP",
    IO = "IO",
    UNIMPLEMENTED = "UNIMPLEMENTED",
    MESSAGE = "MESSAGE"
}
export declare class CloudTasksError extends Error {
    readonly code: CloudTasksErrorCode;
    constructor(message: string, code: CloudTasksErrorCode);
}
export declare function toCloudTasksError(err: unknown, fallbackCode?: CloudTasksErrorCode): CloudTasksError;
