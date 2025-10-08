import type { ConversationId } from "./ConversationId";
export type ExecCommandApprovalParams = {
    conversation_id: ConversationId;
    /**
     * Use to correlate this with [codex_core::protocol::ExecCommandBeginEvent]
     * and [codex_core::protocol::ExecCommandEndEvent].
     */
    call_id: string;
    command: Array<string>;
    cwd: string;
    reason: string | null;
};
