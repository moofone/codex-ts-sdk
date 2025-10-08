import type { ApplyOptions, CreatedTask } from '../../types/cloud-tasks';
import type { ApplyOutcomeNapi, TaskSummaryNapi, TaskTextNapi, TurnAttemptNapi } from './converters';
export interface EnvironmentRowNapi {
    id: string;
    label?: string;
    isPinned?: boolean;
    repoHints?: string;
}
export interface CloudTasksConfig {
    base_url: string;
    bearer_token?: string;
    chatgpt_account_id?: string;
    user_agent?: string;
    mock?: boolean;
    codex_home?: string;
}
export interface CloudBindings {
    list(config: CloudTasksConfig, environmentId?: string): Promise<TaskSummaryNapi[]>;
    listEnvironments(config: CloudTasksConfig): Promise<EnvironmentRowNapi[]>;
    create(config: CloudTasksConfig, options: {
        environmentId: string;
        environment_id?: string;
        prompt: string;
        gitRef: string;
        git_ref?: string;
        qaMode?: boolean;
        qa_mode?: boolean;
        bestOfN?: number;
        best_of_n?: number;
    }): Promise<CreatedTask>;
    getDiff(config: CloudTasksConfig, taskId: string): Promise<string | null>;
    getMessages(config: CloudTasksConfig, taskId: string): Promise<string[]>;
    getText(config: CloudTasksConfig, taskId: string): Promise<TaskTextNapi>;
    apply(config: CloudTasksConfig, taskId: string, diffOverride?: string, preflight?: boolean): Promise<ApplyOutcomeNapi>;
    listAttempts(config: CloudTasksConfig, taskId: string, turnId: string): Promise<TurnAttemptNapi[]>;
    close?(): void;
}
export declare function getCloudBindings(): CloudBindings;
export interface EnvironmentRowNapi {
    id: string;
    label?: string;
    is_pinned?: boolean;
    repo_hints?: string;
}
export declare function toNativeConfig(options: {
    baseUrl: string;
    bearerToken?: string;
    chatGptAccountId?: string;
    userAgent?: string;
    mock?: boolean;
    codexHome?: string;
}): CloudTasksConfig;
export declare function toNativeApplyParams(taskId: string, options?: ApplyOptions): {
    taskId: string;
    diffOverride?: string;
    preflight: boolean;
};
