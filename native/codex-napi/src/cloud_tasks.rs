use napi::Result;
use napi_derive::napi;

use codex_cloud_tasks_client::{
    ApplyOutcome, ApplyStatus, AttemptStatus, CloudBackend, CreatedTask, HttpClient, MockClient, TaskId, TaskStatus, TaskSummary, TaskText, TurnAttempt,
};
use codex_core::{AuthManager, config};
use serde_json::Value as JsonValue;
use base64::Engine as _;
use reqwest::header::{HeaderMap, AUTHORIZATION, USER_AGENT};
use reqwest::header::HeaderName;

#[napi(object)]
pub struct CloudTasksConfig {
    pub base_url: String,
    pub bearer_token: Option<String>,
    pub chatgpt_account_id: Option<String>,
    pub user_agent: Option<String>,
    pub mock: Option<bool>,
    pub codex_home: Option<String>,
}

#[napi(object)]
pub struct DiffSummaryNapi {
    pub files_changed: u32,
    pub lines_added: u32,
    pub lines_removed: u32,
}

#[napi(object)]
pub struct PullRequestNapi {
    pub number: Option<u32>,
    pub url: Option<String>,
    pub state: Option<String>,
    pub merged: Option<bool>,
    pub title: Option<String>,
    pub body: Option<String>,
    pub base_branch: Option<String>,
    pub head_branch: Option<String>,
    pub base_sha: Option<String>,
    pub head_sha: Option<String>,
    pub merge_commit_sha: Option<String>,
}

#[napi(object)]
pub struct TaskSummaryNapi {
    pub id: String,
    pub title: String,
    pub status: String,
    pub updated_at: String,
    pub created_at: Option<String>,
    pub has_generated_title: Option<bool>,
    pub environment_id: Option<String>,
    pub environment_label: Option<String>,
    pub summary: DiffSummaryNapi,
    pub is_review: bool,
    pub attempt_total: Option<u32>,
    pub archived: Option<bool>,
    pub has_unread_turn: Option<bool>,
    pub branch_name: Option<String>,
    pub turn_id: Option<String>,
    pub turn_status: Option<String>,
    pub sibling_turn_ids: Option<Vec<String>>,
    pub intent: Option<String>,
    pub initial_intent: Option<String>,
    pub fix_task_id: Option<String>,
    pub pull_requests: Option<Vec<PullRequestNapi>>,
}

#[napi(object)]
pub struct CreateTaskOptionsNapi {
    pub environment_id: String,
    pub prompt: String,
    pub git_ref: String,
    pub qa_mode: Option<bool>,
    pub best_of_n: Option<u32>,
}

#[napi(object)]
pub struct ApplyOutcomeNapi {
    pub applied: bool,
    pub status: String,
    pub message: String,
    pub skipped_paths: Vec<String>,
    pub conflict_paths: Vec<String>,
}

#[napi(object)]
pub struct TaskTextNapi {
    pub prompt: Option<String>,
    pub messages: Vec<String>,
    pub turn_id: Option<String>,
    pub sibling_turn_ids: Vec<String>,
    pub attempt_placement: Option<u32>,
    pub attempt_status: Option<String>,
}

#[napi(object)]
pub struct EnvironmentRowNapi {
    pub id: String,
    pub label: Option<String>,
    pub is_pinned: Option<bool>,
    pub repo_hints: Option<String>,
}

#[napi(object)]
pub struct TurnAttemptNapi {
    pub turn_id: String,
    pub attempt_placement: Option<u32>,
    pub created_at: Option<String>,
    pub status: String,
    pub diff: Option<String>,
    pub messages: Vec<String>,
}

#[napi]
pub async fn cloud_tasks_list(config: CloudTasksConfig, environment_id: Option<String>) -> Result<Vec<TaskSummaryNapi>> {
    let backend = create_backend(config).await.map_err(to_napi_error)?;
    let tasks = backend
        .list_tasks(environment_id.as_deref())
        .await
        .map_err(to_napi_error)?;
    Ok(tasks.into_iter().map(to_task_summary_napi).collect())
}

