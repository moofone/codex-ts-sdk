import { CodexClient } from './CodexClient';
export class CodexClientBuilder {
    config = {};
    withCodexHome(codexHome) {
        this.config.codexHome = codexHome;
        return this;
    }
    withNativeModulePath(modulePath) {
        this.config.nativeModulePath = modulePath;
        return this;
    }
    withLogger(logger) {
        this.config.logger = logger;
        return this;
    }
    withRetryPolicy(policy) {
        this.config.retryPolicy = policy;
        return this;
    }
    withTimeout(timeoutMs) {
        this.config.timeoutMs = timeoutMs;
        return this;
    }
    withApprovalPolicy(policy) {
        this.config.approvalPolicy = policy;
        return this;
    }
    withSandboxPolicy(policy) {
        this.config.sandboxPolicy = policy;
        return this;
    }
    withDefaultModel(model) {
        this.config.defaultModel = model;
        return this;
    }
    withDefaultEffort(effort) {
        this.config.defaultEffort = effort;
        return this;
    }
    withDefaultSummary(summary) {
        this.config.defaultSummary = summary;
        return this;
    }
    addPlugin(plugin) {
        if (!this.config.plugins) {
            this.config.plugins = [];
        }
        this.config.plugins.push(plugin);
        return this;
    }
    addPlugins(plugins) {
        if (!this.config.plugins) {
            this.config.plugins = [];
        }
        this.config.plugins.push(...plugins);
        return this;
    }
    withConfig(config) {
        Object.assign(this.config, config);
        return this;
    }
    build() {
        return new CodexClient({ ...this.config });
    }
}
//# sourceMappingURL=CodexClientBuilder.js.map