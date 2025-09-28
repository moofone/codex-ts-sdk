import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import type { RolloutData, RolloutFileHeader } from '../types/rollout';
import { RolloutParseError, RolloutFileError } from '../types/rollout';

/**
 * Read and parse a rollout file (JSONL or JSON format)
 */
export async function readRolloutFile(filePath: string): Promise<RolloutData> {
  try {
    if (!existsSync(filePath)) {
      throw new RolloutFileError(`File not found: ${filePath}`, filePath, 'read');
    }

    const content = readFileSync(filePath, 'utf-8');
    const resolvedPath = resolve(filePath);

    // Determine format by file extension or content
    const isJsonl = filePath.endsWith('.jsonl') || content.includes('\n{');

    if (isJsonl) {
      return parseJsonlRollout(content, resolvedPath);
    } else {
      return parseJsonRollout(content, resolvedPath);
    }
  } catch (error) {
    if (error instanceof RolloutFileError || error instanceof RolloutParseError) {
      throw error;
    }
    throw new RolloutFileError(
      `Failed to read rollout file: ${error instanceof Error ? error.message : String(error)}`,
      filePath,
      'read'
    );
  }
}

/**
 * Write rollout data to a file
 */
export async function writeRolloutFile(
  filePath: string,
  data: RolloutData,
  format: 'json' | 'jsonl' = 'jsonl',
  prettyPrint: boolean = false
): Promise<void> {
  try {
    // Ensure directory exists
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    let content: string;

    if (format === 'jsonl') {
      content = formatAsJsonl(data, prettyPrint);
    } else {
      content = formatAsJson(data, prettyPrint);
    }

    writeFileSync(filePath, content, 'utf-8');
  } catch (error) {
    throw new RolloutFileError(
      `Failed to write rollout file: ${error instanceof Error ? error.message : String(error)}`,
      filePath,
      'write'
    );
  }
}

/**
 * Parse JSONL format rollout
 */
function parseJsonlRollout(content: string, filePath: string): RolloutData {
  const lines = content.split('\n').filter(line => line.trim().length > 0);

  if (lines.length === 0) {
    throw new RolloutParseError('Empty rollout file', filePath);
  }

  try {
    // First line should be session metadata
    const sessionLine = JSON.parse(lines[0]);

    if (!sessionLine.session) {
      throw new RolloutParseError('First line must contain session metadata', filePath, 1);
    }

    const session = sessionLine.session;
    const events = [];

    // Parse remaining lines as events
    for (let i = 1; i < lines.length; i++) {
      try {
        const eventEntry = JSON.parse(lines[i]);
        events.push(eventEntry);
      } catch (error) {
        throw new RolloutParseError(
          `Invalid JSON on line ${i + 1}: ${error instanceof Error ? error.message : String(error)}`,
          filePath,
          i + 1
        );
      }
    }

    return { session, events };
  } catch (error) {
    if (error instanceof RolloutParseError) {
      throw error;
    }
    throw new RolloutParseError(
      `Failed to parse JSONL rollout: ${error instanceof Error ? error.message : String(error)}`,
      filePath
    );
  }
}

/**
 * Parse JSON format rollout
 */
function parseJsonRollout(content: string, filePath: string): RolloutData {
  try {
    const parsed = JSON.parse(content);

    if (!parsed.session || !parsed.events) {
      throw new RolloutParseError('JSON rollout must have session and events properties', filePath);
    }

    return parsed as RolloutData;
  } catch (error) {
    if (error instanceof RolloutParseError) {
      throw error;
    }
    throw new RolloutParseError(
      `Failed to parse JSON rollout: ${error instanceof Error ? error.message : String(error)}`,
      filePath
    );
  }
}

/**
 * Format rollout data as JSONL
 */
function formatAsJsonl(data: RolloutData, prettyPrint: boolean): string {
  const lines: string[] = [];

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
function formatAsJson(data: RolloutData, prettyPrint: boolean): string {
  return prettyPrint
    ? JSON.stringify(data, null, 2) + '\n'
    : JSON.stringify(data) + '\n';
}

/**
 * Validate rollout file format
 */
export function validateRolloutFile(filePath: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

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
      readRolloutFile(filePath);
    } catch (error) {
      if (error instanceof RolloutParseError) {
        errors.push(error.message);
      } else {
        errors.push(`Parse error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Extract session metadata from a rollout file without parsing all events
 */
export function extractSessionMetadata(filePath: string): RolloutFileHeader | null {
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
      if (firstLine.session) {
        const eventCount = lines.filter(line => line.trim().length > 0).length - 1;
        return {
          version: '1.0',
          format: 'jsonl',
          session: firstLine.session,
          createdAt: firstLine.session.timestamp || new Date().toISOString(),
          eventCount,
        };
      }
    } catch {
      // Try JSON format
      try {
        const parsed = JSON.parse(content);
        if (parsed.session) {
          return {
            version: '1.0',
            format: 'json',
            session: parsed.session,
            createdAt: parsed.session.timestamp || new Date().toISOString(),
            eventCount: parsed.events?.length || 0,
          };
        }
      } catch {
        // Ignore parse errors
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Create a template path with variable substitution
 */
export function createTemplatedPath(
  template: string,
  variables: Record<string, string>
): string {
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
export function ensureDirectoryExists(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}