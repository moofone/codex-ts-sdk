import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CodexClient } from '../../src';
import { getCodexCliVersion } from '../../src/version';
import type { CodexEvent, TokenCountEventMessage } from '../../src/types/events';
import type { RateLimitSnapshot } from '../../src/bindings/RateLimitSnapshot';
import type { RateLimitWindow } from '../../src/bindings/RateLimitWindow';
import type { RateLimitWindowStatus, StatusResponse } from '../../src/types/options';
import { loadNativeModule } from '../../src/internal/nativeModule';

type RawRateLimitWindow = NonNullable<NonNullable<TokenCountEventMessage['rate_limits']>['primary']>;

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;
const MINUTES_PER_MONTH = 30 * MINUTES_PER_DAY;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function liveStatusTest(): Promise<void> {
  const client = new CodexClient({
    logger: {
      debug: console.log,
      info: console.log,
      warn: console.warn,
      error: console.error,
    },
  });

  console.log('=== Codex SDK Live Status Test ===\n');

  let exitCode = 0;
  let clientClosed = false;
  const closeClient = async (): Promise<void> => {
    if (clientClosed) {
      return;
    }
    try {
      await client.close();
      clientClosed = true;
    } catch (closeError) {
      console.warn('Failed to close Codex client cleanly:', closeError);
    }
  };
  try {
    const reportedVersion = getCodexCliVersion();
    const detectedVersion = getNativeModuleVersion();
    const displayedVersion = detectedVersion ?? reportedVersion;
    if (detectedVersion && detectedVersion !== reportedVersion) {
      console.log(`Codex native version: ${detectedVersion} (reported ${reportedVersion})`);
    } else {
      console.log(`Codex native version: ${displayedVersion}`);
    }

    await client.connect();
    const conversationId = await client.createConversation();
    console.log(`Created conversation: ${conversationId}`);

    client.on('sessionCreated', (event) => {
      console.log(`\nSession ready (${event.session_id})`);
    });

    client.on('turnStarted', () => {
      console.log('\nTurn started');
    });

    client.on('turnCompleted', (event) => {
      console.log('Turn completed:', event.usage);
    });

    const logEvent = (evt: CodexEvent) => {
      console.log('EVENT:', evt.msg.type, JSON.stringify(evt.msg, null, 2));

      // Special handling for token_count events to show raw data
      if (evt.msg.type === 'token_count') {
        const tokenEvent = evt.msg as TokenCountEventMessage;
        console.log('TokenCount raw analysis:');
        console.log('  - Has rate_limits field:', tokenEvent.rate_limits !== undefined);
        console.log('  - Rate limits value:', tokenEvent.rate_limits);
        console.log('  - Has info field:', tokenEvent.info !== undefined);
        console.log('  - Info value:', tokenEvent.info);
      }
    };
    client.on('event', logEvent);

    client.on('execCommandApproval', async (event) => {
      console.log('Exec approval requested:', event.command);
      await client.respondToExecApproval(event.id ?? event.call_id, 'reject').catch((error) => {
        console.warn('Failed to auto-reject exec approval:', error);
      });
    });

    client.on('tokenCount', (event: TokenCountEventMessage) => {
      console.log('\nToken count event received');
      console.log('  Raw event JSON:', JSON.stringify(event, null, 2));
      if (event.rate_limits) {
        const { primary, secondary } = event.rate_limits;
        logRawWindow('Primary', primary);
        logRawWindow('Secondary', secondary);
      } else {
        console.log('  Rate limits payload: (missing)');
      }
      if (event.info) {
        console.log('  Usage snapshot:', event.info);
      }
    });

    console.log('\nSending user turn with session default: "1+1=?"\n');
    await client.sendUserTurn('1+1=?');

    await waitForTurnCompletion(client);

    const snapshot = await fetchStatusSnapshot(client, { waitMs: 500 });
    ensureRateLimitData(snapshot, 'cached');
    console.log('\nCached status snapshot:', JSON.stringify(snapshot, null, 2));
    console.log('  Raw rate limits payload:', snapshot.rate_limits ?? '(missing)');
    logRateLimitSummary(snapshot, 'cached');

    console.log('\nWaiting for additional status updates...');
    console.log('Sending follow-up turn to prompt fresh status data...');
    await client.sendUserTurn('Status check follow-up');
    await waitForTurnCompletion(client);

    const refreshed = await fetchStatusSnapshot(client, { waitMs: 500, refresh: true });
    ensureRateLimitData(refreshed, 'refreshed');
    console.log('\nRefreshed status snapshot:', JSON.stringify(refreshed, null, 2));
    console.log('  Raw rate limits payload:', refreshed.rate_limits ?? '(missing)');
    logRateLimitSummary(refreshed, 'refreshed');

    if (!hasRateLimitData(refreshed)) {
      console.error('\nNo rate-limit data available after refresh.');
      console.error('   • Verify your native module is properly authenticated and connected.');
      console.error('   • Send a longer conversation turn, then re-run this check.');
      exitCode = 1;
    }

    client.off('event', logEvent);

    await closeClient();
    if (exitCode === 0) {
      console.log('\nLive status test completed successfully');
    } else {
      console.error('\nLive status test detected missing rate limit data.');
    }
  } catch (error) {
    console.error('\nLive status test failed:', error);
    await closeClient();
    exitCode = 1;
  }
  await closeClient();
  process.exit(exitCode);
}

