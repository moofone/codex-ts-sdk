import type { AskForApproval } from '../bindings/AskForApproval';
import type { SandboxPolicy } from '../bindings/SandboxPolicy';
import type { ReasoningEffort } from '../bindings/ReasoningEffort';
import type { ReasoningSummary } from '../bindings/ReasoningSummary';
import type { RateLimitSnapshot } from '../bindings/RateLimitSnapshot';
import type { RateLimitWindow } from '../bindings/RateLimitWindow';
import type { TokenUsageInfo } from '../bindings/TokenUsageInfo';
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
  skipVersionCheck?: boolean;
}

export interface CreateConversationOptions {
  overrides?: Record<string, string>;
}

export interface OverrideTurnContextOptions {
  cwd?: string;
  approvalPolicy?: AskForApproval;
  sandboxPolicy?: SandboxPolicy;
  model?: string;
  effort?: ReasoningEffort | null;
  summary?: ReasoningSummary;
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

export interface GetHistoryEntryRequestOptions {
  offset: number;
  logId: number;
}

export interface ReviewRequestSnakeCaseInput {
  prompt: string;
  user_facing_hint: string;
}

export interface ReviewRequestCamelCaseInput {
  prompt: string;
  userFacingHint: string;
}

export type ReviewRequestInput = ReviewRequestSnakeCaseInput | ReviewRequestCamelCaseInput;

export interface AccountInfo {
  [key: string]: unknown;
}

export type RateLimitWindowStatus = RateLimitWindow & {
  /** Short label describing the window (e.g. `5h`). */
  short_label: string;
  /** Full label suitable for display (e.g. `5h limit`). */
  label: string;
  /** Absolute time when the window resets, if known. */
  resets_at?: Date;
  /** Projected end time based on current usage trend (weekly limits over 50% only). */
  projected_end?: Date;
};

export interface RateLimitStatusSummary {
  primary?: RateLimitWindowStatus;
  secondary?: RateLimitWindowStatus;
}

export interface StatusResponse {
  account?: AccountInfo;
  rate_limits?: RateLimitSnapshot;
  rate_limit_windows?: RateLimitStatusSummary;
  usage?: TokenUsageInfo;
  model?: string;
  reasoning_effort?: ReasoningEffort;
  session_id?: string;
  last_updated?: Date;
  history_log_id?: number;
  history_entry_count?: number;
  rollout_path?: string;
  last_agent_message?: string;
  model_context_window?: number;
}

export interface GetStatusOptions {
  refresh?: boolean;
}