#[napi]
pub async fn cloud_tasks_list_environments(config: CloudTasksConfig) -> Result<Vec<EnvironmentRowNapi>> {
    let base_url = normalize_base_url(&config.base_url);
    let headers = build_chatgpt_headers(&config).await;
    let client = reqwest::Client::builder().build().map_err(to_napi_error)?;

    let mut map: std::collections::HashMap<String, EnvironmentRowNapi> = std::collections::HashMap::new();

    // 1) Try by-repo for each parsed GitHub origin
    for origin in get_git_origins() {
        if let Some((owner, repo)) = parse_owner_repo(&origin) {
            let url = if base_url.contains("/backend-api") {
                format!("{}/wham/environments/by-repo/github/{}/{}", base_url, owner, repo)
            } else {
                format!("{}/api/codex/environments/by-repo/github/{}/{}", base_url, owner, repo)
            };
            if let Ok(list) = get_envs(&client, &url, &headers).await {
                for e in list {
                    let entry = map.entry(e.id.clone()).or_insert(EnvironmentRowNapi {
                        id: e.id.clone(),
                        label: e.label.clone(),
                        is_pinned: e.is_pinned,
                        repo_hints: Some(format!("{}/{}", owner, repo)),
                    });
                    if entry.label.is_none() { entry.label = e.label.clone(); }
                    if let Some(pin) = e.is_pinned { entry.is_pinned = Some(entry.is_pinned.unwrap_or(false) || pin); }
                }
            }
        }
    }

    // 2) Fallback to full list
    let list_url = if base_url.contains("/backend-api") {
        format!("{}/wham/environments", base_url)
    } else { format!("{}/api/codex/environments", base_url) };
    if let Ok(list) = get_envs(&client, &list_url, &headers).await {
        for e in list {
            let entry = map.entry(e.id.clone()).or_insert(EnvironmentRowNapi {
                id: e.id.clone(),
                label: e.label.clone(),
                is_pinned: e.is_pinned,
                repo_hints: None,
            });
            if entry.label.is_none() { entry.label = e.label.clone(); }
            if let Some(pin) = e.is_pinned { entry.is_pinned = Some(entry.is_pinned.unwrap_or(false) || pin); }
        }
    }

    // Sort: pinned first, then label (ci), then id
    let mut rows: Vec<EnvironmentRowNapi> = map.into_values().collect();
    rows.sort_by(|a, b| {
        let pa = a.is_pinned.unwrap_or(false);
        let pb = b.is_pinned.unwrap_or(false);
        match pb.cmp(&pa) {
            std::cmp::Ordering::Equal => {
                let al = a.label.as_deref().unwrap_or("").to_lowercase();
                let bl = b.label.as_deref().unwrap_or("").to_lowercase();
                match al.cmp(&bl) { std::cmp::Ordering::Equal => a.id.cmp(&b.id), o => o }
            }
            o => o,
        }
    });
    Ok(rows)
}

#[napi]
pub async fn cloud_tasks_create(config: CloudTasksConfig, opts: CreateTaskOptionsNapi) -> Result<String> {
    let backend = create_backend(config).await.map_err(to_napi_error)?;
    let created: CreatedTask = backend
        .create_task(
            &opts.environment_id,
            &opts.prompt,
            &opts.git_ref,
            opts.qa_mode.unwrap_or(false),
            opts.best_of_n.unwrap_or(1) as usize,
        )
        .await
        .map_err(to_napi_error)?;
    Ok(created.id.0)
}

#[napi]
pub async fn cloud_tasks_get_diff(config: CloudTasksConfig, task_id: String) -> Result<Option<String>> {
    let backend = create_backend(config).await.map_err(to_napi_error)?;
    backend.get_task_diff(TaskId(task_id)).await.map_err(to_napi_error)
}

