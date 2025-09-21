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
1. Environment variable: `CODEX_NATIVE_MODULE`
2. Relative path: `../native/codex-napi/index.node`
3. Package path: `@flo-ai/codex-ts-sdk/native/codex-napi/index.node`

### Runtime Requirements
- Node.js >= 18
- Codex runtime installation
- Platform-specific native binary