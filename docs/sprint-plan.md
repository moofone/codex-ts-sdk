# Sprint Plan: Protocol Coverage Completion

This plan breaks down the remaining protocol operations work into three focused 30-minute sprints. Each sprint includes concrete tasks, expected deliverables, and success criteria.

## Sprint 1 (0–30 minutes): Documentation Sync & API Blueprint
- [ ] Update the README protocol coverage table to accurately reflect exposed operations and identify outstanding gaps.
- [ ] Review existing submission builder helpers for `get_history_entry_request`, `list_mcp_tools`, `list_custom_prompts`, `compact`, and `review` to confirm payload shapes.
- [ ] Draft method signatures and validation requirements for the new `CodexClient` APIs that will wrap each helper.
- **Exit criteria:** README accurately lists implemented vs. missing operations, and design notes exist outlining parameters/return types for upcoming client methods.

## Sprint 2 (30–60 minutes): Implement History & Listing APIs
- [ ] Implement `CodexClient.getHistoryEntry`, `CodexClient.listMcpTools`, and `CodexClient.listCustomPrompts`, wired to their respective submission builders with validation.
- [ ] Extend shared types/event routing as needed to support responses or events emitted by these operations.
- [ ] Add Vitest coverage verifying payload submission, validation behavior, and event routing for each new method.
- **Exit criteria:** Client exposes the history/listing APIs with comprehensive unit tests, and type definitions accommodate emitted events.

## Sprint 3 (60–90 minutes): Implement Maintenance & Review Flows
- [ ] Implement `CodexClient.compact` and `CodexClient.review`, leveraging existing submission helpers and enforcing input validation.
- [ ] Create unit tests covering payload construction, validation errors, and event routing for both methods.
- [ ] Run the full test suite (e.g., `npm run test`) and update README/API reference documentation with the new APIs.
- **Exit criteria:** Maintenance/review operations are exposed with passing tests, and documentation reflects complete protocol coverage.

## Tracking & Follow-Up
- During each sprint, capture notes on blockers or follow-up work items.
- After Sprint 3, reassess whether additional integration tests or examples are needed before releasing the updated SDK.
