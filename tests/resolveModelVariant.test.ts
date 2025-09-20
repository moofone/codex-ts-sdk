import { describe, expect, it } from 'vitest';
import { getSupportedEfforts, resolveModelVariant } from '../src/utils/models';

describe('resolveModelVariant', () => {
  it('returns canonical slug for known alias', () => {
    const resolved = resolveModelVariant('codex');
    expect(resolved.model).toBe('gpt-5-codex');
    expect(resolved.effort).toBe('medium');
  });

  it('falls back to provided model when unknown', () => {
    const resolved = resolveModelVariant('unknown-model');
    expect(resolved.model).toBe('unknown-model');
  });

  it('honours explicitly requested effort when supported', () => {
    const resolved = resolveModelVariant('gpt-5-codex', 'high');
    expect(resolved).toEqual({ model: 'gpt-5-codex', effort: 'high' });
  });

  it('supports canonical entries without aliases', () => {
    const resolved = resolveModelVariant('gpt-5-codex-latest');
    expect(resolved.model).toBe('gpt-5-codex-latest');
    expect(resolved.effort).toBe('high');
  });

  it('trims model names and lowercases aliases when resolving', () => {
    const resolved = resolveModelVariant('  CODex  ', 'minimal');
    expect(resolved.model).toBe('gpt-5-codex');
    expect(resolved.effort).toBe('minimal');
  });

  it('falls back to registry default when effort not supported', () => {
    const resolved = resolveModelVariant('gpt-5-codex', 'extreme' as never);
    expect(resolved.effort).toBe('medium');
  });
});

describe('getSupportedEfforts', () => {
  it('returns default set for unknown model', () => {
    expect(getSupportedEfforts('not-real')).toContain('medium');
  });

  it('returns registry values for known aliases', () => {
    const efforts = getSupportedEfforts('codex-native');
    expect(efforts).toEqual(['minimal', 'low', 'medium', 'high']);
  });
});
