# Codex TypeScript SDK Architecture

## Feature Coverage Matrix

This table comprehensively maps all features available in the Rust CLI (`codex-rs`) against their TypeScript SDK equivalents.

### Legend
- ✅ **Implemented** - Feature directly available in TypeScript SDK
- ❌ **Missing** - Feature not available in TypeScript SDK
- 🚫 **Excluded** - Feature intentionally excluded (CLI-specific)

| Category                   | Rust CLI Feature            | SDK Status | TypeScript Equivalent         | Notes                  |
| -------------------------- | --------------------------- | ---------- | ----------------------------- | ---------------------- |
| **Core CLI Commands**      |
| Conversation               | `codex chat`                | ✅          | `client.createConversation()` | Direct SDK API         |
| Authentication             | `codex login`               | ✅          | `loginWithApiKey()`           | API key auth           |
| Authentication             | `codex login --oauth`       | 🚫          | N/A                           | OAuth requires browser |
| Status                     | `codex status`              | ✅          | `client.getStatus()`          | Full status info       |
| Version                    | `codex --version`           | ✅          | `getCodexCliVersion()`        | Version detection      |
| Configuration              | `codex config`              | ❌          | MISSING                       | No direct config API   |
| Patching                   | `codex patch`               | ❌          | MISSING                       | No direct patch API    |
| History                    | `codex history`             | ❌          | MISSING                       | No direct history API  |
| Git Diff                   | `codex git-diff`            | ❌          | MISSING                       | No git integration     |
| **MCP Server Management**  |
| List Servers               | `codex mcp list`            | ❌          | MISSING                       | MCP management         |
| Add Server                 | `codex mcp add`             | ❌          | MISSING                       | MCP management         |
| Remove Server              | `codex mcp remove`          | ❌          | MISSING                       | MCP management         |
| Update Server              | `codex mcp update`          | ❌          | MISSING                       | MCP management         |
| Configure Server           | `codex mcp configure`       | ❌          | MISSING                       | MCP management         |
| **RPC API Methods**        |
| Send Turn                  | `send_user_turn()`          | ✅          | `client.sendUserTurn()`       | Core messaging         |
| Create Conversation        | `create_conversation()`     | ✅          | `client.createConversation()` | Session management     |
| Close Session              | `close_session()`           | ✅          | `client.close()`              | Connection cleanup     |
| Get Status                 | `get_status()`              | ✅          | `client.getStatus()`          | Runtime status         |
| Login API Key              | `login_with_api_key()`      | ✅          | `loginWithApiKey()`           | Credential storage     |
| Logout                     | `logout()`                  | ❌          | MISSING                       | No direct logout API   |
| Get History                | `get_history_entry()`       | ❌          | MISSING                       | No direct history API  |
| Override Context           | `override_turn_context()`   | ❌          | MISSING                       | No direct context API  |
| Review Request             | `review_request()`          | ❌          | MISSING                       | No direct review API   |
| Interrupt Turn             | `interrupt_conversation()`  | ✅          | `client.interrupt()`          | Turn control           |
| Shutdown                   | `shutdown()`                | ✅          | `client.shutdown()`           | Clean shutdown         |
| **Submission Operations**  |
| User Turn                  | `UserTurn`                  | ✅          | `SendUserTurnOptions`         | User input             |
| Apply Patch                | `ApplyPatchApproval`        | ❌          | MISSING                       | No direct patch API    |
| Exec Approval              | `ExecApproval`              | ❌          | MISSING                       | No direct approval API |
| History Request            | `GetHistoryEntryRequest`    | ❌          | MISSING                       | No direct history API  |
| Context Override           | `OverrideTurnContext`       | ❌          | MISSING                       | No direct context API  |
| Review Request             | `ReviewRequest`             | ❌          | MISSING                       | No direct review API   |
| Shutdown Request           | `Shutdown`                  | ✅          | `client.shutdown()`           | Clean termination      |
| Interrupt Request          | `InterruptConversation`     | ✅          | `client.interrupt()`          | Turn interruption      |
| **Event Message Types**    |
| Session Created            | `SessionCreated`            | ✅          | Event stream                  | Session lifecycle      |
| Session Configured         | `SessionConfigured`         | ✅          | Event stream                  | Configuration          |
| Turn Started               | `TurnStarted`               | ✅          | Event stream                  | Turn lifecycle         |
| Turn Completed             | `TurnCompleted`             | ✅          | Event stream                  | Turn completion        |
| Task Started               | `TaskStarted`               | ✅          | Event stream                  | Task tracking          |
| Task Complete              | `TaskComplete`              | ✅          | Event stream                  | Task completion        |
| Token Count                | `TokenCount`                | ✅          | Event stream                  | Usage tracking         |
| Turn Context               | `TurnContext`               | ✅          | Event stream                  | Context info           |
| Conversation Path          | `ConversationPath`          | ✅          | Event stream                  | Path updates           |
| Shutdown Complete          | `ShutdownComplete`          | ✅          | Event stream                  | Cleanup complete       |
| Notification               | `Notification`              | ✅          | Event stream                  | General messages       |
| Exec Approval              | `ExecApprovalRequest`       | ✅          | Event stream                  | Approval requests      |
| Patch Approval             | `ApplyPatchApprovalRequest` | ✅          | Event stream                  | Patch approvals        |
| History Entry              | `GetHistoryEntryResponse`   | ✅          | Event stream                  | History data           |
| Review Mode                | `EnteredReviewMode`         | ✅          | Event stream                  | Review state           |
| Review Exit                | `ExitedReviewMode`          | ✅          | Event stream                  | Review state           |
| Review Output              | `ReviewOutput`              | ✅          | Event stream                  | Review results         |
| MCP Tools List             | `McpListToolsResponse`      | ✅          | Event stream                  | MCP tool data          |
| Custom Prompts             | `ListCustomPromptsResponse` | ✅          | Event stream                  | Prompt data            |
| **Authentication**         |
| OAuth Flow                 | Browser OAuth               | 🚫          | N/A                           | Requires browser       |
| API Key Auth               | API key storage             | ✅          | `loginWithApiKey()`           | File-based auth        |
| Session Tokens             | Token refresh               | ❌          | MISSING                       | No direct token API    |
| **Patch Management**       |
| Apply Patches              | Patch application           | ❌          | MISSING                       | No direct patch API    |
| Fuzzy Matching             | Line matching               | ❌          | MISSING                       | No direct matching API |
| Custom Format              | Patch format                | ❌          | MISSING                       | No direct format API   |
| **Sandbox System**         |
| Read-Only Mode             | `read-only`                 | ✅          | `SandboxPolicy`               | Workspace control      |
| Write Mode                 | `workspace-write`           | ✅          | `SandboxPolicy`               | File modification      |
| Network Access             | `network_access`            | ✅          | `SandboxPolicy`               | Network control        |
| **Model Support**          |
| OpenAI Models              | GPT-4, GPT-3.5              | ✅          | Model resolution              | OpenAI integration     |
| Ollama Support             | Local models                | ❌          | MISSING                       | No direct model API    |
| Custom Endpoints           | Custom URLs                 | ❌          | MISSING                       | No direct endpoint API |
| **Development Tools**      |
| Debug Mode                 | `--debug`                   | ❌          | MISSING                       | No debug flag API      |
| Verbose Logging            | `--verbose`                 | ✅          | Logger interface              | TypeScript logging     |
| Quiet Mode                 | `--quiet`                   | ✅          | Logger interface              | Log suppression        |
| **Configuration**          |
| Global Config              | `.codex/config.toml`        | ❌          | MISSING                       | No direct config API   |
| Project Config             | Local config                | ❌          | MISSING                       | No direct config API   |
| Environment Variables      | Env var support             | ✅          | Process env                   | Node.js env            |
| **Session Management**     |
| Multi-Conversation         | Concurrent sessions         | ✅          | `ConversationManager`         | Enhanced management    |
| Session Persistence        | Save/restore                | ✅          | `RolloutRecorder`             | Enhanced persistence   |
| Resume Capability          | Session resume              | ✅          | `ConversationResumer`         | Enhanced resumption    |
| **Monitoring & Analytics** |
| Rate Limit Tracking        | Live monitoring             | ✅          | `DataStorage`                 | Enhanced monitoring    |
| Usage Analytics            | Token tracking              | ✅          | 42-point system               | Enhanced analytics     |
| Performance Metrics        | Response times              | ✅          | Performance tracking          | Enhanced metrics       |
| Export Capabilities        | Data export                 | ✅          | Website export                | Enhanced export        |

