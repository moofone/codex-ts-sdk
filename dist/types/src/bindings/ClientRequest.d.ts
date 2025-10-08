import type { AddConversationListenerParams } from "./AddConversationListenerParams";
import type { CancelLoginChatGptParams } from "./CancelLoginChatGptParams";
import type { GetAuthStatusParams } from "./GetAuthStatusParams";
import type { GitDiffToRemoteParams } from "./GitDiffToRemoteParams";
import type { InterruptConversationParams } from "./InterruptConversationParams";
import type { LoginApiKeyParams } from "./LoginApiKeyParams";
import type { NewConversationParams } from "./NewConversationParams";
import type { RemoveConversationListenerParams } from "./RemoveConversationListenerParams";
import type { RequestId } from "./RequestId";
import type { SendUserMessageParams } from "./SendUserMessageParams";
import type { SendUserTurnParams } from "./SendUserTurnParams";
/**
 * Request from the client to the server.
 */
export type ClientRequest = {
    "method": "newConversation";
    id: RequestId;
    params: NewConversationParams;
} | {
    "method": "sendUserMessage";
    id: RequestId;
    params: SendUserMessageParams;
} | {
    "method": "sendUserTurn";
    id: RequestId;
    params: SendUserTurnParams;
} | {
    "method": "interruptConversation";
    id: RequestId;
    params: InterruptConversationParams;
} | {
    "method": "addConversationListener";
    id: RequestId;
    params: AddConversationListenerParams;
} | {
    "method": "removeConversationListener";
    id: RequestId;
    params: RemoveConversationListenerParams;
} | {
    "method": "gitDiffToRemote";
    id: RequestId;
    params: GitDiffToRemoteParams;
} | {
    "method": "loginApiKey";
    id: RequestId;
    params: LoginApiKeyParams;
} | {
    "method": "loginChatGpt";
    id: RequestId;
} | {
    "method": "cancelLoginChatGpt";
    id: RequestId;
    params: CancelLoginChatGptParams;
} | {
    "method": "logoutChatGpt";
    id: RequestId;
} | {
    "method": "getAuthStatus";
    id: RequestId;
    params: GetAuthStatusParams;
} | {
    "method": "getConfigToml";
    id: RequestId;
};
