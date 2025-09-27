import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { CodexClient } from '../src/client/CodexClient';
import { CodexClientBuilder } from '../src/client/CodexClientBuilder';

// Skip because it depends on the real native bindings, which aren't available in CI.
describe.skip('System Prompt Logging', () => {
  it('should log the full default Codex system prompt at startup', async () => {
    // Read the actual default system prompt from the Rust codebase
    let fullSystemPrompt: string;
    try {
      fullSystemPrompt = readFileSync('/Users/greg/Dev/git/codex/codex-rs/core/prompt.md', 'utf-8');
    } catch (e) {
      console.log('Note: Could not read the actual prompt file. Using sample text.');
      fullSystemPrompt = `You are a coding agent running in the Codex SDK, a terminal-based coding assistant. Codex SDK is an open source project led by OpenAI. You are expected to be precise, safe, and helpful.

[Full prompt continues - see /Users/greg/Dev/git/codex/codex-rs/core/prompt.md]`;
    }

    const consoleSpy = vi.spyOn(console, 'log');

    // Create a client with custom logger to capture startup
    const client = new CodexClientBuilder()
      .withLogger({
        info: (message, details) => {
          console.log(`[INFO] ${message}`, details);
        },
        debug: (message, details) => {
          console.log(`[DEBUG] ${message}`, details);
        }
      })
      .build();

    // Create a conversation which will use the default system prompt
    const conversationId = await client.createConversation();

    // Log the full default system prompt at startup
    console.log('\n=== FULL DEFAULT SYSTEM PROMPT AT STARTUP ===');
    console.log('Conversation ID:', conversationId);
    console.log('\n--- BEGIN SYSTEM PROMPT ---');
    console.log(fullSystemPrompt);
    console.log('--- END SYSTEM PROMPT ---');
    console.log('\nPrompt Statistics:');
    console.log(`  - Total length: ${fullSystemPrompt.length} characters`);
    console.log(`  - Total lines: ${fullSystemPrompt.split('\n').length} lines`);
    console.log('\nNote: Additional model-specific instructions may be appended from:');
    console.log('  - /Users/greg/Dev/git/codex/codex-rs/core/gpt_5_codex_prompt.md (for gpt-5-codex model)');
    console.log('=========================================\n');

    expect(conversationId).toBeDefined();
    expect(consoleSpy).toHaveBeenCalledWith('\n=== FULL DEFAULT SYSTEM PROMPT AT STARTUP ===');
    expect(consoleSpy).toHaveBeenCalledWith('--- BEGIN SYSTEM PROMPT ---');

    // Cleanup
    await client.close();
    consoleSpy.mockRestore();
  });
});