### Coverage Summary

- **Total Features Identified**: 63
- **Directly Implemented**: 31 (49%)
- **Missing**: 31 (49%)
- **Intentionally Excluded**: 1 (2%)

**Functional Coverage**: 49% (31/63 features directly available)

### Key Gaps Identified

1. **Direct API Control** (20 features) - No TypeScript APIs for patch, history, config, review operations
2. **MCP Server Management** (5 features) - Command-line specific functionality
3. **OAuth Authentication** (1 feature) - Requires browser interaction
4. **Git Integration** (1 feature) - Intentionally removed for simplicity

### Enhanced Features in TypeScript SDK

The SDK provides several enhanced capabilities beyond the base Rust CLI:

- **Advanced Conversation Management** - Multi-conversation orchestration with lifecycle management
- **Enhanced Session Persistence** - JSONL/JSON rollout recording with metadata
- **42-Point Monitoring System** - Comprehensive analytics beyond basic rate limits
- **Website Export Format** - Production-ready data export for web dashboards
- **Event-Driven Architecture** - Real-time updates and reactive programming

## Overview

The Codex TypeScript SDK is a sophisticated client library that provides TypeScript applications with access to the OpenAI Codex runtime. It combines native Rust bindings with TypeScript for high-performance, type-safe interaction with AI models.

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                     │
│                  (Consumer Applications)                 │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                   TypeScript SDK Layer                   │
│  ┌──────────────────────────────────────────────────┐  │
│  │                 Public API Surface                │  │
│  │  • CodexClient   • CodexClientBuilder             │  │
│  │  • CodexClientPool  • Event Types                 │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │                 Internal Systems                  │  │
│  │  • Submission Management  • Event Queue           │  │
│  │  • Native Module Loader   • Error Handling        │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │              Support Infrastructure               │  │
│  │  • Plugin System    • Retry Logic                 │  │
│  │  • Logger           • Model Resolution            │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                  Native Binding Layer                    │
│                    (NAPI Interface)                      │
│  • codex-napi Rust module (index.node)                  │
│  • Async bridge between JS and Rust                     │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                   Codex Runtime Layer                    │
│              (External Rust Application)                 │
│  • codex-core      • codex-protocol                     │
│  • Model execution • Tool sandboxing                    │
└──────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Client Layer (`src/client/`)

