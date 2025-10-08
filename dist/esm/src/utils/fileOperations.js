import { readFileSync, existsSync, mkdirSync } from 'fs';
import { promises as fs } from 'fs';
import { dirname, resolve } from 'path';
import { RolloutParseError, RolloutFileError } from '../types/rollout';
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function parseSessionMetadataValue(value, filePath, lineNumber) {
    if (!isRecord(value)) {
        throw new RolloutParseError('Session metadata must be an object', filePath, lineNumber);
    }
    const { id, timestamp, cwd, originator, cliVersion, instructions } = value;
    if (typeof id !== 'string' ||
        typeof timestamp !== 'string' ||
        typeof cwd !== 'string' ||
        typeof originator !== 'string' ||
        typeof cliVersion !== 'string') {
        throw new RolloutParseError('Session metadata is missing required fields', filePath, lineNumber);
    }
    const session = {
        id,
        timestamp,
        cwd,
        originator,
        cliVersion,
    };
    if (instructions !== undefined) {
        if (typeof instructions !== 'string') {
            throw new RolloutParseError('Session instructions must be a string', filePath, lineNumber);
        }
        session.instructions = instructions;
    }
    return session;
}
function parseCodexEventValue(value, filePath, lineNumber) {
    if (!isRecord(value)) {
        throw new RolloutParseError('Event payload must be an object', filePath, lineNumber);
    }
    const { id, msg, ...rest } = value;
    if (typeof id !== 'string') {
        throw new RolloutParseError('Event payload is missing id', filePath, lineNumber);
    }
    if (!isRecord(msg) || typeof msg.type !== 'string') {
        throw new RolloutParseError('Event payload message is invalid', filePath, lineNumber);
    }
    const codexEvent = {
        id,
        msg: msg,
        ...rest,
    };
    return codexEvent;
}
function parseRolloutEventEntryValue(value, filePath, lineNumber) {
    if (!isRecord(value)) {
        throw new RolloutParseError('Rollout event must be an object', filePath, lineNumber);
    }
    const { timestamp, payload, metadata } = value;
    if (typeof timestamp !== 'string') {
        throw new RolloutParseError('Rollout event is missing timestamp', filePath, lineNumber);
    }
    const codexEvent = parseCodexEventValue(payload, filePath, lineNumber);
    let metadataRecord;
    if (metadata !== undefined) {
        if (!isRecord(metadata)) {
            throw new RolloutParseError('Rollout event metadata must be an object', filePath, lineNumber);
        }
        metadataRecord = metadata;
    }
    return {
        timestamp,
        payload: codexEvent,
        metadata: metadataRecord,
    };
}
/**
 * Read and parse a rollout file (JSONL or JSON format)
 */
export async function readRolloutFile(filePath) {
    try {
        const resolvedPath = resolve(filePath);
        const content = await fs.readFile(resolvedPath, 'utf-8');
        // Determine format by file extension or content
        const isJsonl = filePath.endsWith('.jsonl') || content.includes('\n{');
        if (isJsonl) {
            return parseJsonlRollout(content, resolvedPath);
        }
        else {
            return parseJsonRollout(content, resolvedPath);
        }
    }
    catch (error) {
        if (error?.code === 'ENOENT') {
            throw new RolloutFileError(`File not found: ${filePath}`, filePath, 'read');
        }
        if (error instanceof RolloutFileError || error instanceof RolloutParseError) {
            throw error;
        }
        throw new RolloutFileError(`Failed to read rollout file: ${error instanceof Error ? error.message : String(error)}`, filePath, 'read');
    }
}
/**
 * Write rollout data to a file
 */
export async function writeRolloutFile(filePath, data, format = 'jsonl', prettyPrint = false) {
    try {
        // Ensure directory exists
        const dir = dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        let content;
        if (format === 'jsonl') {
            content = formatAsJsonl(data, prettyPrint);
        }
        else {
            content = formatAsJson(data, prettyPrint);
        }
        await fs.writeFile(filePath, content, 'utf-8');
    }
    catch (error) {
        throw new RolloutFileError(`Failed to write rollout file: ${error instanceof Error ? error.message : String(error)}`, filePath, 'write');
    }
}
/**
 * Parse JSONL format rollout
 */
