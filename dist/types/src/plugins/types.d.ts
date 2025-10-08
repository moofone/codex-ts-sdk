import type { SubmissionEnvelope } from '../internal/submissions';
import type { CodexEvent } from '../types/events';
import type { PartialCodexLogger } from '../utils/logger';
import type { CodexClient } from '../client/CodexClient';
export interface CodexPluginInitializeContext {
    client: CodexClient;
    logger: PartialCodexLogger;
}
export interface CodexPlugin {
    name: string;
    initialize?(context: CodexPluginInitializeContext): Promise<void> | void;
    beforeSubmit?(submission: SubmissionEnvelope): Promise<SubmissionEnvelope> | SubmissionEnvelope;
    afterEvent?(event: CodexEvent): Promise<void> | void;
    onError?(error: unknown): Promise<void> | void;
}