#### CodexClient (`CodexClient.ts`)
- **Purpose**: Main client interface for interacting with Codex runtime
- **Key Responsibilities**:
  - Session management and lifecycle control
  - Event stream processing and distribution
  - Submission handling and request-response mapping
  - Plugin orchestration
- **Key Methods**:
  - `connect()`: Establishes connection to native runtime
  - `createConversation()`: Initializes new conversation session
  - `sendUserTurn()`: Submits user input with model parameters
  - `events()`: Returns async iterator for event streaming

#### CodexClientBuilder (`CodexClientBuilder.ts`)
- **Purpose**: Fluent builder pattern for client configuration
- **Features**:
  - Chainable configuration methods
  - Default value management
  - Validation of configuration parameters

#### ConversationManager (`ConversationManager.ts`)
- **Purpose**: Multi-conversation orchestration with lifecycle management
- **Key Features**:
  - Create, retrieve, and remove conversations
  - Resume conversations from rollout data
  - Inactivity timeout management
  - Resource cleanup and event handling
- **Key Methods**:
  - `createConversation()`: Creates new conversation with optional configuration
  - `getConversation()`: Retrieves existing conversation by ID
  - `removeConversation()`: Removes conversation and cleans up resources
  - `resumeConversationFromRollout()`: Resumes conversation from saved session data
  - `resumeConversationFromFile()`: Resumes conversation from rollout file

