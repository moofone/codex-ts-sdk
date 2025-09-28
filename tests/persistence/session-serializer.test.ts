import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SessionSerializer } from '../../src/persistence/SessionSerializer';
import type { SessionMetadata } from '../../src/types/rollout';

// Mock utils/cliDetection
vi.mock('../../src/utils/cliDetection', () => ({
  getCodexCliVersion: vi.fn().mockReturnValue('0.42.0'),
}));

// Mock process
const mockProcess = {
  cwd: vi.fn().mockReturnValue('/test/directory'),
  env: {
    CODEX_INTERNAL_ORIGINATOR_OVERRIDE: undefined,
    npm_lifecycle_event: undefined,
  },
};

Object.defineProperty(global, 'process', {
  value: mockProcess,
  writable: true,
});

describe('SessionSerializer', () => {
  let serializer: SessionSerializer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProcess.cwd.mockReturnValue('/test/directory');
    mockProcess.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE = undefined;
    mockProcess.env.npm_lifecycle_event = undefined;

    serializer = new SessionSerializer();
  });

  describe('createSessionMetadata', () => {
    it('should create session metadata with required fields', async () => {
      const metadata = await serializer.createSessionMetadata();

      expect(metadata).toMatchObject({
        id: expect.any(String),
        timestamp: expect.any(String),
        cwd: '/test/directory',
        originator: 'unknown',
        cliVersion: '0.42.0',
      });

      // Validate timestamp format (ISO 8601)
      expect(new Date(metadata.timestamp).toISOString()).toBe(metadata.timestamp);

      // Validate ID is a UUID-like string
      expect(metadata.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should merge custom metadata', async () => {
      const customMetadata = {
        instructions: 'Custom test instructions',
        customField: 'test value',
      };

      const metadata = await serializer.createSessionMetadata(customMetadata);

      expect(metadata).toMatchObject({
        ...customMetadata,
        id: expect.any(String),
        timestamp: expect.any(String),
        cwd: '/test/directory',
        originator: 'unknown',
        cliVersion: '0.42.0',
      });
    });

    it('should detect originator from environment override', async () => {
      mockProcess.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE = 'test_override';

      const metadata = await serializer.createSessionMetadata();

      expect(metadata.originator).toBe('test_override');
    });

    it('should detect originator from npm lifecycle event', async () => {
      mockProcess.env.npm_lifecycle_event = 'test';

      const metadata = await serializer.createSessionMetadata();

      expect(metadata.originator).toBe('npm_test');
    });

    it('should prioritize environment override over npm lifecycle', async () => {
      mockProcess.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE = 'override_value';
      mockProcess.env.npm_lifecycle_event = 'test';

      const metadata = await serializer.createSessionMetadata();

      expect(metadata.originator).toBe('override_value');
    });

    it('should handle missing CLI version gracefully', async () => {
      const { getCodexCliVersion } = await import('../../src/utils/cliDetection');
      (getCodexCliVersion as Mock).mockReturnValue(undefined);

      const metadata = await serializer.createSessionMetadata();

      expect(metadata.cliVersion).toBe('unknown');
    });

    it('should handle current working directory errors', async () => {
      mockProcess.cwd.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const metadata = await serializer.createSessionMetadata();

      expect(metadata.cwd).toBe('unknown');
    });

    it('should generate unique session IDs', async () => {
      const metadata1 = await serializer.createSessionMetadata();
      const metadata2 = await serializer.createSessionMetadata();

      expect(metadata1.id).not.toBe(metadata2.id);
    });

    it('should generate chronologically ordered timestamps', async () => {
      const metadata1 = await serializer.createSessionMetadata();

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const metadata2 = await serializer.createSessionMetadata();

      expect(new Date(metadata1.timestamp).getTime()).toBeLessThan(
        new Date(metadata2.timestamp).getTime()
      );
    });
  });

  describe('detectOriginator', () => {
    it('should return "unknown" when no originator is detected', () => {
      const originator = serializer.detectOriginator();
      expect(originator).toBe('unknown');
    });

    it('should return environment override when present', () => {
      mockProcess.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE = 'test_override';

      const originator = serializer.detectOriginator();
      expect(originator).toBe('test_override');
    });

    it('should return npm lifecycle event when present', () => {
      mockProcess.env.npm_lifecycle_event = 'dev';

      const originator = serializer.detectOriginator();
      expect(originator).toBe('npm_dev');
    });

    it('should handle empty environment values', () => {
      mockProcess.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE = '';
      mockProcess.env.npm_lifecycle_event = '';

      const originator = serializer.detectOriginator();
      expect(originator).toBe('unknown');
    });

    it('should handle various npm lifecycle events', () => {
      const testCases = [
        { event: 'start', expected: 'npm_start' },
        { event: 'test', expected: 'npm_test' },
        { event: 'build', expected: 'npm_build' },
        { event: 'dev', expected: 'npm_dev' },
      ];

      for (const { event, expected } of testCases) {
        mockProcess.env.npm_lifecycle_event = event;
        mockProcess.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE = undefined;

        const originator = serializer.detectOriginator();
        expect(originator).toBe(expected);
      }
    });
  });

  describe('generateSessionId', () => {
    it('should generate UUID v4 format', () => {
      const sessionId = serializer.generateSessionId();

      // UUID v4 pattern: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      expect(sessionId).toMatch(uuidV4Pattern);
    });

    it('should generate unique IDs consistently', () => {
      const ids = new Set();

      for (let i = 0; i < 100; i++) {
        const id = serializer.generateSessionId();
        expect(ids.has(id)).toBe(false);
        ids.add(id);
      }
    });
  });

  describe('error handling', () => {
    it('should handle CLI version detection errors', async () => {
      const { getCodexCliVersion } = await import('../../src/utils/cliDetection');
      (getCodexCliVersion as Mock).mockImplementation(() => {
        throw new Error('CLI detection failed');
      });

      const metadata = await serializer.createSessionMetadata();

      expect(metadata.cliVersion).toBe('unknown');
    });

    it('should handle process environment access errors', async () => {
      // Mock process.env to throw on access
      Object.defineProperty(process, 'env', {
        get() {
          throw new Error('Environment access denied');
        },
        configurable: true,
      });

      const originator = serializer.detectOriginator();
      expect(originator).toBe('unknown');

      // Restore process.env
      Object.defineProperty(process, 'env', {
        value: mockProcess.env,
        configurable: true,
      });
    });
  });

  describe('configuration', () => {
    it('should accept custom session ID generator', async () => {
      const customIdGenerator = vi.fn().mockReturnValue('custom-session-id');

      const customSerializer = new SessionSerializer({
        generateId: customIdGenerator,
      });

      const metadata = await customSerializer.createSessionMetadata();

      expect(customIdGenerator).toHaveBeenCalled();
      expect(metadata.id).toBe('custom-session-id');
    });

    it('should accept custom originator detector', async () => {
      const customOriginatorDetector = vi.fn().mockReturnValue('custom-originator');

      const customSerializer = new SessionSerializer({
        detectOriginator: customOriginatorDetector,
      });

      const metadata = await customSerializer.createSessionMetadata();

      expect(customOriginatorDetector).toHaveBeenCalled();
      expect(metadata.originator).toBe('custom-originator');
    });

    it('should handle custom functions that throw errors', async () => {
      const faultyGenerator = vi.fn().mockImplementation(() => {
        throw new Error('Custom generator failed');
      });

      const customSerializer = new SessionSerializer({
        generateId: faultyGenerator,
      });

      const metadata = await customSerializer.createSessionMetadata();

      // Should fall back to default behavior
      expect(metadata.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe('compatibility', () => {
    it('should maintain backward compatibility with existing session format', async () => {
      const metadata = await serializer.createSessionMetadata();

      // Ensure all required fields are present
      const requiredFields = ['id', 'timestamp', 'cwd', 'originator', 'cliVersion'];
      for (const field of requiredFields) {
        expect(metadata).toHaveProperty(field);
        expect(typeof metadata[field as keyof SessionMetadata]).toBe('string');
      }
    });

    it('should not include git-related fields', async () => {
      const metadata = await serializer.createSessionMetadata();

      // Ensure git fields are not present
      const gitFields = ['gitBranch', 'gitCommit', 'gitStatus', 'repository'];
      for (const field of gitFields) {
        expect(metadata).not.toHaveProperty(field);
      }
    });
  });
});