void liveStatusTest();

function waitForTurnCompletion(client: CodexClient): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutMs = 30_000;

    const cleanup = () => {
      clearTimeout(timer);
      client.off('turnCompleted', onTurnCompleted);
      client.off('taskComplete', onTaskComplete);
      client.off('event', onAnyEvent);
    };

    const finish = () => {
      cleanup();
      resolve();
    };

    const onTurnCompleted = () => {
      finish();
    };

    const onTaskComplete = () => {
      finish();
    };

    const onAnyEvent = (event: CodexEvent) => {
      if (event.msg.type === 'response_completed' || event.msg.type === 'task_complete') {
        finish();
      }
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for turn completion'));
    }, timeoutMs);

    client.on('turnCompleted', onTurnCompleted);
    client.on('taskComplete', onTaskComplete);
    client.on('event', onAnyEvent);
  });
}

interface FetchStatusOptions {
  waitMs?: number;
  refresh?: boolean;
  waitForRateLimits?: boolean;
  timeoutMs?: number;
}

async function fetchStatusSnapshot(
  client: CodexClient,
  options: FetchStatusOptions = {},
): Promise<StatusResponse> {
  const {
    waitMs = 0,
    refresh = false,
    waitForRateLimits = true,
    timeoutMs = 5_000,
  } = options;

  const initial = await client.getStatus({ refresh: false });

  if (refresh) {
    await client.getStatus({ refresh: true });
  }

  const shouldWaitForRateLimits = waitForRateLimits && !hasRateLimitData(initial);

  let waitForEventPromise: Promise<void> = Promise.resolve();

  if (shouldWaitForRateLimits) {
    waitForEventPromise = waitForStatusUpdate(client, timeoutMs);
  }

  await waitForEventPromise.catch((error) => {
    console.warn('Timed out waiting for status update:', error);
  });

  if (waitMs > 0) {
    await sleep(waitMs);
  }

  return client.getStatus({ refresh: false });
}

function hasRateLimitData(status: StatusResponse | undefined): boolean {
  if (!status) {
    return false;
  }
  const snapshot = status.rate_limits;
  const summary = status.rate_limit_windows;
  return Boolean(
    (snapshot?.primary && snapshot.primary.used_percent >= 0) ||
      (snapshot?.secondary && snapshot.secondary.used_percent >= 0) ||
      summary?.primary ||
      summary?.secondary,
  );
}

function ensureRateLimitData(status: StatusResponse, label: string): void {
  if (!hasRateLimitData(status)) {
    console.warn(`No rate limit data found in ${label} snapshot`);
  }
}

function waitForStatusUpdate(client: CodexClient, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout;

    const cleanup = (result?: 'resolve' | 'reject') => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      client.off('tokenCount', handler);
      if (result === 'resolve') {
        resolve();
      } else if (result === 'reject') {
        reject(new Error(`waited ${timeoutMs}ms for tokenCount event`));
      }
    };

    const handler = (event: TokenCountEventMessage) => {
      if (event.rate_limits || event.info) {
        cleanup('resolve');
      }
    };

    timer = setTimeout(() => cleanup('reject'), timeoutMs);

    client.on('tokenCount', handler);
  });
}