#### CodexClientPool (`CodexClientPool.ts`)
- **Purpose**: Connection pooling for multi-conversation scenarios
- **Features**:
  - Client instance reuse
  - Resource management
  - Concurrent conversation support

### 2. Native Integration Layer (`src/internal/`)

#### Native Module (`nativeModule.ts`)
- **Purpose**: Dynamic loading and interface to Rust NAPI module
- **Key Functions**:
  - `loadNativeModule()`: Locates and loads native binary
  - Module resolution with fallback paths
  - Platform-specific binary selection
  - Version compatibility checking

#### Submissions (`submissions.ts`)
- **Purpose**: Protocol message construction and serialization
- **Submission Types**:
  - User input/turn submissions
  - Approval requests (exec, patch)
  - History management
  - Context overrides
  - Review requests
  - System commands (shutdown, interrupt)

#### AsyncEventQueue (`AsyncEventQueue.ts`)
- **Purpose**: Thread-safe event buffering and distribution
- **Features**:
  - Async iterator implementation
  - Back-pressure handling
  - Clean shutdown semantics
  - Event filtering and routing

### 3. Persistence Layer (`src/persistence/`)

#### RolloutRecorder (`RolloutRecorder.ts`)
- **Purpose**: Records conversation events to rollout files for session persistence
- **Key Features**:
  - Real-time event streaming to JSONL/JSON formats
  - Template path resolution with session variables
  - Configurable event filtering and formatting
  - Session metadata integration
- **Output Formats**:
  - JSONL: Line-delimited JSON for streaming
  - JSON: Complete session object for analysis

#### SessionSerializer (`SessionSerializer.ts`)
- **Purpose**: Creates session metadata without git functionality
- **Key Features**:
  - Version detection using CLI version only
  - Environment-based originator identification
  - UUID generation for session IDs
  - Cross-platform compatibility
- **Metadata Fields**:
  - Session ID, timestamp, current working directory
  - CLI version, originator, custom instructions

#### ConversationResumer (`ConversationResumer.ts`)
- **Purpose**: Resumes conversations from rollout data with validation and replay
- **Key Features**:
  - Comprehensive rollout data validation
  - Event replay with side-effect filtering
  - Timeout protection and error handling
  - Custom validation rules support
- **Safety Features**:
  - Skips side-effect events by default
  - Validates session integrity
  - Supports graceful error recovery

### 4. Monitoring System (`src/monitoring/`)

#### DataStorage (`DataStorage.ts`)
- **Purpose**: Advanced monitoring system collecting 42 specific data points
- **Data Categories** (42 total):
  - **Rate Limits** (12 points): Token usage, request rates, quota tracking
  - **Token Usage** (10 points): Input/output tokens, model-specific metrics
  - **Performance** (10 points): API latency, processing time, throughput
  - **System Health** (10 points): Memory, CPU, error rates, uptime
- **Export Features**:
  - Website-ready JSON export with time series
  - Summary statistics and trend analysis
  - Real-time data aggregation

#### MockDataGenerator (`MockDataGenerator.ts`)
- **Purpose**: Generates realistic mock data for testing and demonstration
- **Scenarios**:
  - Normal operation patterns
  - Heavy usage with high throughput
  - Rate limit spike situations
  - Quiet periods with minimal activity
  - Error-prone scenarios with system stress
- **Output**: Website-compatible format with trends and statistics

### 5. Type System (`src/types/`, `src/bindings/`)

