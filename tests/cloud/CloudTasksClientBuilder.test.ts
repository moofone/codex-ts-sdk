import { describe, it, expect } from 'vitest';
import { CloudTasksClientBuilder } from 'codex-ts-sdk/cloud';

describe('CloudTasksClientBuilder', () => {
  it('builds with required baseUrl', () => {
    const client = new CloudTasksClientBuilder()
      .withBaseUrl('https://api.example.com')
      .withBearerToken('t')
      .withUserAgent('ua/1')
      .withChatGptAccountId('acc')
      .withMockBackend(true)
      .build();
    expect(client).toBeTruthy();
    client.close();
  });

  it('uses default baseUrl when missing', () => {
    expect(() => new CloudTasksClientBuilder().build()).not.toThrow();
  });

  it('accepts bearerToken and chatGptAccountId via builder', () => {
    const client = new CloudTasksClientBuilder()
      .withBaseUrl('https://api.example.com')
      .withBearerToken('sk_test')
      .withChatGptAccountId('acct_123')
      .build();
    expect(client).toBeTruthy();
    client.close();
  });
});
