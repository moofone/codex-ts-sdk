#!/usr/bin/env node

// Test script to verify rate limit functionality works when data is present

import { CodexClient } from '../dist/esm/src/index.js';

async function testRateLimits() {
    const client = new CodexClient({
        logger: {
            debug: console.log,
            info: console.log,
            warn: console.warn,
            error: console.error,
        },
    });

    try {
        await client.connect();
        const conversationId = await client.createConversation();
        console.log(`Created conversation: ${conversationId}`);

        // Test the StatusStore directly with mock data
        const mockTokenCountEvent = {
            type: 'token_count',
            info: {
                total_token_usage: {
                    input_tokens: 100,
                    output_tokens: 50,
                    total_tokens: 150
                },
                last_token_usage: {
                    input_tokens: 100,
                    output_tokens: 50,
                    total_tokens: 150
                },
                model_context_window: 272000
            },
            rate_limits: {
                primary: {
                    used_percent: 25.5,
                    window_minutes: 60,
                    resets_in_seconds: 1800
                },
                secondary: {
                    used_percent: 45.0,
                    window_minutes: 1440,
                    resets_in_seconds: 7200
                }
            }
        };

        // Access the internal status store to test it directly
        console.log('\n🧪 Testing StatusStore with mock rate limit data...');
        client.statusStore.updateFromTokenCountEvent(mockTokenCountEvent);

        const status = await client.getStatus();
        console.log('\n📊 Status with mock rate limits:');
        console.log(JSON.stringify(status, null, 2));

        if (status.rate_limits) {
            console.log('\n✅ Rate limits are working correctly in StatusStore');
            console.log('Primary:', status.rate_limits.primary);
            console.log('Secondary:', status.rate_limits.secondary);
        } else {
            console.log('\n❌ Rate limits not found in status');
        }

        await client.close();

    } catch (error) {
        console.error('❌ Test failed:', error);
        await client.close();
        process.exit(1);
    }
}

testRateLimits();