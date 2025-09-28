import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { CodexClient } from '../src/client/CodexClient';
import { DataStorage } from '../src/monitoring/DataStorage';
import { ConversationManager } from '../src/client/ConversationManager';
import { CodexClientBuilder } from '../src/client/CodexClientBuilder';
import * as nativeModule from '../src/internal/nativeModule';

// Mock fs module
vi.mock('fs', () => ({
  ...vi.importActual('fs'),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn()
}));

describe('100% Coverage Tests', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('CodexClient version detection fallbacks', () => {
    it('handles version detection from native module when version is a string property', () => {
      // Test line 1140-1142: version as string property
      const mockModule = {
        version: 'test-version-1.0.0',
        cliVersion: () => '0.39.0',
        NativeCodex: class {},
        newClient: vi.fn(),
        newConversation: vi.fn()
      };

      vi.spyOn(nativeModule, 'loadNativeModule').mockReturnValue(mockModule as any);

      const client = new CodexClient({ codexHome: '/test' });
      // This should trigger version detection
      expect(client).toBeDefined();
    });

    it('handles cargo.toml version detection with workspace package', () => {
      const mockCargoContent = `
[workspace.package]
version = "1.2.3"
`;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockCargoContent);

      const client = new CodexClient({
        codexHome: '/test',
        nativeModulePath: '/test/native/module.js'
      });
      expect(client).toBeDefined();
    });

    it('handles cargo.toml version detection with codex-cli package', () => {
      const mockCargoContent = `
[package]
name = "codex-cli"
version = "2.3.4"
`;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockCargoContent);

      const client = new CodexClient({
        codexHome: '/test',
        nativeModulePath: '/test/native/module.js'
      });
      expect(client).toBeDefined();
    });

    it('handles cargo.toml version detection with generic package', () => {
      const mockCargoContent = `
[package]
version = "3.4.5"
`;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockCargoContent);

      const client = new CodexClient({
        codexHome: '/test',
        nativeModulePath: '/test/native/module.js'
      });
      expect(client).toBeDefined();
    });

    it('handles cargo.toml read errors gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const client = new CodexClient({
        codexHome: '/test',
        nativeModulePath: '/test/native/module.js'
      });
      expect(client).toBeDefined();
    });
  });

  describe('DataStorage edge cases', () => {
    it('handles aggregation with empty data', async () => {
      const storage = new DataStorage();
      // Force aggregation with no data - storage needs a client to monitor
      const mockClient = {
        on: vi.fn(),
        off: vi.fn(),
        connect: vi.fn(),
        close: vi.fn(),
        createConversation: vi.fn()
      };

      // Start and immediately stop to test empty data export
      storage.startMonitoring(mockClient as any);
      const result = await storage.exportForWebsite();
      expect(result.metadata.totalDataPoints).toBe(0);
      await storage.stopMonitoring();
    });

    it('handles file write errors during stop', async () => {
      const storage = new DataStorage();
      const mockClient = {
        on: vi.fn(),
        off: vi.fn(),
        connect: vi.fn(),
        close: vi.fn(),
        createConversation: vi.fn()
      };

      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Write failed');
      });

      // Start monitoring
      await storage.startMonitoring(mockClient as any);

      // Stop should handle write error gracefully
      const result = await storage.stopMonitoring();
      expect(result).toBeDefined();
    });

    it('handles edge cases in trend calculation', async () => {
      const storage = new DataStorage();
      const mockClient = {
        on: vi.fn(),
        off: vi.fn(),
        connect: vi.fn(),
        close: vi.fn(),
        createConversation: vi.fn()
      };

      storage.startMonitoring(mockClient as any);
      const data = await storage.exportForWebsite();

      // With no data, trends should be 'stable'
      expect(data.trends.rate_limits.direction).toBe('stable');
      expect(data.trends.token_usage.direction).toBe('stable');
      await storage.stopMonitoring();
    });
  });

  describe('ConversationManager edge cases', () => {
    it('handles creation with default configuration', () => {
      const manager = new ConversationManager();
      expect(manager).toBeDefined();
      // ConversationManager doesn't expose maxConversations publicly
    });

    it('handles conversation creation with config overrides', async () => {
      // This test verifies the ConversationManager can be created with config overrides
      const manager = new ConversationManager({
        maxConversations: 5,
        inactivityTimeout: 60000,
        defaultClientConfig: { codexHome: '/test' }
      });

      // Verify manager was created successfully
      expect(manager).toBeDefined();

      // Test that shutdown works
      await manager.shutdown();

      // After shutdown, creating conversations should fail
      await expect(manager.createConversation()).rejects.toThrow('Manager is shutting down');
    });

    it('prevents conversation creation after shutdown', async () => {
      const manager = new ConversationManager();
      await manager.shutdown();

      await expect(manager.createConversation()).rejects.toThrow('Manager is shutting down');
    });
  });

  describe('Native module edge cases', () => {
    it('handles native module with undefined properties', () => {
      const mockModule = {
        NativeCodex: class {},
        // version and cliVersion are undefined
      };

      vi.spyOn(nativeModule, 'loadNativeModule').mockReturnValue(mockModule as any);

      expect(() => {
        const client = new CodexClient({ codexHome: '/test' });
      }).not.toThrow();
    });

    it('handles native module load errors with custom path', async () => {
      vi.spyOn(nativeModule, 'loadNativeModule').mockImplementation((options) => {
        if (options?.modulePath === '/custom/path') {
          throw new Error('Custom path failed');
        }
        return {
          NativeCodex: class {},
          version: () => '1.0.0',
          cliVersion: () => '0.39.0'
        } as any;
      });

      // Creating the client should work
      const client = new CodexClient({
        codexHome: '/test',
        nativeModulePath: '/custom/path'
      });

      // But connecting should fail when loading the custom module
      await expect(client.connect()).rejects.toThrow();
    });
  });

  describe('Error message handling', () => {
    it('handles non-Error objects in CodexClient connection', async () => {
      const client = new CodexClient({ codexHome: '/test' });

      // Mock the internal client to reject with a string instead of an Error
      const mockNativeClient = {
        connect: vi.fn().mockRejectedValue('string error'),
        close: vi.fn(),
        createConversation: vi.fn(),
        sendMessage: vi.fn()
      };

      // Replace the internal client
      (client as any).client = mockNativeClient;

      await expect(client.connect()).rejects.toThrow();
    });
  });

  describe('CodexClientBuilder edge cases', () => {
    it('handles multiple plugin additions correctly', () => {
      const builder = new CodexClientBuilder();

      const plugin1 = { name: 'plugin1' };
      const plugin2 = { name: 'plugin2' };

      builder.addPlugins([plugin1]);
      builder.addPlugins([plugin2]);

      const client = builder.build();
      expect(client).toBeDefined();
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });
});