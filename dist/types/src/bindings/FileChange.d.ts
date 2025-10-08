export type FileChange = {
    "add": {
        content: string;
    };
} | {
    "delete": {
        content: string;
    };
} | {
    "update": {
        unified_diff: string;
        move_path: string | null;
    };
};