function parseJsonlRollout(content, filePath) {
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    if (lines.length === 0) {
        throw new RolloutParseError('Empty rollout file', filePath);
    }
    try {
        // First line should be session metadata
        const sessionContainer = JSON.parse(lines[0]);
        if (!isRecord(sessionContainer) || !('session' in sessionContainer)) {
            throw new RolloutParseError('First line must contain session metadata', filePath, 1);
        }
        const session = parseSessionMetadataValue(sessionContainer.session, filePath, 1);
        const events = [];
        // Parse remaining lines as events
        for (let i = 1; i < lines.length; i++) {
            try {
                const parsedEvent = JSON.parse(lines[i]);
                const eventEntry = parseRolloutEventEntryValue(parsedEvent, filePath, i + 1);
                events.push(eventEntry);
            }
            catch (error) {
                throw new RolloutParseError(`Invalid JSON on line ${i + 1}: ${error instanceof Error ? error.message : String(error)}`, filePath, i + 1);
            }
        }
        return { session, events };
    }
    catch (error) {
        if (error instanceof RolloutParseError) {
            throw error;
        }
        throw new RolloutParseError(`Failed to parse JSONL rollout: ${error instanceof Error ? error.message : String(error)}`, filePath);
    }
}
/**
 * Parse JSON format rollout
 */
function parseJsonRollout(content, filePath) {
    try {
        const parsed = JSON.parse(content);
        if (!isRecord(parsed)) {
            throw new RolloutParseError('Rollout file must be a JSON object', filePath);
        }
        const session = parseSessionMetadataValue(parsed.session, filePath);
        if (!Array.isArray(parsed.events)) {
            throw new RolloutParseError('Rollout events must be an array', filePath);
        }
        const events = parsed.events.map((eventValue, index) => parseRolloutEventEntryValue(eventValue, filePath, index + 1));
        return { session, events };
    }
    catch (error) {
        if (error instanceof RolloutParseError) {
            throw error;
        }
        throw new RolloutParseError(`Failed to parse JSON rollout: ${error instanceof Error ? error.message : String(error)}`, filePath);
    }
}
/**
 * Format rollout data as JSONL
 */
function formatAsJsonl(data, prettyPrint) {
    const lines = [];
    // First line: session metadata
    const sessionEntry = { session: data.session };
    lines.push(prettyPrint ? JSON.stringify(sessionEntry, null, 2) : JSON.stringify(sessionEntry));
    // Subsequent lines: events
    for (const event of data.events) {
        lines.push(prettyPrint ? JSON.stringify(event, null, 2) : JSON.stringify(event));
    }
    return lines.join('\n') + '\n';
}
/**
 * Format rollout data as JSON
 */
function formatAsJson(data, prettyPrint) {
    return prettyPrint
        ? JSON.stringify(data, null, 2) + '\n'
        : JSON.stringify(data) + '\n';
}
/**
 * Validate rollout file format
 */
export function validateRolloutFile(filePath) {
    const errors = [];
    try {
        if (!existsSync(filePath)) {
            errors.push(`File not found: ${filePath}`);
            return { isValid: false, errors };
        }
        const content = readFileSync(filePath, 'utf-8');
        if (content.trim().length === 0) {
            errors.push('File is empty');
            return { isValid: false, errors };
        }
        // Try to parse the file
        try {
            const isJsonl = filePath.endsWith('.jsonl') || content.includes('\n{');
            if (isJsonl) {
                parseJsonlRollout(content, filePath);
            }
            else {
                parseJsonRollout(content, filePath);
            }
        }
        catch (error) {
            if (error instanceof RolloutParseError) {
                errors.push(error.message);
            }
            else {
                errors.push(`Parse error: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    catch (error) {
        errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { isValid: errors.length === 0, errors };
}
/**
 * Extract session metadata from a rollout file without parsing all events
 */
export function extractSessionMetadata(filePath) {
    try {
        if (!existsSync(filePath)) {
            return null;
        }
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        if (lines.length === 0) {
            return null;
        }
        // Try first line (JSONL format)
        try {
            const firstLine = JSON.parse(lines[0]);
            if (isRecord(firstLine) && 'session' in firstLine) {
                const session = parseSessionMetadataValue(firstLine.session, filePath, 1);
                const eventCount = lines.filter(line => line.trim().length > 0).length - 1;
                return {
                    version: '1.0',
                    format: 'jsonl',
                    session,
                    createdAt: session.timestamp,
                    eventCount,
                };
            }
        }
        catch {
            // Try JSON format
            try {
                const parsed = JSON.parse(content);
                if (isRecord(parsed) && 'session' in parsed) {
                    const session = parseSessionMetadataValue(parsed.session, filePath);
                    return {
                        version: '1.0',
                        format: 'json',
                        session,
                        createdAt: session.timestamp,
                        eventCount: Array.isArray(parsed.events) ? parsed.events.length : 0,
                    };
                }
            }
            catch {
                // Ignore parse errors
            }
        }
        return null;
    }
    catch {
        return null;
    }
}
/**
 * Create a template path with variable substitution
 */
export function createTemplatedPath(template, variables) {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{${key}}`;
        result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
    }
    return result;
}
/**
 * Ensure a directory exists
 */
export function ensureDirectoryExists(dirPath) {
    if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
    }
}
//# sourceMappingURL=fileOperations.js.map