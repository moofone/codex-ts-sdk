"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = exports.resolveLogger = void 0;
const noop = () => undefined;
const NOOP_LOGGER = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
};
function resolveLogger(logger) {
    if (!logger) {
        return NOOP_LOGGER;
    }
    return {
        debug: logger.debug ?? noop,
        info: logger.info ?? noop,
        warn: logger.warn ?? noop,
        error: logger.error ?? noop,
    };
}
exports.resolveLogger = resolveLogger;
function log(logger, level, message, context) {
    const resolved = resolveLogger(logger);
    switch (level) {
        case 'debug':
            resolved.debug(message, context);
            break;
        case 'info':
            resolved.info(message, context);
            break;
        case 'warn':
            resolved.warn(message, context);
            break;
        case 'error':
            resolved.error(message, context);
            break;
        default:
            break;
    }
}
exports.log = log;
