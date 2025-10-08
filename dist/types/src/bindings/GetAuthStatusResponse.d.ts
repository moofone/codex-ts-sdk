import type { AuthMode } from "./AuthMode";
export type GetAuthStatusResponse = {
    authMethod: AuthMode | null;
    authToken: string | null;
    requiresOpenaiAuth: boolean | null;
};
