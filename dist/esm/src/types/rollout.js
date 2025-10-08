/**
 * Error thrown during rollout parsing
 */
export class RolloutParseError extends Error {
    filePath;
    lineNumber;
    constructor(message, filePath, lineNumber) {
        super(message);
        this.name = 'RolloutParseError';
        this.filePath = filePath;
        this.lineNumber = lineNumber;
    }
}
/**
 * Error thrown during rollout file operations
 */
export class RolloutFileError extends Error {
    filePath;
    operation;
    constructor(message, filePath, operation) {
        super(message);
        this.name = 'RolloutFileError';
        this.filePath = filePath;
        this.operation = operation;
    }
}
/**
 * Error thrown during rollout serialization
 */
export class RolloutSerializationError extends Error {
    data;
    constructor(message, data) {
        super(message);
        this.name = 'RolloutSerializationError';
        this.data = data;
    }
}
//# sourceMappingURL=rollout.js.map