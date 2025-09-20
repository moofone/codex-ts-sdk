# API Changelog

## Unreleased

### Added
- Documented the `CodexClient` surface, including approval helpers, interrupt handling, the streaming iterator, and model probing utilities.
- Exported `resolveModuleUrl` and `normalizeDirectory` for native-module resolution, improving configurability and testability.
- Hardened the retry helper to cap exponential backoff deterministically and expanded its test coverage to include non-error failures.

### Changed
- Raised coverage thresholds to 100% and expanded the suite so `npm run coverage` succeeds by default.
- Augmented behaviour tests to validate interrupts, approvals, plugin hooks, iterator clean-up, and malformed event handling.