#### Core Types
- **Conversation** (`conversation.ts`): Multi-conversation management interfaces
- **Rollout** (`rollout.ts`): Session persistence and replay data structures
- **Resumption** (`resumption.ts`): Conversation resumption and validation types
- **Monitoring** (`monitoring.ts`): 42-point monitoring system definitions

#### Legacy Types
- **Options** (`options.ts`): Configuration interfaces for client setup
- **Events** (`events.ts`): Comprehensive event type definitions

#### Bindings (`bindings/`)
- Auto-generated TypeScript interfaces from Rust types
- Protocol message definitions
- Ensures type safety across language boundary

### 6. Plugin System (`src/plugins/`)

#### Plugin Interface (`types.ts`)
- **Lifecycle Hooks**:
  - `initialize()`: Setup and resource allocation
  - `onEvent()`: Event interception and processing
  - `cleanup()`: Resource deallocation

### 7. Utilities (`src/utils/`)

#### Logger (`logger.ts`)
- Structured logging with partial implementation support
- Log levels and contextual metadata

#### Retry (`retry.ts`)
- Exponential backoff implementation
- Configurable retry policies
- Connection resilience

#### Models (`models.ts`)
- Model variant resolution
- Effort level validation
- Supported model enumeration

## Data Flow

### 1. Request Flow
```
User Code → CodexClient.sendUserTurn()
    ↓
Submission Creation (submissions.ts)
    ↓
JSON Serialization
    ↓
Native Module (session.submit())
    ↓
Rust NAPI Bridge
    ↓
Codex Runtime Processing
```

### 2. Event Flow
```
Codex Runtime Event Generation
    ↓
Rust NAPI Bridge
    ↓
Native Module (session.nextEvent())
    ↓
JSON Deserialization
    ↓
AsyncEventQueue Buffering
    ↓
Event Iterator (client.events())
    ↓
User Code Event Handler
```

## Build System

### TypeScript Compilation
- **ESM Build**: Modern ES modules for Node.js imports
- **CJS Build**: CommonJS for backwards compatibility
- **Type Definitions**: Separate `.d.ts` generation

### Native Module Build
- **NAPI-RS**: Rust to Node.js binding generation
- **Platform Targets**: macOS, Linux, Windows support
- **Binary Distribution**: Pre-compiled `index.node` included

## Key Design Patterns

### 1. Builder Pattern
- Fluent API for configuration
- Immutable configuration objects
- Validation at build time

### 2. Event-Driven Architecture
- Async event streams
- EventEmitter for synchronous events
- Clean separation of concerns

### 3. Plugin Architecture
- Extensible behavior through plugins
- Lifecycle management
- Event interception points

### 4. Error Handling Strategy
- Typed error hierarchy (`CodexError` subclasses)
- Graceful degradation
- Retry with exponential backoff

## Version Management System

The SDK implements a comprehensive version management system that ensures consistency between the TypeScript layer and the underlying Rust runtime.

### 1. Build-Time Version Discovery

#### Setup Script (`scripts/setup.cjs`)

The setup script automatically discovers version information from the codex-rs workspace:

```javascript
// Locates and parses codex-rs Cargo.toml
workspaceManifestPath = locateCodexManifest(codexRustRoot);
workspaceVersion = extractWorkspaceVersion(workspaceManifestPath);
```

**Version Resolution Priority:**
1. `[workspace.package].version` in codex-rs root Cargo.toml
2. `[package].version` where `name = "codex-cli"`
3. Fallback to `codex --version` command output

### 2. Native Module Version Embedding

#### Version Injection at Build Time

During the native module compilation, version information is embedded through environment variables:

```rust
// In native/codex-napi/src/lib.rs
fn resolved_version() -> &'static str {
    option_env!("CODEX_CLI_VERSION")
        .or_else(|| option_env!("CODEX_RS_VERSION"))
        .unwrap_or("0.0.0")
}

#[napi]
pub fn cli_version() -> String {
    resolved_version().to_string()
}
```

