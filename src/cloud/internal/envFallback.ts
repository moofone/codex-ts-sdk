import { execFile } from 'node:child_process';
import * as http from 'node:http';
import * as https from 'node:https';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type { EnvironmentInfo } from '../../types/cloud-tasks';
import { expandHomePath } from '../../utils/path';

const execFileAsync = promisify(execFile);

export interface ResolvedCloudTasksConfig {
  baseUrl: string;
  bearerToken?: string;
  chatGptAccountId?: string;
  userAgent?: string;
  mock: boolean;
  codexHome?: string;
}

type HeadersMap = Record<string, string>;

type RawEnvironmentRow = {
  id: string;
  label?: string | null;
  is_pinned?: boolean;
  isPinned?: boolean;
  repo_hints?: string | null;
  repoHints?: string | null;
};

type AuthPayload = {
  bearerToken?: string;
  chatGptAccountId?: string;
};

export async function listEnvironmentsFallback(config: ResolvedCloudTasksConfig): Promise<EnvironmentInfo[]> {
  if (config.mock) {
    return [
      { id: 'mock-environment', label: 'Mock Environment', isPinned: true },
    ];
  }

  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const headers = await buildHeaders(config);
  const environments = new Map<string, EnvironmentInfo>();

  const origins = await getGitOrigins();
  for (const origin of origins) {
    const parsed = parseOwnerRepo(origin);
    if (!parsed) continue;
    const [owner, repo] = parsed;
    const url = buildByRepoUrl(baseUrl, owner, repo);
    try {
      const list = await fetchEnvironmentRows(url, headers);
      for (const row of list) {
        mergeEnvironmentRow(environments, row, `${owner}/${repo}`);
      }
    } catch {
      // Ignore; mirrors Rust implementation that continues on per-origin errors.
    }
  }

  const listUrl = buildAllEnvironmentsUrl(baseUrl);
  try {
    const list = await fetchEnvironmentRows(listUrl, headers);
    for (const row of list) {
      mergeEnvironmentRow(environments, row);
    }
  } catch (error) {
    if (environments.size === 0) {
      throw error;
    }
  }

  const result = Array.from(environments.values());
  result.sort(sortEnvironments);
  return result;
}

function normalizeBaseUrl(input: string): string {
  let base = input.trim();
  while (base.endsWith('/')) {
    base = base.slice(0, -1);
  }
  const needsBackend = (base.startsWith('https://chatgpt.com') || base.startsWith('https://chat.openai.com'))
    && !base.includes('/backend-api');
  return needsBackend ? `${base}/backend-api` : base;
}

async function buildHeaders(config: ResolvedCloudTasksConfig): Promise<HeadersMap> {
  const headers: HeadersMap = {
    'User-Agent': config.userAgent?.trim() || 'codex-ts-sdk',
  };

  let bearer = config.bearerToken?.trim();
  let accountId = config.chatGptAccountId?.trim();

  if (!bearer) {
    const auth = await loadAuthFromDisk(config.codexHome);
    if (auth) {
      bearer = auth.bearerToken ?? bearer;
      if (!accountId && auth.chatGptAccountId) {
        accountId = auth.chatGptAccountId;
      }
    }
  }

  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
    if (!accountId) {
      accountId = extractChatGptAccountId(bearer);
    }
  }

  if (accountId) {
    headers['ChatGPT-Account-Id'] = accountId;
  }

  return headers;
}

async function loadAuthFromDisk(codexHome?: string): Promise<AuthPayload | undefined> {
  const candidates = resolveCodexHome(codexHome);
  for (const candidate of candidates) {
    const authFile = path.join(candidate, 'auth.json');
    try {
      const data = await fs.readFile(authFile, 'utf8');
      const json = JSON.parse(data) as {
        tokens?: {
          access_token?: string;
          accessToken?: string;
          account_id?: string;
          accountId?: string;
        } | null;
      };
      const tokens = json.tokens;
      if (!tokens) {
        continue;
      }
      const bearer = tokens.access_token ?? tokens.accessToken;
      const accountId = tokens.account_id ?? tokens.accountId;
      if (bearer || accountId) {
        return {
          bearerToken: bearer?.trim(),
          chatGptAccountId: accountId?.trim(),
        };
      }
    } catch {
      // Try next candidate.
    }
  }
  return undefined;
}

function resolveCodexHome(provided?: string): string[] {
  const ordered: string[] = [];
  if (provided?.trim()) {
    ordered.push(provided.trim());
  }
  if (process.env.CODEX_HOME?.trim()) {
    ordered.push(process.env.CODEX_HOME.trim());
  }
  const home = os.homedir?.();
  if (home) {
    ordered.push(path.join(home, '.codex'));
  }

  const seen = new Set<string>();
  const expanded: string[] = [];
  for (const candidate of ordered) {
    const resolved = path.resolve(expandHomePath(candidate));
    if (!seen.has(resolved)) {
      seen.add(resolved);
      expanded.push(resolved);
    }
  }
  return expanded;
}

function extractChatGptAccountId(token: string): string | undefined {
  const parts = token.split('.');
  if (parts.length < 2) return undefined;
  try {
    const payloadRaw = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(payloadRaw) as {
      'https://api.openai.com/auth'?: { chatgpt_account_id?: string };
    };
    return payload['https://api.openai.com/auth']?.chatgpt_account_id ?? undefined;
  } catch {
    return undefined;
  }
}

