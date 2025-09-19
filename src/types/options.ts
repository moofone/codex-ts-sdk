import type { AskForApproval } from '../bindings/AskForApproval';
import type { SandboxPolicy } from '../bindings/SandboxPolicy';
import type { ReasoningEffort } from '../bindings/ReasoningEffort';
import type { ReasoningSummary } from '../bindings/ReasoningSummary';
import type { InputItem } from '../bindings/InputItem';
import type { PartialCodexLogger } from '../utils/logger';
import type { RetryPolicy } from '../utils/retry';
import type { CodexPlugin } from '../plugins/types';

export interface CodexClientConfig {
  codexHome?: string;
  nativeModulePath?: string;
  logger?: PartialCodexLogger;
  retryPolicy?: RetryPolicy;
  timeoutMs?: number;
  approvalPolicy?: AskForApproval;
  sandboxPolicy?: SandboxPolicy;
  defaultModel?: string;
  defaultEffort?: ReasoningEffort;
  defaultSummary?: ReasoningSummary;
  plugins?: CodexPlugin[];
}

export interface CreateConversationOptions {
  overrides?: Record<string, string>;
}

export interface SendUserTurnOptions {
  cwd?: string;
  approvalPolicy?: AskForApproval;
  sandboxPolicy?: SandboxPolicy;
  model?: string;
  effort?: ReasoningEffort;
  summary?: ReasoningSummary;
  items?: InputItem[];
}

export interface SendMessageOptions {
  images?: string[];
}
