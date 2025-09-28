import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs, readFileSync, existsSync, mkdirSync } from 'fs';
import {
  readRolloutFile,
  writeRolloutFile,
  validateRolloutFile,
  extractSessionMetadata,
  createTemplatedPath,
  ensureDirectoryExists
} from '../../src/utils/fileOperations';
import { RolloutParseError, RolloutFileError } from '../../src/types/rollout';
import type { RolloutData } from '../../src/types/rollout';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn()
  }
}));

describe('fileOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSessionData = {
    id: 'test-session-id',
    timestamp: '2024-01-01T00:00:00Z',
    cwd: '/test/dir',
    originator: 'test-originator',
    cliVersion: '1.0.0',
    instructions: 'test instructions'
  };

  const mockEvent = {
    timestamp: '2024-01-01T00:01:00Z',
    payload: {
      id: 'event-id',
      msg: { type: 'test-event', data: 'test-data' }
    },
    metadata: { key: 'value' }
  };

  const mockRolloutData: RolloutData = {
    session: mockSessionData,
    events: [mockEvent]
  };

  describe('readRolloutFile', () => {
    it('should read and parse JSONL format', async () => {
      const jsonlContent = `{"session":${JSON.stringify(mockSessionData)}}
${JSON.stringify(mockEvent)}`;

      vi.mocked(fs.readFile).mockResolvedValue(jsonlContent);

      const result = await readRolloutFile('test.jsonl');

      expect(result.session).toEqual(mockSessionData);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].timestamp).toBe(mockEvent.timestamp);
    });

    it('should read and parse JSON format', async () => {
      const jsonContent = JSON.stringify(mockRolloutData);

      vi.mocked(fs.readFile).mockResolvedValue(jsonContent);

      const result = await readRolloutFile('test.json');

      expect(result.session).toEqual(mockSessionData);
      expect(result.events).toHaveLength(1);
    });

    it('should detect JSONL format by content', async () => {
      const jsonlContent = `{"session":${JSON.stringify(mockSessionData)}}
{"timestamp":"2024-01-01T00:01:00Z","payload":{"id":"event-id","msg":{"type":"test-event"}}}`;

      vi.mocked(fs.readFile).mockResolvedValue(jsonlContent);

      const result = await readRolloutFile('test.txt');

      expect(result.session).toEqual(mockSessionData);
      expect(result.events).toHaveLength(1);
    });

    it('should throw RolloutFileError for non-existent file', async () => {
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      await expect(readRolloutFile('nonexistent.jsonl')).rejects.toThrow(RolloutFileError);
      await expect(readRolloutFile('nonexistent.jsonl')).rejects.toThrow('File not found');
    });

    it('should throw RolloutParseError for invalid JSON', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('invalid json');

      await expect(readRolloutFile('test.json')).rejects.toThrow(RolloutParseError);
    });

    it('should throw RolloutParseError for empty file', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('');

      await expect(readRolloutFile('test.jsonl')).rejects.toThrow(RolloutParseError);
      await expect(readRolloutFile('test.jsonl')).rejects.toThrow('Empty rollout file');
    });

    it('should handle missing session in JSONL format', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('{"not_session": {}}');

      await expect(readRolloutFile('test.jsonl')).rejects.toThrow(RolloutParseError);
      await expect(readRolloutFile('test.jsonl')).rejects.toThrow('First line must contain session metadata');
    });

    it('should handle invalid event format', async () => {
      const jsonlContent = `{"session":${JSON.stringify(mockSessionData)}}
{"invalid": "event"}`;

      vi.mocked(fs.readFile).mockResolvedValue(jsonlContent);

      await expect(readRolloutFile('test.jsonl')).rejects.toThrow(RolloutParseError);
    });
  });

  describe('writeRolloutFile', () => {
    it('should write JSONL format', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await writeRolloutFile('test.jsonl', mockRolloutData, 'jsonl');

      expect(fs.mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        'test.jsonl',
        expect.stringContaining('{"session":'),
        'utf-8'
      );
    });

    it('should write JSON format', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await writeRolloutFile('test.json', mockRolloutData, 'json');

      expect(fs.writeFile).toHaveBeenCalledWith(
        'test.json',
        expect.stringContaining('"session":'),
        'utf-8'
      );
    });

    it('should write pretty printed JSON', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await writeRolloutFile('test.json', mockRolloutData, 'json', true);

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      expect(writeCall[1]).toContain('\n  '); // Indentation
    });

    it('should write pretty printed JSONL', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await writeRolloutFile('test.jsonl', mockRolloutData, 'jsonl', true);

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      expect(writeCall[1]).toContain('\n  '); // Indentation in each line
    });

    it('should create directory if it does not exist', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await writeRolloutFile('/some/deep/path/test.jsonl', mockRolloutData);

      expect(fs.mkdir).toHaveBeenCalledWith('/some/deep/path', { recursive: true });
    });

    it('should throw RolloutFileError on write failure', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Write failed'));

      await expect(writeRolloutFile('test.jsonl', mockRolloutData)).rejects.toThrow(RolloutFileError);
      await expect(writeRolloutFile('test.jsonl', mockRolloutData)).rejects.toThrow('Failed to write rollout file');
    });
  });

  describe('validateRolloutFile', () => {
    it('should validate valid JSONL file', () => {
      const jsonlContent = `{"session":${JSON.stringify(mockSessionData)}}
${JSON.stringify(mockEvent)}`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(jsonlContent);

      const result = validateRolloutFile('test.jsonl');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate valid JSON file', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockRolloutData));

      const result = validateRolloutFile('test.json');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error for non-existent file', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = validateRolloutFile('nonexistent.jsonl');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File not found: nonexistent.jsonl');
    });

    it('should return error for empty file', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('');

      const result = validateRolloutFile('empty.jsonl');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File is empty');
    });

    it('should return error for invalid JSON', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('invalid json');

      const result = validateRolloutFile('invalid.json');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return error for missing session metadata', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('{"events": []}');

      const result = validateRolloutFile('test.json');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle file read errors gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const result = validateRolloutFile('test.jsonl');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Validation error: Read error');
    });
  });

  describe('extractSessionMetadata', () => {
    it('should extract metadata from JSONL file', () => {
      const jsonlContent = `{"session":${JSON.stringify(mockSessionData)}}
${JSON.stringify(mockEvent)}
${JSON.stringify(mockEvent)}`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(jsonlContent);

      const result = extractSessionMetadata('test.jsonl');

      expect(result).not.toBeNull();
      expect(result?.session).toEqual(mockSessionData);
      expect(result?.format).toBe('jsonl');
      expect(result?.eventCount).toBe(2);
    });

    it('should extract metadata from JSON file', () => {
      const jsonData = {
        session: mockSessionData,
        events: [mockEvent, mockEvent, mockEvent]
      };

      vi.mocked(existsSync).mockReturnValue(true);
      // Format JSON with newlines to ensure it's not mistaken for JSONL (which expects one object per line)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(jsonData, null, 2));

      const result = extractSessionMetadata('test.json');

      expect(result).not.toBeNull();
      expect(result?.session).toEqual(mockSessionData);
      // Since the first line will be "{" which can't be parsed, it will fall through to JSON parsing
      expect(result?.format).toBe('json');
      expect(result?.eventCount).toBe(3);
    });

    it('should return null for non-existent file', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = extractSessionMetadata('nonexistent.jsonl');

      expect(result).toBeNull();
    });

    it('should return null for empty file', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('');

      const result = extractSessionMetadata('empty.jsonl');

      expect(result).toBeNull();
    });

    it('should return null for invalid format', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('not json');

      const result = extractSessionMetadata('invalid.jsonl');

      expect(result).toBeNull();
    });

    it('should handle parse errors gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const result = extractSessionMetadata('error.jsonl');

      expect(result).toBeNull();
    });
  });

  describe('createTemplatedPath', () => {
    it('should replace single variable', () => {
      const template = '/path/{sessionId}/file.jsonl';
      const variables = { sessionId: '12345' };

      const result = createTemplatedPath(template, variables);

      expect(result).toBe('/path/12345/file.jsonl');
    });

    it('should replace multiple variables', () => {
      const template = '/path/{year}/{month}/{day}/session-{id}.jsonl';
      const variables = {
        year: '2024',
        month: '01',
        day: '15',
        id: 'abc123'
      };

      const result = createTemplatedPath(template, variables);

      expect(result).toBe('/path/2024/01/15/session-abc123.jsonl');
    });

    it('should replace same variable multiple times', () => {
      const template = '/path/{id}/backup-{id}/file-{id}.jsonl';
      const variables = { id: 'test' };

      const result = createTemplatedPath(template, variables);

      expect(result).toBe('/path/test/backup-test/file-test.jsonl');
    });

    it('should handle special regex characters in variable names', () => {
      const template = '/path/{var$name}/file.jsonl';
      const variables = { 'var$name': 'value' };

      const result = createTemplatedPath(template, variables);

      expect(result).toBe('/path/value/file.jsonl');
    });

    it('should leave unmatched variables unchanged', () => {
      const template = '/path/{known}/{unknown}/file.jsonl';
      const variables = { known: 'value' };

      const result = createTemplatedPath(template, variables);

      expect(result).toBe('/path/value/{unknown}/file.jsonl');
    });

    it('should handle empty variables object', () => {
      const template = '/path/{var}/file.jsonl';
      const variables = {};

      const result = createTemplatedPath(template, variables);

      expect(result).toBe('/path/{var}/file.jsonl');
    });

    it('should handle template without variables', () => {
      const template = '/path/to/file.jsonl';
      const variables = { unused: 'value' };

      const result = createTemplatedPath(template, variables);

      expect(result).toBe('/path/to/file.jsonl');
    });
  });

  describe('ensureDirectoryExists', () => {
    it('should create directory if it does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(mkdirSync).mockImplementation(() => undefined as any);

      ensureDirectoryExists('/test/dir');

      expect(existsSync).toHaveBeenCalledWith('/test/dir');
      expect(mkdirSync).toHaveBeenCalledWith('/test/dir', { recursive: true });
    });

    it('should not create directory if it already exists', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      ensureDirectoryExists('/existing/dir');

      expect(existsSync).toHaveBeenCalledWith('/existing/dir');
      expect(mkdirSync).not.toHaveBeenCalled();
    });

    it('should handle nested directory paths', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(mkdirSync).mockImplementation(() => undefined as any);

      ensureDirectoryExists('/very/deep/nested/path');

      expect(mkdirSync).toHaveBeenCalledWith('/very/deep/nested/path', { recursive: true });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle session without optional instructions', async () => {
      const sessionWithoutInstructions = { ...mockSessionData };
      delete (sessionWithoutInstructions as any).instructions;

      const jsonContent = JSON.stringify({
        session: sessionWithoutInstructions,
        events: []
      });

      vi.mocked(fs.readFile).mockResolvedValue(jsonContent);

      const result = await readRolloutFile('test.json');

      expect(result.session.instructions).toBeUndefined();
    });

    it('should handle events without optional metadata', async () => {
      const eventWithoutMetadata = {
        timestamp: '2024-01-01T00:01:00Z',
        payload: {
          id: 'event-id',
          msg: { type: 'test-event' }
        }
      };

      const jsonContent = JSON.stringify({
        session: mockSessionData,
        events: [eventWithoutMetadata]
      });

      vi.mocked(fs.readFile).mockResolvedValue(jsonContent);

      const result = await readRolloutFile('test.json');

      expect(result.events[0].metadata).toBeUndefined();
    });

    it('should validate session metadata fields', async () => {
      const invalidSession = {
        id: 123, // Should be string
        timestamp: '2024-01-01T00:00:00Z',
        cwd: '/test/dir',
        originator: 'test',
        cliVersion: '1.0.0'
      };

      const jsonContent = JSON.stringify({
        session: invalidSession,
        events: []
      });

      vi.mocked(fs.readFile).mockResolvedValue(jsonContent);

      await expect(readRolloutFile('test.json')).rejects.toThrow(RolloutParseError);
    });

    it('should validate event payload structure', async () => {
      const invalidEvent = {
        timestamp: '2024-01-01T00:01:00Z',
        payload: {
          // Missing id
          msg: { type: 'test-event' }
        }
      };

      const jsonContent = JSON.stringify({
        session: mockSessionData,
        events: [invalidEvent]
      });

      vi.mocked(fs.readFile).mockResolvedValue(jsonContent);

      await expect(readRolloutFile('test.json')).rejects.toThrow(RolloutParseError);
    });
  });
});