function loadRateLimitSnapshotFromRollout(rolloutPath?: string): RateLimitSnapshot | undefined {
  if (!rolloutPath) {
    return undefined;
  }

  try {
    if (!existsSync(rolloutPath)) {
      console.warn(`Rollout log not found at ${rolloutPath}`);
      return undefined;
    }
    const contents = readFileSync(rolloutPath, 'utf8');
    const lines = contents.split(/\r?\n/).filter((line) => line.trim().length > 0);
    for (let idx = lines.length - 1; idx >= 0; idx -= 1) {
      const line = lines[idx];
      try {
        const record = JSON.parse(line) as { payload?: Record<string, unknown> };
        const payload = record.payload as { type?: string; rate_limits?: RateLimitSnapshot } | undefined;
        if (payload?.type === 'token_count' && payload.rate_limits) {
          return payload.rate_limits;
        }
      } catch (parseError) {
        console.warn('Failed to parse rollout line for rate limits:', parseError);
      }
    }
  } catch (error) {
    console.warn('Failed to read rollout log for rate limits:', error);
  }
  return undefined;
}

function getNativeModuleVersion(): string | undefined {
  const nativeVersion = detectVersionFromNativeModule();
  if (nativeVersion && nativeVersion !== '0.0.0') {
    return nativeVersion;
  }

  if (nativeVersion === '0.0.0') {
    throw new Error('Native module reports version 0.0.0 – rebuild codex-rs from a tagged release.');
  }

  const cargoVersion = detectVersionFromCargoToml();
  if (cargoVersion) {
    return cargoVersion;
  }

  return nativeVersion;
}

function detectVersionFromNativeModule(): string | undefined {
  const attempt = (modulePath?: string) => {
    const native = loadNativeModule(modulePath ? { modulePath } : {});
    const raw =
      typeof native.cliVersion === 'function'
        ? native.cliVersion()
        : typeof native.version === 'function'
          ? native.version()
          : undefined;
    if (typeof raw !== 'string') {
      return undefined;
    }
    const match = raw.trim().match(/\d+\.\d+\.\d+/);
    return match ? match[0] : raw.trim();
  };

  const primary = attempt();
  if (primary) {
    return primary;
  }

  const fallbackPath = path.join(process.cwd(), 'native', 'codex-napi', 'index.js');
  return attempt(fallbackPath);
}

function detectVersionFromCargoToml(): string | undefined {
  const nativeDir = path.join(process.cwd(), 'native', 'codex-napi');
  const manifests = [
    path.join(nativeDir, '..', 'Cargo.toml'),
    path.join(nativeDir, '..', 'codex-rs', 'Cargo.toml'),
  ];

  for (const manifest of manifests) {
    try {
      if (!existsSync(manifest)) {
        continue;
      }
      const contents = readFileSync(manifest, 'utf8');
      const workspaceMatch = contents.match(/\[workspace\.package\][^\[]*version\s*=\s*"([^"]+)"/);
      if (workspaceMatch?.[1]) {
        return workspaceMatch[1].trim();
      }
      const packageMatch = contents.match(
        /\[package\][^\[]*name\s*=\s*"codex-cli"[^\[]*version\s*=\s*"([^"]+)"/,
      );
      if (packageMatch?.[1]) {
        return packageMatch[1].trim();
      }
    } catch {
      // ignore and try the next candidate
    }
  }
  return undefined;
}

