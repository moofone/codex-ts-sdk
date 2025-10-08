export type LoginChatGptResponse = {
    loginId: string;
    /**
     * URL the client should open in a browser to initiate the OAuth flow.
     */
    authUrl: string;
};
