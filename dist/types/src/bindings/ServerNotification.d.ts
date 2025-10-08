import type { AuthStatusChangeNotification } from "./AuthStatusChangeNotification";
import type { LoginChatGptCompleteNotification } from "./LoginChatGptCompleteNotification";
export type ServerNotification = {
    "type": "auth_status_change";
    "data": AuthStatusChangeNotification;
} | {
    "type": "login_chat_gpt_complete";
    "data": LoginChatGptCompleteNotification;
};
