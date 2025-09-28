import { describe, expect, it } from 'vitest';
import {
  createExecApprovalSubmission,
  createInterruptSubmission,
  createPatchApprovalSubmission,
  createUserInputSubmission,
  createUserTurnSubmission,
} from '../../src/internal/submissions';
import type { InputItem } from '../../src/bindings/InputItem';

describe('submission helpers', () => {
  describe('createUserInputSubmission', () => {
    it('wraps provided items in a user_input envelope', () => {
      const items: InputItem[] = [
        { type: 'text', text: 'Hello Codex' },
        { type: 'localImage', path: '/tmp/image.png' },
      ];

      const submission = createUserInputSubmission('req-1', items);

      expect(submission).toEqual({
        id: 'req-1',
        op: {
          type: 'user_input',
          items,
        },
      });
    });
  });

  describe('createUserTurnSubmission', () => {
    it('returns a fully populated user_turn envelope when all fields are provided', () => {
      const items: InputItem[] = [{ type: 'text', text: 'Summarise progress' }];
      const submission = createUserTurnSubmission('req-2', {
        items,
        cwd: '/workspace/project',
        approvalPolicy: 'on-request',
        sandboxPolicy: {
          mode: 'workspace-write',
          network_access: true,
          exclude_tmpdir_env_var: false,
          exclude_slash_tmp: false,
        },
        model: 'gpt-5-codex',
        effort: 'medium',
        summary: 'detailed',
      });

      expect(submission).toEqual({
        id: 'req-2',
        op: {
          type: 'user_turn',
          items,
          cwd: '/workspace/project',
          approval_policy: 'on-request',
          sandbox_policy: {
            mode: 'workspace-write',
            network_access: true,
            exclude_tmpdir_env_var: false,
            exclude_slash_tmp: false,
          },
          model: 'gpt-5-codex',
          effort: 'medium',
          summary: 'detailed',
        },
      });
    });

    it('omits effort when no value is supplied', () => {
      const submission = createUserTurnSubmission('req-3', {
        items: [{ type: 'text', text: 'No effort provided' }],
        cwd: '/workspace/project',
        approvalPolicy: 'never',
        sandboxPolicy: {
          mode: 'workspace-write',
          network_access: false,
          exclude_tmpdir_env_var: false,
          exclude_slash_tmp: false,
        },
        model: 'gpt-5-codex',
        summary: 'auto',
      });

      expect(submission.id).toBe('req-3');
      expect(submission.op.type).toBe('user_turn');
      expect(submission.op).not.toHaveProperty('effort');
    });
  });

  describe('createInterruptSubmission', () => {
    it('creates an interrupt envelope with no additional data', () => {
      expect(createInterruptSubmission('req-4')).toEqual({
        id: 'req-4',
        op: {
          type: 'interrupt',
        },
      });
    });
  });

  describe('createExecApprovalSubmission', () => {
    it('maps approvals to exec_approval envelopes', () => {
      const submission = createExecApprovalSubmission('req-5', {
        id: 'approval-1',
        decision: 'approve',
      });

      expect(submission).toEqual({
        id: 'req-5',
        op: {
          type: 'exec_approval',
          id: 'approval-1',
          decision: 'approved',
        },
      });
    });

    it('maps rejections to denied exec approvals', () => {
      const submission = createExecApprovalSubmission('req-6', {
        id: 'approval-2',
        decision: 'reject',
      });

      expect(submission).toEqual({
        id: 'req-6',
        op: {
          type: 'exec_approval',
          id: 'approval-2',
          decision: 'denied',
        },
      });
    });
  });

  describe('createPatchApprovalSubmission', () => {
    it('maps exec approvals with approve decisions to the expected envelope', () => {
      const submission = createPatchApprovalSubmission('req-7', {
        id: 'approval-3',
        decision: 'approve',
        kind: 'exec',
      });

      expect(submission).toEqual({
        id: 'req-7',
        op: {
          type: 'exec_approval',
          id: 'approval-3',
          decision: 'approved',
        },
      });
    });

    it('maps patch approvals to approved envelopes', () => {
      const submission = createPatchApprovalSubmission('req-8', {
        id: 'approval-4',
        decision: 'approve',
      });

      expect(submission).toEqual({
        id: 'req-8',
        op: {
          type: 'patch_approval',
          id: 'approval-4',
          decision: 'approved',
        },
      });
    });

    it('maps patch rejections to denied patch approval envelopes', () => {
      const submission = createPatchApprovalSubmission('req-9', {
        id: 'approval-5',
        decision: 'reject',
        kind: 'patch',
      });

      expect(submission).toEqual({
        id: 'req-9',
        op: {
          type: 'patch_approval',
          id: 'approval-5',
          decision: 'denied',
        },
      });
    });
  });

});
