import type { ApplyPatchApprovalParams } from "./ApplyPatchApprovalParams";
import type { ExecCommandApprovalParams } from "./ExecCommandApprovalParams";
import type { RequestId } from "./RequestId";
/**
 * Request initiated from the server and sent to the client.
 */
export type ServerRequest = {
    "method": "applyPatchApproval";
    id: RequestId;
    params: ApplyPatchApprovalParams;
} | {
    "method": "execCommandApproval";
    id: RequestId;
    params: ExecCommandApprovalParams;
};