#[napi]
pub async fn cloud_tasks_get_messages(config: CloudTasksConfig, task_id: String) -> Result<Vec<String>> {
    let backend = create_backend(config).await.map_err(to_napi_error)?;
    backend.get_task_messages(TaskId(task_id)).await.map_err(to_napi_error)
}

#[napi]
pub async fn cloud_tasks_get_text(config: CloudTasksConfig, task_id: String) -> Result<TaskTextNapi> {
    let backend = create_backend(config).await.map_err(to_napi_error)?;
    let text: TaskText = backend.get_task_text(TaskId(task_id)).await.map_err(to_napi_error)?;
    Ok(to_task_text_napi(text))
}

#[napi]
pub async fn cloud_tasks_list_attempts(
    config: CloudTasksConfig,
    task_id: String,
    turn_id: String,
) -> Result<Vec<TurnAttemptNapi>> {
    let backend = create_backend(config).await.map_err(to_napi_error)?;
    let attempts: Vec<TurnAttempt> = backend
        .list_sibling_attempts(TaskId(task_id), turn_id)
        .await
        .map_err(to_napi_error)?;
    Ok(attempts.into_iter().map(to_turn_attempt_napi).collect())
}

#[napi]
pub async fn cloud_tasks_apply(
    config: CloudTasksConfig,
    task_id: String,
    diff_override: Option<String>,
    preflight: bool,
) -> Result<ApplyOutcomeNapi> {
    let backend = create_backend(config).await.map_err(to_napi_error)?;
    let outcome: ApplyOutcome = if preflight {
        backend.apply_task_preflight(TaskId(task_id), diff_override).await
    } else {
        backend.apply_task(TaskId(task_id), diff_override).await
    }
    .map_err(to_napi_error)?;
    Ok(to_apply_outcome_napi(outcome))
}

async fn create_backend(config: CloudTasksConfig) -> anyhow::Result<Box<dyn CloudBackend>> {
    if config.mock.unwrap_or(false) {
        return Ok(Box::<MockClient>::default());
    }
    let mut client = HttpClient::new(&config.base_url)?;
    let debug = std::env::var("CODEX_DEBUG").ok().as_deref() == Some("1");
    if debug {
        eprintln!(
            "[codex-napi] cloud_tasks: base_url={} mock={}",
            &config.base_url,
            config.mock.unwrap_or(false)
        );
    }

    // If bearer_token is provided, use it, otherwise attempt to load CLI-managed ChatGPT auth
    if let Some(token) = config.bearer_token {
        client = client.with_bearer_token(token);
        if let Some(id) = config.chatgpt_account_id {
            client = client.with_chatgpt_account_id(id);
        }
    } else {
        if let Some(id) = config.chatgpt_account_id.clone() {
            client = client.with_chatgpt_account_id(id);
        }
        let codex_home_path = if let Some(home) = &config.codex_home {
            std::path::PathBuf::from(home)
        } else {
            config::find_codex_home()?
        };
        if debug {
            eprintln!("[codex-napi] cloud_tasks: using CODEX_HOME={}", codex_home_path.display());
        }
        if let Ok(()) = std::fs::metadata(&codex_home_path).map(|_| ()) {
            // Prefer ChatGPT tokens from auth.json when available (like CLI's ChatGPT client).
            let auth_file = codex_core::auth::get_auth_file(&codex_home_path);
            if let Ok(auth) = codex_core::auth::try_read_auth_json(&auth_file) {
                let token = auth.tokens.as_ref().map(|t| t.access_token.clone()).unwrap_or_default();
                if !token.is_empty() {
                    if debug { eprintln!("[codex-napi] cloud_tasks: attached bearer token (len={})", token.len()); }
                    client = client.with_bearer_token(token.clone());
                    // Account id from auth.json or parsed from token
                    let account_id = auth
                        .tokens
                        .as_ref()
                        .and_then(|t| t.account_id.clone())
                        .or_else(|| extract_chatgpt_account_id(&token));
                    if let Some(acc) = account_id {
                        if debug { eprintln!("[codex-napi] cloud_tasks: attached ChatGPT-Account-Id={}", acc); }
                        client = client.with_chatgpt_account_id(acc);
                    } else if debug {
                        eprintln!("[codex-napi] cloud_tasks: no ChatGPT-Account-Id found");
                    }
                } else if debug {
                    eprintln!("[codex-napi] cloud_tasks: no ChatGPT token in auth.json; falling back to AuthManager");
                }
            }

            // Fallback to AuthManager for legacy flows/refresh when needed
            let auth_manager = AuthManager::shared(codex_home_path, false);
            if let Some(auth) = auth_manager.auth() {
                let mut maybe_token: Option<String> = None;
                match auth.get_token().await {
                    Ok(tok) => {
                        if !tok.is_empty() {
                            if debug { eprintln!("[codex-napi] cloud_tasks: (fallback) attached bearer token (len={})", tok.len()); }
                            client = client.with_bearer_token(tok.clone());
                            maybe_token = Some(tok);
                        } else if debug { eprintln!("[codex-napi] cloud_tasks: (fallback) token empty"); }
                    }
                    Err(e) => {
                        if debug { eprintln!("[codex-napi] cloud_tasks: (fallback) failed to read token: {}", e); }
                    }
                }
                if let Some(acc) = auth.get_account_id().or_else(|| maybe_token.as_deref().and_then(extract_chatgpt_account_id)) {
                    if debug { eprintln!("[codex-napi] cloud_tasks: (fallback) attached ChatGPT-Account-Id={}", acc); }
                    client = client.with_chatgpt_account_id(acc);
                }
            }
        }
    }

    if let Some(ua) = config.user_agent {
        client = client.with_user_agent(ua);
    }
    Ok(Box::new(client))
}

