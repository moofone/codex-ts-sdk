import type { ConversationId } from "./ConversationId";
import type { FileChange } from "./FileChange";
export type ApplyPatchApprovalParams = {
    conversation_id: ConversationId;
    /**
     * Use to correlate this with [codex_core::protocol::PatchApplyBeginEvent]
     * and [codex_core::protocol::PatchApplyEndEvent].
     */
    call_id: string;
    file_changes: {
        [key in string]?: FileChange;
    };
    /**
     * Optional explanatory reason (e.g. request for extra write access).
     */
    reason: string | null;
    /**
     * When set, the agent is asking the user to allow writes under this root
     * for the remainder of the session (unclear if this is honored today).
     */
    grant_root: string | null;
};
