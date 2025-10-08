import type { ConversationId } from "./ConversationId";
import type { InputItem } from "./InputItem";
export type SendUserMessageParams = {
    conversationId: ConversationId;
    items: Array<InputItem>;
};
