# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.7] - 2025-01-15

### Added
- Cloud Tasks API support with complete TypeScript bindings
- `CloudTasksClient` for remote code generation and task management
- Environment resolution and listing capabilities
- Task creation with best-of-N attempts support
- Task diff retrieval and local patch application
- Preflight checking for safe patch application
- Sibling attempt listing and comparison
- Comprehensive cloud tasks examples and documentation
- Real-time rate limit monitoring with visual charts
- Session persistence and replay functionality
- Multi-conversation management with lifecycle control
- Plugin system for extensibility

### Changed
- Updated native bindings to support codex-rs v0.42.0+
- Improved error handling with structured error types
- Enhanced TypeScript type definitions for better IDE support

### Fixed
- Connection retry logic for improved reliability
- Memory cleanup in native bindings
- Event stream edge cases

## [0.0.6] - 2024-12-10

### Added
- Initial public release
- Core conversation management
- Native Rust bindings via NAPI
- Basic authentication support
- Streaming events with async iterators

### Changed
- Migrated from pure JS to TypeScript
- Improved build system with dual ESM/CJS output

## [0.0.5] - 2024-11-20

### Added
- Internal testing release
- Experimental cloud tasks preview

[0.0.7]: https://github.com/flo-ai/codex-ts-sdk/compare/v0.0.6...v0.0.7
[0.0.6]: https://github.com/flo-ai/codex-ts-sdk/compare/v0.0.5...v0.0.6
[0.0.5]: https://github.com/flo-ai/codex-ts-sdk/releases/tag/v0.0.5
