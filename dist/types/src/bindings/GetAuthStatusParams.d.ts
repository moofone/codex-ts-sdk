export type GetAuthStatusParams = {
    /**
     * If true, include the current auth token (if available) in the response.
     */
    includeToken: boolean | null;
    /**
     * If true, attempt to refresh the token before returning status.
     */
    refreshToken: boolean | null;
};