fn extract_chatgpt_account_id(token: &str) -> Option<String> {
    // Parse JWT: header.payload.signature
    let mut parts = token.split('.');
    let (_h, payload_b64, _s) = match (parts.next(), parts.next(), parts.next()) {
        (Some(h), Some(p), Some(s)) if !h.is_empty() && !p.is_empty() && !s.is_empty() => (h, p, s),
        _ => return None,
    };
    let payload_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(payload_b64.as_bytes()).ok()?;
    let v: JsonValue = serde_json::from_slice(&payload_bytes).ok()?;
    v.get("https://api.openai.com/auth")
        .and_then(|auth| auth.get("chatgpt_account_id"))
        .and_then(|id| id.as_str())
        .map(|s| s.to_string())
}

fn normalize_base_url(input: &str) -> String {
    let mut base_url = input.to_string();
    while base_url.ends_with('/') { base_url.pop(); }
    if (base_url.starts_with("https://chatgpt.com") || base_url.starts_with("https://chat.openai.com"))
        && !base_url.contains("/backend-api")
    {
        base_url = format!("{base_url}/backend-api");
    }
    base_url
}

async fn build_chatgpt_headers(config: &CloudTasksConfig) -> HeaderMap {
    use reqwest::header::HeaderValue;
    let mut headers = HeaderMap::new();
    let ua = config.user_agent.clone().unwrap_or_else(|| "codex-ts-sdk".to_string());
    headers.insert(USER_AGENT, HeaderValue::from_str(&ua).unwrap_or(HeaderValue::from_static("codex-ts-sdk")));

    // Prefer explicit bearer/chatgpt_account from config;
    if let Some(token) = &config.bearer_token {
        let v = format!("Bearer {token}");
        if let Ok(hv) = HeaderValue::from_str(&v) { headers.insert(AUTHORIZATION, hv); }
        if let Some(acc) = &config.chatgpt_account_id {
            if let Ok(name) = HeaderName::from_bytes(b"ChatGPT-Account-Id") {
                if let Ok(hv) = HeaderValue::from_str(acc) {
                    headers.insert(name, hv);
                }
            }
        }
        return headers;
    }

    // Else mirror create_backend’s CLI-managed auth
    let codex_home_path = if let Some(home) = &config.codex_home {
        std::path::PathBuf::from(home)
    } else {
        match config::find_codex_home() { Ok(p) => p, Err(_) => return headers }
    };
    if let Ok(auth) = codex_core::auth::try_read_auth_json(&codex_core::auth::get_auth_file(&codex_home_path)) {
        if let Some(token) = auth.tokens.as_ref().map(|t| t.access_token.clone()).filter(|t| !t.is_empty()) {
            let v = format!("Bearer {token}");
            if let Ok(hv) = HeaderValue::from_str(&v) { headers.insert(AUTHORIZATION, hv); }
            let account_id = auth.tokens.as_ref().and_then(|t| t.account_id.clone()).or_else(|| extract_chatgpt_account_id(&token));
            if let Some(acc) = account_id {
                if let Ok(name) = HeaderName::from_bytes(b"ChatGPT-Account-Id") {
                    if let Ok(hv) = HeaderValue::from_str(&acc) {
                        headers.insert(name, hv);
                    }
                }
            }
            return headers;
        }
    }

    let auth_manager = AuthManager::shared(codex_home_path, false);
    if let Some(auth) = auth_manager.auth() {
        if let Ok(token) = auth.get_token().await {
            if !token.is_empty() {
                let v = format!("Bearer {token}");
                if let Ok(hv) = HeaderValue::from_str(&v) { headers.insert(AUTHORIZATION, hv); }
                let acc = auth.get_account_id().or_else(|| extract_chatgpt_account_id(&token));
                if let Some(acc) = acc {
                    if let Ok(name) = HeaderName::from_bytes(b"ChatGPT-Account-Id") {
                        if let Ok(hv) = HeaderValue::from_str(&acc) {
                            headers.insert(name, hv);
                        }
                    }
                }
            }
        }
    }
    headers
}

