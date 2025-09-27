use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use codex_core::config::{self, Config, ConfigOverrides};
use codex_core::{CodexConversation, ConversationManager};
use codex_core::protocol::{Event, EventMsg, Submission};
use codex_core::AuthManager;
use codex_protocol::mcp_protocol::ConversationId;
use napi_derive::napi;

struct SessionInner {
    conversation_id: ConversationId,
    conversation: Arc<CodexConversation>,
    manager: Arc<ConversationManager>,
    pending: Mutex<VecDeque<Event>>,
}

#[napi(object)]
pub struct ConfigOverrideEntry {
    pub key: String,
    pub value: String,
}

#[napi(object)]
pub struct CreateConversationOptions {
    pub overrides: Option<Vec<ConfigOverrideEntry>>,
}

#[napi(object)]
pub struct NativeCodexOptions {
    pub codex_home: Option<String>,
}

#[napi]
pub struct CodexSession {
    inner: Arc<SessionInner>,
}

#[napi]
impl CodexSession {
    #[napi(getter)]
    pub fn conversation_id(&self) -> String {
        self.inner.conversation_id.to_string()
    }

    #[napi]
    pub async fn next_event(&self) -> napi::Result<Option<String>> {
        if let Some(event) = self.inner.pending.lock().unwrap().pop_front() {
            return serialize_event(event).map(Some);
        }

        match self.inner.conversation.next_event().await {
            Ok(event) => serialize_event(event).map(Some),
            Err(err) => {
                if err.to_string().contains("StreamClosed") {
                    Ok(None)
                } else {
                    Err(napi::Error::from_reason(err.to_string()))
                }
            }
        }
    }

    #[napi]
    pub async fn submit(&self, submission_json: String) -> napi::Result<()> {
        let submission: Submission = serde_json::from_str(&submission_json)
            .map_err(|err| napi::Error::from_reason(err.to_string()))?;
        self.inner
            .conversation
            .submit_with_id(submission)
            .await
            .map_err(|err| napi::Error::from_reason(err.to_string()))
    }

    #[napi]
    pub async fn close(&self) -> napi::Result<()> {
        self.inner
            .manager
            .remove_conversation(&self.inner.conversation_id)
            .await;
        Ok(())
    }
}

#[napi]
pub struct NativeCodex {
    manager: Arc<ConversationManager>,
}

#[napi]
impl NativeCodex {
    #[napi(constructor)]
    pub fn new(options: Option<NativeCodexOptions>) -> napi::Result<Self> {
        // Set the originator to identify as codex_cli_rs for consistent server-side treatment
        std::env::set_var("CODEX_INTERNAL_ORIGINATOR_OVERRIDE", "codex_cli_rs");

        let codex_home = if let Some(opts) = options.and_then(|o| o.codex_home) {
            std::path::PathBuf::from(opts)
        } else {
            config::find_codex_home()
                .map_err(|err| napi::Error::from_reason(err.to_string()))?
        };

        let auth_manager = AuthManager::shared(codex_home);
        let manager = ConversationManager::new(auth_manager);

        Ok(Self {
            manager: Arc::new(manager),
        })
    }

    #[napi]
    pub async fn create_conversation(
        &self,
        options: Option<CreateConversationOptions>,
    ) -> napi::Result<CodexSession> {
        let overrides = match options.and_then(|o| o.overrides) {
            Some(entries) => parse_overrides(entries)?,
            None => Vec::new(),
        };

        let config = Config::load_with_cli_overrides(overrides, ConfigOverrides::default())
            .map_err(|err| napi::Error::from_reason(err.to_string()))?;

        let new_conversation = self
            .manager
            .new_conversation(config)
            .await
            .map_err(|err| napi::Error::from_reason(err.to_string()))?;

        let session_configured_event = Event {
            id: String::new(),
            msg: EventMsg::SessionConfigured(new_conversation.session_configured),
        };

        let inner = SessionInner {
            conversation_id: new_conversation.conversation_id,
            conversation: new_conversation.conversation,
            manager: self.manager.clone(),
            pending: Mutex::new(VecDeque::from([session_configured_event])),
        };

        Ok(CodexSession {
            inner: Arc::new(inner),
        })
    }
}

fn parse_overrides(entries: Vec<ConfigOverrideEntry>) -> napi::Result<Vec<(String, toml::Value)>> {
    let mut result = Vec::with_capacity(entries.len());
    for entry in entries {
        let value = parse_toml_value(&entry.value).unwrap_or_else(|| toml::Value::String(entry.value));
        result.push((entry.key, value));
    }
    Ok(result)
}

fn parse_toml_value(raw: &str) -> Option<toml::Value> {
    let wrapped = format!("_x_ = {}", raw);
    toml::from_str::<toml::Value>(&wrapped)
        .ok()
        .and_then(|value| value.get("_x_").cloned())
}

fn serialize_event(event: Event) -> napi::Result<String> {
    // Serialize the event directly - rate limits come from actual API responses
    serde_json::to_string(&event).map_err(|err| napi::Error::from_reason(err.to_string()))
}

fn resolved_version() -> &'static str {
    option_env!("CODEX_CLI_VERSION")
        .or_else(|| option_env!("CODEX_RS_VERSION"))
        .unwrap_or("0.0.0")
}

#[napi]
pub fn version() -> String {
    resolved_version().to_string()
}

#[napi]
pub fn cli_version() -> String {
    resolved_version().to_string()
}
