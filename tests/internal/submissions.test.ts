import { describe, expect, it } from 'vitest';
import {
  createInterruptSubmission,
  createPatchApprovalSubmission,
  createUserInputSubmission,
  createUserTurnSubmission,
} from '../../src/internal/submissions';

import type { InputItem } from '../../src/bindings/InputItem';

describe('submission helpers', () => {
  it('creates user input submissions', () => {
    const submission = createUserInputSubmission('id-1', [{ type: 'text', text: 'hello' }]);
    expect(submission).toEqual({ id: 'id-1', op: { type: 'user_input', items: [{ type: 'text', text: 'hello' }] } });
  });

  it('creates user turn submissions including optional effort', () => {
    const items: InputItem[] = [{ type: 'text', text: 'run' }];
    const submission = createUserTurnSubmission('turn', {
      items,
      cwd: '/tmp',
      approvalPolicy: 'on-request',
      sandboxPolicy: { mode: 'workspace-write', network_access: false, exclude_slash_tmp: false, exclude_tmpdir_env_var: false },
      model: 'codex',
      summary: 'concise',
      effort: 'high',
    });
    expect(submission.op).toMatchObject({
      type: 'user_turn',
      items,
      cwd: '/tmp',
      approval_policy: 'on-request',
      sandbox_policy: expect.objectContaining({ mode: 'workspace-write' }),
      model: 'codex',
      summary: 'concise',
      effort: 'high',
    });
  });

  it('omits effort when not provided', () => {
    const items: InputItem[] = [{ type: 'text', text: 'test' }];
    const submission = createUserTurnSubmission('turn', {
      items,
      cwd: '/tmp',
      approvalPolicy: 'on-request',
      sandboxPolicy: { mode: 'workspace-write', network_access: true, exclude_slash_tmp: false, exclude_tmpdir_env_var: false },
      model: 'codex',
      summary: 'auto',
    });
    expect(submission.op).not.toHaveProperty('effort');
  });

  it('creates interrupt submissions', () => {
    expect(createInterruptSubmission('interrupt')).toEqual({ id: 'interrupt', op: { type: 'interrupt' } });
  });

  it('creates approval submissions for exec and patch decisions', () => {
    const exec = createPatchApprovalSubmission('id', { id: 'exec-1', decision: 'approve', kind: 'exec' });
    expect(exec.op).toEqual({ type: 'exec_approval', id: 'exec-1', decision: 'approved' });

    const patch = createPatchApprovalSubmission('id-2', { id: 'patch-1', decision: 'reject', kind: 'patch' });
    expect(patch.op).toEqual({ type: 'patch_approval', id: 'patch-1', decision: 'denied' });
  });
});
