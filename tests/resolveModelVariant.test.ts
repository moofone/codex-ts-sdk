import { describe, expect, it } from 'vitest';
import { getSupportedEfforts, resolveModelVariant } from '../src/utils/models';

describe('resolveModelVariant', () => {
  it('returns canonical slug for known alias', () => {
    const resolved = resolveModelVariant('codex');
    expect(resolved.model).toBe('gpt-5-codex');
  });

  it('falls back to provided model when unknown', () => {
    const resolved = resolveModelVariant('unknown-model');
    expect(resolved.model).toBe('unknown-model');
  });
});

describe('getSupportedEfforts', () => {
  it('returns default set for unknown model', () => {
    expect(getSupportedEfforts('not-real')).toContain('medium');
  });
});
