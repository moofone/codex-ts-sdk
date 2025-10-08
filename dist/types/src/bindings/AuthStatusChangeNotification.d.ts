import type { AuthMode } from "./AuthMode";
export type AuthStatusChangeNotification = {
    /**
     * Current authentication method; omitted if signed out.
     */
    authMethod: AuthMode | null;
};
