import type { GitSha } from "./GitSha";
export type GitDiffToRemoteResponse = {
    sha: GitSha;
    diff: string;
};
