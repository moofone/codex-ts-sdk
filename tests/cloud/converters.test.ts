import { describe, it, expect } from 'vitest';
import { toApplyOutcome, toTaskSummary, toTurnAttempt, toTaskText } from '../../src/cloud/internal/converters';

describe('converters', () => {
  it('maps TaskSummaryNapi → TaskSummary', () => {
    const n = {
      id: 't',
      title: 'title',
      status: 'ready',
      updated_at: '2025-01-01T00:00:00Z',
      environment_id: 'env',
      environment_label: 'Prod',
      summary: { files_changed: 1, lines_added: 2, lines_removed: 3 },
      is_review: false,
      attempt_total: 3,
    };
    const t = toTaskSummary(n as any);
    expect(t.summary.filesChanged).toBe(1);
    expect(t.updatedAt).toBeInstanceOf(Date);
  });

  it('maps ApplyOutcomeNapi → ApplyOutcome', () => {
    const n = { applied: true, status: 'success', message: 'ok', skipped_paths: ['a'], conflict_paths: ['b'] };
    const t = toApplyOutcome(n as any);
    expect(t.applied).toBe(true);
    expect(t.skippedPaths).toEqual(['a']);
  });

  it('maps ApplyOutcomeNapi with partial and unknown status including null arrays', () => {
    const partial = toApplyOutcome({ applied: false, status: 'partial', message: 'p', skipped_paths: undefined as any, conflict_paths: undefined as any } as any);
    expect(partial.status).toBe('partial');
    expect(partial.skippedPaths).toEqual([]);
    const unknown = toApplyOutcome({ applied: false, status: 'bogus', message: 'x', skipped_paths: [], conflict_paths: [] } as any);
    expect(unknown.status).toBe('error');
  });

  it('maps TurnAttemptNapi → TurnAttempt with unknown status fallback', () => {
    const n = { turn_id: 'x', status: 'weird', messages: [] };
    const t = toTurnAttempt(n as any);
    expect(t.status).toBe('unknown');
  });

  it('maps TurnAttemptNapi with created_at and known status', () => {
    const now = new Date().toISOString();
    const n = { turn_id: 'x', status: 'failed', messages: [], created_at: now, attempt_placement: 2 };
    const t = toTurnAttempt(n as any);
    expect(t.status).toBe('failed');
    expect(t.createdAt).toBeInstanceOf(Date);
    expect(t.attemptPlacement).toBe(2);
  });

  it('covers TurnAttempt messages fallback to [] when undefined', () => {
    const t = toTurnAttempt({ turn_id: 'x', status: 'completed', messages: undefined as any } as any);
    expect(t.messages).toEqual([]);
  });

  it('maps TaskTextNapi → TaskText', () => {
    const n = { messages: ['m'], sibling_turn_ids: ['a', 'b'], attempt_status: 'completed' };
    const t = toTaskText(n as any);
    expect(t.siblingTurnIds.length).toBe(2);
    expect(t.attemptStatus).toBe('completed');
  });

  it('covers attempt status mapping for known values (canonical hyphen)', () => {
    const cases: Array<[string, string]> = [
      ['pending', 'pending'],
      ['in_progress', 'in-progress'],
      ['completed', 'completed'],
      ['failed', 'failed'],
      ['cancelled', 'cancelled'],
      ['in-progress', 'in-progress'],
    ];
    for (const [input, expected] of cases) {
      const t = toTaskText({ messages: [], sibling_turn_ids: [], attempt_status: input } as any);
      expect(t.attemptStatus).toBe(expected);
    }
  });

  it('covers TaskText fallbacks for undefined lists', () => {
    const t = toTaskText({ messages: undefined as any, sibling_turn_ids: undefined as any } as any);
    expect(t.messages).toEqual([]);
    expect(t.siblingTurnIds).toEqual([]);
  });
});
