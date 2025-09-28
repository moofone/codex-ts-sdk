# Codex TypeScript SDK Architecture

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

### 3. Type System (`src/types/`, `src/bindings/`)

#### Options (`types/options.ts`)
- Configuration interfaces for client setup
- Request/response type definitions
- Model and effort level enums

#### Events (`types/events.ts`)
- Comprehensive event type definitions
- Message structures for all event types
- Type guards and discriminated unions

#### Bindings (`bindings/`)
- Auto-generated TypeScript interfaces from Rust types
- Protocol message definitions
- Ensures type safety across language boundary

### 4. Plugin System (`src/plugins/`)

#### Plugin Interface (`types.ts`)
- **Lifecycle Hooks**:
  - `initialize()`: Setup and resource allocation
  - `onEvent()`: Event interception and processing
  - `cleanup()`: Resource deallocation

### 5. Utilities (`src/utils/`)

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