async function fetchEnvironmentRows(url: string, headers: HeadersMap): Promise<RawEnvironmentRow[]> {
  const { statusCode, statusMessage, body } = await httpGet(url, headers);
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`GET ${url} failed: ${statusCode} ${statusMessage}; body=${body}`);
  }
  try {
    const json: unknown = JSON.parse(body);
    if (!Array.isArray(json)) {
      throw new Error(`Expected an array response from ${url}`);
    }
    return json as RawEnvironmentRow[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse environments JSON from ${url}: ${message}`);
  }
}

function mergeEnvironmentRow(
  map: Map<string, EnvironmentInfo>,
  row: RawEnvironmentRow,
  repoHint?: string,
): void {
  if (!row?.id) return;

  const existing = map.get(row.id) ?? {
    id: row.id,
    label: undefined,
    isPinned: false,
    repoHints: undefined,
  };

  const label = (typeof row.label === 'string' && row.label) || undefined;
  const pinned = typeof row.is_pinned === 'boolean'
    ? row.is_pinned
    : (typeof row.isPinned === 'boolean' ? row.isPinned : false);
  const repo = repoHint
    ?? (typeof row.repo_hints === 'string' ? row.repo_hints : undefined)
    ?? (typeof row.repoHints === 'string' ? row.repoHints : undefined);

  if (!existing.label && label) {
    existing.label = label;
  }
  existing.isPinned = Boolean(existing.isPinned || pinned);
  if (!existing.repoHints && repo) {
    existing.repoHints = repo;
  }

  map.set(existing.id, existing);
}

function sortEnvironments(a: EnvironmentInfo, b: EnvironmentInfo): number {
  const pin = Number(b.isPinned ?? false) - Number(a.isPinned ?? false);
  if (pin !== 0) return pin;
  const al = (a.label ?? '').toLowerCase();
  const bl = (b.label ?? '').toLowerCase();
  if (al < bl) return -1;
  if (al > bl) return 1;
  return a.id.localeCompare(b.id);
}

async function getGitOrigins(): Promise<string[]> {
  const first = await runGit(['config', '--get-regexp', 'remote\\..*\\.url']);
  if (first) {
    const urls = parseGitConfigUrls(first);
    if (urls.length > 0) {
      return uniq(urls);
    }
  }
  const second = await runGit(['remote', '-v']);
  if (second) {
    const urls = parseGitRemoteVerbose(second);
    if (urls.length > 0) {
      return uniq(urls);
    }
  }
  return [];
}

async function runGit(args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', args, { encoding: 'utf8' });
    return stdout;
  } catch {
    return undefined;
  }
}

function parseGitConfigUrls(output: string): string[] {
  const urls: string[] = [];
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const space = line.indexOf(' ');
    if (space === -1) continue;
    const url = line.slice(space + 1).trim();
    if (url) urls.push(url);
  }
  return urls;
}

function parseGitRemoteVerbose(output: string): string[] {
  const urls: string[] = [];
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split(/\s+/);
    if (parts.length >= 2) {
      urls.push(parts[1]);
    }
  }
  return urls;
}

function parseOwnerRepo(url: string): [string, string] | undefined {
  let s = url.trim();
  if (s.startsWith('ssh://')) {
    s = s.slice('ssh://'.length);
  }
  const sshIdx = s.indexOf('@github.com:');
  if (sshIdx !== -1) {
    const rest = s.slice(sshIdx + '@github.com:'.length).replace(/\.git$/, '').replace(/^\/+/, '');
    const [owner, repo] = rest.split('/', 2);
    if (owner && repo) {
      return [owner, repo];
    }
  }
  for (const prefix of ['https://github.com/', 'http://github.com/', 'git://github.com/', 'github.com/']) {
    if (s.startsWith(prefix)) {
      const rest = s.slice(prefix.length).replace(/\.git$/, '').replace(/^\/+/, '');
      const [owner, repo] = rest.split('/', 2);
      if (owner && repo) {
        return [owner, repo];
      }
    }
  }
  return undefined;
}

function buildByRepoUrl(baseUrl: string, owner: string, repo: string): string {
  if (baseUrl.includes('/backend-api')) {
    return `${baseUrl}/wham/environments/by-repo/github/${owner}/${repo}`;
  }
  return `${baseUrl}/api/codex/environments/by-repo/github/${owner}/${repo}`;
}

function buildAllEnvironmentsUrl(baseUrl: string): string {
  if (baseUrl.includes('/backend-api')) {
    return `${baseUrl}/wham/environments`;
  }
  return `${baseUrl}/api/codex/environments`;
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.sort()));
}

async function httpGet(url: string, headers: HeadersMap): Promise<{ statusCode: number; statusMessage: string; body: string }> {
  const target = new URL(url);
  const agent = target.protocol === 'http:' ? http : https;
  return new Promise((resolve, reject) => {
    const req = agent.request(
      target,
      {
        method: 'GET',
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: string | Buffer) => {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            statusMessage: res.statusMessage ?? '',
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}