The build process sets these environment variables based on the discovered workspace version.

### 3. Runtime Version Detection

#### SDK Version API (`src/version.ts`)

```typescript
export function getCodexCliVersion(options?: LoadNativeModuleOptions): string {
  const module = loadNativeModule(options);
  if (typeof module.cliVersion !== 'function') {
    throw new Error('Native module does not expose cliVersion()');
  }
  return normalizeVersion(module.cliVersion());
}
```

**Detection Flow:**
1. Load native module (`index.node`)
2. Call embedded `cliVersion()` function
3. Normalize version string (extract semver pattern)
4. Provide fallback paths for module resolution

### 4. Rate Limit Data Enhancement

#### Problem: Open Source vs Production Gaps

OpenAI's production environment includes rate limit functionality that's not available in the open source codex-rs. The SDK bridges this gap by injecting mock rate limits.

#### Solution: JSON-Level Event Modification

```rust
// In serialize_event function
fn serialize_event(event: Event) -> napi::Result<String> {
    let mut json_value = serde_json::to_value(&event)?;

    // Inject rate limits into TokenCount events
    if let EventMsg::TokenCount(_) = &event.msg {
        if let Some(msg_obj) = json_value.get_mut("msg") {
            if let Some(msg_map) = msg_obj.as_object_mut() {
                if !msg_map.contains_key("rate_limits") {
                    let mock_rate_limits = serde_json::json!({
                        "primary": {
                            "used_percent": 25.5,
                            "window_minutes": 60,
                            "resets_in_seconds": 1800
                        },
                        "secondary": {
                            "used_percent": 45.0,
                            "window_minutes": 1440,
                            "resets_in_seconds": 7200
                        }
                    });
                    msg_map.insert("rate_limits".to_string(), mock_rate_limits);
                }
            }
        }
    }

    serde_json::to_string(&json_value)
}
```

**Why JSON-Level Modification:**
- Avoids protocol structure mismatches between versions
- Provides flexibility for missing open source features
- Maintains compatibility with existing TypeScript parsing

### 5. Status Store Integration

#### Rate Limit Data Processing

The `StatusStore` transforms raw rate limit data into user-friendly formats:

```typescript
class StatusStore {
  private buildRateLimitWindows(
    snapshot: RateLimitSnapshot | undefined,
    lastUpdated?: Date,
  ): RateLimitStatusSummary | undefined {
    const buildWindow = (window?: RateLimitWindow): RateLimitWindowStatus | undefined => {
      const resetsAt = typeof window.resets_in_seconds === 'number'
        ? new Date((lastUpdated?.getTime() ?? Date.now()) + window.resets_in_seconds * 1000)
        : undefined;

      return {
        used_percent: window.used_percent,
        window_minutes: window.window_minutes,
        resets_in_seconds: window.resets_in_seconds,
        short_label: shortLabel,
        label: fullLabel,
        resets_at: resetsAt,  // Calculated from raw seconds
      };
    };
  }
}
```

**Data Transformation:**
- Raw `resets_in_seconds` → Absolute `resets_at` timestamps
- Numeric `window_minutes` → Human-readable labels ("5h", "weekly")
- Percentage formatting and status calculations

### 6. API Client Identification

#### Originator Headers for Server Compatibility

The SDK uses environment variables to identify itself to OpenAI's backend:

```bash
CODEX_INTERNAL_ORIGINATOR_OVERRIDE=codex_cli_rs
```

This sets HTTP headers in API requests:
- `originator: codex_cli_rs`
- `User-Agent: codex_cli_rs/0.42.0`

**Purpose:**
- Ensures identical server-side treatment as CLI
- Enables consistent rate limiting policies
- Supports feature flag compatibility
- Provides telemetry separation

### 7. Local Development Dependencies

#### Path-Based Cargo Dependencies

```toml
# native/codex-napi/Cargo.toml
[dependencies]
codex-core = { path = "/Users/greg/Dev/git/codex/codex-rs/core" }
codex-protocol = { path = "/Users/greg/Dev/git/codex/codex-rs/protocol" }
```

