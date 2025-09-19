import { CodexClient } from './CodexClient';
import type { CodexClientConfig } from '../types/options';
import type { PartialCodexLogger } from '../utils/logger';
import type { RetryPolicy } from '../utils/retry';
import type { CodexPlugin } from '../plugins/types';

export class CodexClientBuilder {
  private readonly config: CodexClientConfig = {};

  withCodexHome(codexHome: string): this {
    this.config.codexHome = codexHome;
    return this;
  }

  withNativeModulePath(modulePath: string): this {
    this.config.nativeModulePath = modulePath;
    return this;
  }

  withLogger(logger: PartialCodexLogger): this {
    this.config.logger = logger;
    return this;
  }

  withRetryPolicy(policy: RetryPolicy): this {
    this.config.retryPolicy = policy;
    return this;
  }

  withTimeout(timeoutMs: number): this {
    this.config.timeoutMs = timeoutMs;
    return this;
  }

  withApprovalPolicy(policy: CodexClientConfig['approvalPolicy']): this {
    this.config.approvalPolicy = policy;
    return this;
  }

  withSandboxPolicy(policy: CodexClientConfig['sandboxPolicy']): this {
    this.config.sandboxPolicy = policy;
    return this;
  }

  withDefaultModel(model: string): this {
    this.config.defaultModel = model;
    return this;
  }

  withDefaultEffort(effort: CodexClientConfig['defaultEffort']): this {
    this.config.defaultEffort = effort;
    return this;
  }

  withDefaultSummary(summary: CodexClientConfig['defaultSummary']): this {
    this.config.defaultSummary = summary;
    return this;
  }

  addPlugin(plugin: CodexPlugin): this {
    if (!this.config.plugins) {
      this.config.plugins = [];
    }
    this.config.plugins.push(plugin);
    return this;
  }

  addPlugins(plugins: CodexPlugin[]): this {
    if (!this.config.plugins) {
      this.config.plugins = [];
    }
    this.config.plugins.push(...plugins);
    return this;
  }

  build(): CodexClient {
    return new CodexClient({ ...this.config });
  }
}
