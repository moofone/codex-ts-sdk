import type { AskForApproval } from "./AskForApproval";
import type { ConversationId } from "./ConversationId";
import type { InputItem } from "./InputItem";
import type { ReasoningEffort } from "./ReasoningEffort";
import type { ReasoningSummary } from "./ReasoningSummary";
import type { SandboxPolicy } from "./SandboxPolicy";
export type SendUserTurnParams = {
    conversationId: ConversationId;
    items: Array<InputItem>;
    cwd: string;
    approvalPolicy: AskForApproval;
    sandboxPolicy: SandboxPolicy;
    model: string;
    effort: ReasoningEffort;
    summary: ReasoningSummary;
};
