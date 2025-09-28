import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionSerializer } from '../src/persistence/SessionSerializer';

describe('Additional Coverage Tests', () => {
  describe('SessionSerializer - Additional Methods', () => {
    let serializer: SessionSerializer;

    beforeEach(() => {
      serializer = new SessionSerializer();
    });

    it('should serialize and deserialize metadata correctly', () => {
      const metadata = {
        id: 'test-id',
        timestamp: '2024-01-01T00:00:00Z',
        cwd: '/test',
        originator: 'test',
        cliVersion: '1.0.0'
      };

      // Test regular serialization
      const json = serializer.serializeMetadata(metadata);
      expect(json).toBe(JSON.stringify(metadata));

      // Test pretty print
      const prettyJson = serializer.serializeMetadata(metadata, true);
      expect(prettyJson).toBe(JSON.stringify(metadata, null, 2));

      // Test deserialization
      const deserialized = serializer.deserializeMetadata(json);
      expect(deserialized).toEqual(metadata);
    });

    it('should throw on invalid deserialization', () => {
      expect(() => {
        serializer.deserializeMetadata('{"invalid": true}');
      }).toThrow('Invalid session metadata');
    });

    it('should validate metadata structure', () => {
      // Valid metadata
      const valid = {
        id: 'test',
        timestamp: '2024-01-01',
        cwd: '/test',
        originator: 'test',
        cliVersion: '1.0.0'
      };
      expect(serializer.validateMetadata(valid)).toBe(true);

      // Invalid: missing fields
      expect(serializer.validateMetadata({})).toBe(false);
      expect(serializer.validateMetadata(null)).toBe(false);
      expect(serializer.validateMetadata(undefined)).toBe(false);
      expect(serializer.validateMetadata('string')).toBe(false);

      // Valid with optional instructions
      const withInstructions = { ...valid, instructions: 'test' };
      expect(serializer.validateMetadata(withInstructions)).toBe(true);

      // Invalid instructions type
      const invalidInstructions = { ...valid, instructions: 123 };
      expect(serializer.validateMetadata(invalidInstructions)).toBe(false);
    });

    it('should create test metadata', () => {
      const test1 = serializer.createTestMetadata();
      expect(test1.id).toBeDefined();
      expect(test1.timestamp).toBeDefined();
      expect(test1.cwd).toBeDefined();
      expect(test1.originator).toBe('unknown');
      expect(test1.cliVersion).toBe('unknown');

      // With overrides
      const test2 = serializer.createTestMetadata({
        id: 'custom-id',
        originator: 'custom-origin'
      });
      expect(test2.id).toBe('custom-id');
      expect(test2.originator).toBe('custom-origin');
    });

    it('should get environment info', () => {
      const info = serializer.getEnvironmentInfo();
      expect(info.nodeVersion).toBe(process.version);
      expect(info.platform).toBe(process.platform);
      expect(info.arch).toBe(process.arch);
      expect(info.cwd).toBeDefined();
      expect(info.environment).toBeDefined();
      expect(info.environment).toHaveProperty('CODEX_HOME');
      expect(info.environment).toHaveProperty('NODE_ENV');
      expect(info.environment).toHaveProperty('CODEX_INTERNAL_ORIGINATOR_OVERRIDE');
    });

    it('should handle custom ID generator failure', async () => {
      const customSerializer = new SessionSerializer({
        generateId: () => {
          throw new Error('Generator failed');
        }
      });

      // Should fall back to default generator
      const metadata = await customSerializer.createSessionMetadata();
      expect(metadata.id).toBeDefined();
      expect(metadata.id).toMatch(/^[a-f0-9-]{36}$/); // UUID format
    });

    it('should handle empty custom ID', async () => {
      const customSerializer = new SessionSerializer({
        generateId: () => ''
      });

      // Should fall back to default generator
      const metadata = await customSerializer.createSessionMetadata();
      expect(metadata.id).toBeDefined();
      expect(metadata.id).not.toBe('');
    });

    it('should handle custom originator detector failure', () => {
      const customSerializer = new SessionSerializer({
        detectOriginator: () => {
          throw new Error('Detector failed');
        }
      });

      // Should fall back to default detection
      const originator = customSerializer.detectOriginator();
      expect(originator).toBeDefined();
    });

    it('should handle empty custom originator', () => {
      const customSerializer = new SessionSerializer({
        detectOriginator: () => ''
      });

      // Should fall back to default detection
      const originator = customSerializer.detectOriginator();
      expect(originator).toBeDefined();
      expect(originator).not.toBe('');
    });

    it('should handle cwd error gracefully', async () => {
      const originalCwd = process.cwd;
      process.cwd = () => {
        throw new Error('CWD error');
      };

      try {
        const metadata = await serializer.createSessionMetadata();
        expect(metadata.cwd).toBe('unknown');
      } finally {
        process.cwd = originalCwd;
      }
    });
  });
});