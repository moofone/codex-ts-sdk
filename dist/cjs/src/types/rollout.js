"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RolloutSerializationError = exports.RolloutFileError = exports.RolloutParseError = void 0;
/**
 * Error thrown during rollout parsing
 */
class RolloutParseError extends Error {
    filePath;
    lineNumber;
    constructor(message, filePath, lineNumber) {
        super(message);
        this.name = 'RolloutParseError';
        this.filePath = filePath;
        this.lineNumber = lineNumber;
    }
}
exports.RolloutParseError = RolloutParseError;
/**
 * Error thrown during rollout file operations
 */
class RolloutFileError extends Error {
    filePath;
    operation;
    constructor(message, filePath, operation) {
        super(message);
        this.name = 'RolloutFileError';
        this.filePath = filePath;
        this.operation = operation;
    }
}
exports.RolloutFileError = RolloutFileError;
/**
 * Error thrown during rollout serialization
 */
class RolloutSerializationError extends Error {
    data;
    constructor(message, data) {
        super(message);
        this.name = 'RolloutSerializationError';
        this.data = data;
    }
}
exports.RolloutSerializationError = RolloutSerializationError;