#[derive(Debug, Clone, serde::Deserialize)]
struct CodeEnvironment {
    id: String,
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    is_pinned: Option<bool>,
}

async fn get_envs(client: &reqwest::Client, url: &str, headers: &HeaderMap) -> anyhow::Result<Vec<CodeEnvironment>> {
    let res = client.get(url).headers(headers.clone()).send().await?;
    let status = res.status();
    let body = res.text().await.unwrap_or_default();
    if !status.is_success() {
        anyhow::bail!("GET {url} failed: {status}; body={body}");
    }
    let rows: Vec<CodeEnvironment> = serde_json::from_str(&body)?;
    Ok(rows)
}

fn get_git_origins() -> Vec<String> {
    // git config --get-regexp remote..*.url
    let out = std::process::Command::new("git").args(["config", "--get-regexp", "remote\\..*\\.url"]).output();
    if let Ok(ok) = out {
        if ok.status.success() {
            let s = String::from_utf8_lossy(&ok.stdout);
            let mut v = Vec::new();
            for line in s.lines() { if let Some((_, url)) = line.split_once(' ') { v.push(url.trim().to_string()); } }
            if !v.is_empty() { v.sort(); v.dedup(); return v; }
        }
    }
    // fallback: git remote -v
    let out = std::process::Command::new("git").args(["remote", "-v"]).output();
    if let Ok(ok) = out {
        if ok.status.success() {
            let s = String::from_utf8_lossy(&ok.stdout);
            let mut v = Vec::new();
            for line in s.lines() { let parts: Vec<&str> = line.split_whitespace().collect(); if parts.len() >= 2 { v.push(parts[1].to_string()); } }
            if !v.is_empty() { v.sort(); v.dedup(); return v; }
        }
    }
    Vec::new()
}