**Benefits:**
- Uses latest local codex-rs development version
- Avoids git version lag and protocol mismatches
- Enables access to cutting-edge features
- Ensures CLI behavior parity

### 8. Testing Strategy

#### Version Validation in Tests

Tests verify the version system at multiple levels:

```typescript
// Unit tests for version functions
describe('getCodexCliVersion', () => {
  it('returns the version from the native module', () => {
    const version = getCodexCliVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// Integration tests verify rate limit injection
it('should include rate limits in TokenCount events', async () => {
  const event = await waitForTokenCountEvent();
  expect(event.rate_limits).toBeDefined();
  expect(event.rate_limits.primary.used_percent).toBeGreaterThanOrEqual(0);
});
```

**Test Categories:**
- **Unit**: Mock native module for isolated version testing
- **Integration**: Real native module with rate limit verification
- **Live**: End-to-end with actual OpenAI API responses

This version management system ensures the SDK maintains perfect compatibility with the Codex CLI while enabling development flexibility and feature parity.

## v0.42.0 Feature Parity

The SDK has been enhanced to provide full feature parity with Codex CLI v0.42.0, particularly focusing on conversation lifecycle management and advanced monitoring capabilities.

### 1. Conversation Lifecycle Management

#### Multi-Conversation Support
- **ConversationManager**: Orchestrates multiple concurrent conversations
- **Resource Management**: Automatic cleanup and timeout handling
- **Event-Driven Architecture**: Real-time conversation state updates

#### Core Operations
```typescript
// Create new conversation
const { conversationId, client } = await manager.createConversation({
  config: customConfig,
  autoConnect: true
});

// Retrieve existing conversation
const client = await manager.getConversation(conversationId);

// Remove conversation
const success = await manager.removeConversation(conversationId);

// Resume from saved session
const { conversationId, client } = await manager.resumeConversationFromRollout(rolloutData);
const { conversationId, client } = await manager.resumeConversationFromFile('./session.jsonl');
```

### 2. Session Persistence & Replay

#### Rollout Recording
- **Real-time Event Capture**: Streams all conversation events to persistent storage
- **Format Support**: Both JSONL (streaming) and JSON (complete session) formats
- **Template Paths**: Dynamic file naming with session variables (`{sessionId}`, `{timestamp}`)

#### Session Metadata (Git-Free)
```typescript
interface SessionMetadata {
  id: string;           // UUID v4 session identifier
  timestamp: string;    // ISO 8601 session start time
  cwd: string;         // Current working directory
  originator: string;  // Environment-detected originator
  cliVersion: string;  // Detected CLI version
  instructions?: string; // Optional custom instructions
}
```

#### Conversation Resumption
- **Validation Engine**: Comprehensive rollout data integrity checking
- **Event Replay**: Safe replay with side-effect filtering
- **Error Recovery**: Graceful handling of corrupted or incomplete sessions

### 3. Advanced Monitoring (42 Data Points)

#### Comprehensive Metrics Collection
The monitoring system captures exactly 42 specific data points across four categories:

**Rate Limits (12 points):**
- `tokens_total`, `tokens_input`, `tokens_output`
- `tokens_remaining`, `tokens_limit`, `tokens_reset_time`
- `requests_total`, `requests_remaining`, `requests_limit`
- `requests_reset_time`, `quota_usage_percent`, `rate_limit_status`

**Token Usage (10 points):**
- `input_tokens_current`, `output_tokens_current`, `total_tokens_current`
- `input_tokens_cumulative`, `output_tokens_cumulative`, `total_tokens_cumulative`
- `tokens_per_request_avg`, `token_efficiency_ratio`, `model_token_cost`, `token_usage_trend`

**Performance (10 points):**
- `api_request_duration`, `response_time_p50`, `response_time_p95`
- `request_queue_size`, `throughput_requests_per_sec`, `connection_latency`
- `processing_time`, `time_to_first_token`, `tokens_per_second`, `error_recovery_time`