function logRateLimitSummary(status: StatusResponse, label: 'cached' | 'refreshed'): void {
  const windows = status.rate_limit_windows;
  const snapshot = status.rate_limits;

  if (!windows && !snapshot) {
    console.log(`No rate-limit data available for ${label} snapshot.`);
    return;
  }

  console.log(`\nRate-limit summary (${label}):`);

  const logWindow = (kind: string, window?: RateLimitWindowStatus | RawRateLimitWindow) => {
    if (!window) {
      console.log(`  - ${kind}: (missing)`);
      return;
    }
    const label = getWindowLabel(window);
    const parts: string[] = [];
    parts.push(`${label} – ${window.used_percent.toFixed(1)}% used`);
    if (typeof window.window_minutes === 'number') {
      parts.push(`window ${describeWindowMinutes(window.window_minutes)}`);
    }
    if ('resets_at' in window) {
      const resetsAt = (window as RateLimitWindowStatus).resets_at;
      if (resetsAt instanceof Date) {
        parts.push(`resets ${resetsAt.toISOString()}`);
      } else if (typeof (window as { resets_at?: unknown }).resets_at === 'string') {
        parts.push(`resets at ${(window as { resets_at?: string }).resets_at}`);
      }

      // Show projected end for weekly limits over 50%
      const projectedEnd = (window as RateLimitWindowStatus).projected_end;
      if (projectedEnd instanceof Date) {
        parts.push(`projected to hit 100% at ${projectedEnd.toISOString()}`);
      }
    } else if (typeof window.resets_in_seconds === 'number') {
      parts.push(`resets in ${window.resets_in_seconds}s`);
    }
    console.log(`  - ${kind}: ${parts.join(', ')}`);
  };

  if (windows) {
    logWindow('primary', windows.primary);
    logWindow('secondary', windows.secondary);
    return;
  }

  logWindow('primary', snapshot?.primary);
  logWindow('secondary', snapshot?.secondary);
}

function logRawWindow(kind: string, window?: RawRateLimitWindow): void {
  if (!window) {
    return;
  }
  const label = getWindowLabel(window);
  const parts: string[] = [];
  parts.push(`${label}: ${window.used_percent.toFixed(1)}% used`);
  if (typeof window.window_minutes === 'number') {
    parts.push(`window ${describeWindowMinutes(window.window_minutes)}`);
  }
  if (typeof window.resets_in_seconds === 'number') {
    parts.push(`resets in ${window.resets_in_seconds}s`);
  }
  console.log(`  ${kind} limit – ${parts.join(', ')}`);
}

function getWindowLabel(window: RateLimitWindowStatus | RawRateLimitWindow): string {
  if (hasDerivedLabels(window)) {
    return window.label;
  }
  const short = hasDerivedShortLabel(window)
    ? window.short_label
    : describeWindowMinutes(window.window_minutes);
  return `${capitalizeIfAlpha(short)} limit`;
}

function describeWindowMinutes(windowMinutes: number | undefined): string {
  if (typeof windowMinutes !== 'number') {
    return 'unknown';
  }
  if (windowMinutes < MINUTES_PER_HOUR) {
    return `${windowMinutes}m`;
  }
  if (windowMinutes % MINUTES_PER_HOUR === 0 && windowMinutes < MINUTES_PER_DAY) {
    const hours = windowMinutes / MINUTES_PER_HOUR;
    return `${hours}h`;
  }
  if (windowMinutes % MINUTES_PER_DAY === 0 && windowMinutes < MINUTES_PER_WEEK) {
    const days = windowMinutes / MINUTES_PER_DAY;
    return `${days}d`;
  }
  if (windowMinutes % MINUTES_PER_WEEK === 0 && windowMinutes < MINUTES_PER_MONTH) {
    const weeks = windowMinutes / MINUTES_PER_WEEK;
    return weeks === 1 ? 'weekly' : `${weeks}w`;
  }
  if (windowMinutes % MINUTES_PER_MONTH === 0) {
    const months = windowMinutes / MINUTES_PER_MONTH;
    return months === 1 ? 'monthly' : `${months}mth`;
  }
  return `${windowMinutes}m`;
}

function capitalizeIfAlpha(label: string): string {
  if (!label || !/[a-zA-Z]/.test(label[0])) {
    return label;
  }
  return label[0].toUpperCase() + label.slice(1);
}

function hasDerivedLabels(window: RateLimitWindowStatus | RawRateLimitWindow): window is RateLimitWindowStatus {
  return (window as RateLimitWindowStatus).label !== undefined;
}

function hasDerivedShortLabel(window: RateLimitWindowStatus | RawRateLimitWindow): window is RateLimitWindowStatus {
  return (window as RateLimitWindowStatus).short_label !== undefined;
}