fn parse_owner_repo(url: &str) -> Option<(String, String)> {
    let mut s = url.trim().to_string();
    if let Some(rest) = s.strip_prefix("ssh://") { s = rest.to_string(); }
    if let Some(idx) = s.find("@github.com:") {
        let rest = &s[idx + "@github.com:".len()..];
        let rest = rest.trim_start_matches('/').trim_end_matches(".git");
        let mut parts = rest.splitn(2, '/');
        return Some((parts.next()?.to_string(), parts.next()?.to_string()));
    }
    for prefix in ["https://github.com/", "http://github.com/", "git://github.com/", "github.com/"] {
        if let Some(rest) = s.strip_prefix(prefix) {
            let rest = rest.trim_start_matches('/').trim_end_matches(".git");
            let mut parts = rest.splitn(2, '/');
            return Some((parts.next()?.to_string(), parts.next()?.to_string()));
        }
    }
    None
}

fn to_napi_error<E: std::fmt::Display>(e: E) -> napi::Error {
    napi::Error::from_reason(e.to_string())
}

fn to_task_summary_napi(t: TaskSummary) -> TaskSummaryNapi {
    TaskSummaryNapi {
        id: t.id.0,
        title: t.title,
        status: status_to_string(&t.status),
        updated_at: t.updated_at.to_rfc3339(),
        created_at: None,
        has_generated_title: None,
        environment_id: t.environment_id,
        environment_label: t.environment_label,
        summary: DiffSummaryNapi {
            files_changed: t.summary.files_changed as u32,
            lines_added: t.summary.lines_added as u32,
            lines_removed: t.summary.lines_removed as u32,
        },
        is_review: t.is_review,
        attempt_total: t.attempt_total.map(|v| v as u32),
        archived: None,
        has_unread_turn: None,
        branch_name: None,
        turn_id: None,
        turn_status: None,
        sibling_turn_ids: None,
        intent: None,
        initial_intent: None,
        fix_task_id: None,
        pull_requests: None, // TODO: Add PR parsing
    }
}

fn to_apply_outcome_napi(o: ApplyOutcome) -> ApplyOutcomeNapi {
    ApplyOutcomeNapi {
        applied: o.applied,
        status: apply_status_to_string(&o.status),
        message: o.message,
        skipped_paths: o.skipped_paths,
        conflict_paths: o.conflict_paths,
    }
}

fn to_task_text_napi(t: TaskText) -> TaskTextNapi {
    TaskTextNapi {
        prompt: t.prompt,
        messages: t.messages,
        turn_id: t.turn_id,
        sibling_turn_ids: t.sibling_turn_ids,
        attempt_placement: t.attempt_placement.map(|v| v as u32),
        attempt_status: Some(attempt_status_to_string(&t.attempt_status)),
    }
}

fn to_turn_attempt_napi(a: TurnAttempt) -> TurnAttemptNapi {
    TurnAttemptNapi {
        turn_id: a.turn_id,
        attempt_placement: a.attempt_placement.map(|v| v as u32),
        created_at: a.created_at.map(|dt| dt.to_rfc3339()),
        status: attempt_status_to_string(&a.status),
        diff: a.diff,
        messages: a.messages,
    }
}

fn status_to_string(s: &TaskStatus) -> String {
    match s {
        TaskStatus::Pending => "pending".to_string(),
        TaskStatus::Ready => "ready".to_string(),
        TaskStatus::Applied => "applied".to_string(),
        TaskStatus::Error => "error".to_string(),
    }
}

fn apply_status_to_string(s: &ApplyStatus) -> String {
    match s {
        ApplyStatus::Success => "success".to_string(),
        ApplyStatus::Partial => "partial".to_string(),
        ApplyStatus::Error => "error".to_string(),
    }
}

fn attempt_status_to_string(s: &AttemptStatus) -> String {
    match s {
        AttemptStatus::Pending => "pending".to_string(),
        AttemptStatus::InProgress => "in-progress".to_string(),
        AttemptStatus::Completed => "completed".to_string(),
        AttemptStatus::Failed => "failed".to_string(),
        AttemptStatus::Cancelled => "cancelled".to_string(),
        AttemptStatus::Unknown => "unknown".to_string(),
    }
}