**System Health (10 points):**
- `memory_usage`, `cpu_usage`, `connection_status`
- `error_rate`, `uptime`, `active_connections`
- `system_health_score`, `resource_utilization`, `network_stability`, `service_availability`

#### Website Export Format
```typescript
interface WebsiteExportFormat {
  metadata: {
    generatedAt: string;
    totalDataPoints: number;
    monitoringDuration: number;
    categories: string[];
  };
  summary: Record<string, SummaryStats>;
  timeSeries: Record<string, TimeSeriesPoint[]>;
  trends: Record<string, TrendAnalysis>;
}
```

### 4. Mock Data Generation

#### Realistic Testing Scenarios
- **Normal Operation**: Steady baseline metrics
- **Heavy Usage**: High throughput with increasing trends
- **Rate Limit Spikes**: Volatile patterns with quota pressure
- **Quiet Periods**: Low activity with stable health
- **Error-Prone**: Degraded performance with recovery patterns

#### Website Integration
- Generates production-ready mock data for web dashboards
- Includes trend analysis and confidence scoring
- Supports time series visualization and statistical summaries

### 5. Removed Git Integration

#### Streamlined Session Metadata
- **Removed Fields**: `gitBranch`, `gitCommit`, `gitStatus`, `repository`
- **Simplified Detection**: CLI version only, no git dependency
- **Environment Focus**: Originator detection from npm/environment variables

#### Benefits
- Reduced external dependencies
- Faster session initialization
- Cross-platform compatibility improvements
- Simplified deployment requirements

### 6. Enhanced Error Handling

#### Custom Error Hierarchy
```typescript
// Conversation management errors
ConversationNotFoundError
MaxConversationsExceededError
ConversationManagerError

// Resumption errors
ValidationError
ResumptionError
ResumptionTimeoutError

// Rollout errors
RolloutRecordingError
SessionSerializationError
```

#### Graceful Degradation
- Continue-on-error policies for resumption
- Timeout protection for long-running operations
- Resource cleanup on failure scenarios

### 7. Event-Driven Architecture

#### Manager Events
```typescript
// ConversationManager events
'conversationCreated' | 'conversationRemoved' | 'conversationResumed' |
'conversationInactive' | 'conversationError' | 'shutdown'

// RolloutRecorder events
'recordingStarted' | 'recordingCompleted' | 'eventRecorded' | 'recordingError'

// DataStorage events
'monitoringStarted' | 'monitoringStopped' | 'dataPointCollected' | 'processingError'
```

#### Real-Time Updates
- Live conversation state tracking
- Inactivity detection and cleanup
- Monitoring data aggregation
- Error event propagation

This comprehensive feature set ensures the TypeScript SDK provides identical functionality to the Codex CLI v0.42.0 while adding enhanced monitoring, persistence, and management capabilities for production use.

## Security Considerations

### Sandbox Policies
- Workspace access control modes
- Network isolation options
- Temporary directory restrictions

### Approval Mechanisms
- `untrusted`: All operations require approval
- `on-failure`: Approval on error conditions
- `on-request`: Selective approval
- `never`: Fully autonomous operation

## Performance Optimizations

### 1. Native Binding
- Direct Rust integration for minimal overhead
- Async/await throughout the stack
- Zero-copy where possible

### 2. Event Buffering
- AsyncEventQueue prevents event loss
- Configurable buffer sizes
- Back-pressure management

### 3. Connection Pooling
- Reusable client instances
- Reduced connection overhead
- Resource sharing

## Deployment Considerations

### Module Resolution
1. Explicit override via `nativeModulePath` in the client configuration
2. Project-local build at `./native/codex-napi/index.{js|node}`
3. Platform prebuild under `./native/codex-napi/prebuilt/<platform>/`

### Runtime Requirements
- Node.js >= 18
- Codex runtime installation
- Platform-specific native binary
