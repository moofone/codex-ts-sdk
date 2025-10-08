import { CodexClient } from './CodexClient';
import type { CodexClientConfig } from '../types/options';
import type { PartialCodexLogger } from '../utils/logger';
import type { RetryPolicy } from '../utils/retry';
import type { CodexPlugin } from '../plugins/types';
export declare class CodexClientBuilder {
    private readonly config;
    withCodexHome(codexHome: string): this;
    withNativeModulePath(modulePath: string): this;
    withLogger(logger: PartialCodexLogger): this;
    withRetryPolicy(policy: RetryPolicy): this;
    withTimeout(timeoutMs: number): this;
    withApprovalPolicy(policy: CodexClientConfig['approvalPolicy']): this;
    withSandboxPolicy(policy: CodexClientConfig['sandboxPolicy']): this;
    withDefaultModel(model: string): this;
    withDefaultEffort(effort: CodexClientConfig['defaultEffort']): this;
    withDefaultSummary(summary: CodexClientConfig['defaultSummary']): this;
    addPlugin(plugin: CodexPlugin): this;
    addPlugins(plugins: CodexPlugin[]): this;
    withConfig(config: CodexClientConfig): this;
    build(): CodexClient;
}
