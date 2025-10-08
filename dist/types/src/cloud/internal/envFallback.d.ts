import type { EnvironmentInfo } from '../../types/cloud-tasks';
export interface ResolvedCloudTasksConfig {
    baseUrl: string;
    bearerToken?: string;
    chatGptAccountId?: string;
    userAgent?: string;
    mock: boolean;
    codexHome?: string;
}
export declare function listEnvironmentsFallback(config: ResolvedCloudTasksConfig): Promise<EnvironmentInfo[]>;
