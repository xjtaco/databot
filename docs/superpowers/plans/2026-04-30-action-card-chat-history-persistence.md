# Action Card Chat History Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist UI action card records and later card status/result changes in chat history so restored coreAgent chats show the same cards and terminal states.

**Architecture:** The backend persists `show_ui_action_card` tool results as `tool` chat messages with `metadata.type === 'action_card'`, then sends the persisted message id with the realtime `action_card` WebSocket payload. The frontend stores that message id on the `ChatActionCard`; when card status changes, it updates local state and calls the existing chat message metadata API with the merged action-card metadata.

**Tech Stack:** Express chat session API, Prisma chat message metadata, Vue 3 + Pinia chat store, Vitest.

---

### Task 1: Backend Realtime Card Persistence Id

**Files:**
- Modify: `backend/src/agent/coreAgentSession.ts`
- Test: `backend/tests/services/agents/coreAgentSession-action-card.test.ts`

- [x] Add a failing test that a realtime `action_card` message includes `metadataMessageId` when the card was persisted.
- [x] Update `CoreAgentSession` to await action-card metadata persistence before sending `action_card`.
- [x] Keep the regular `tool_call` persistence unchanged, but avoid saving a duplicate plain `show_ui_action_card` tool record when the dedicated action-card metadata record was already written.
- [x] Run `cd backend && pnpm vitest run tests/services/agents/coreAgentSession-action-card.test.ts`.

### Task 2: Frontend Card Metadata References

**Files:**
- Modify: `frontend/src/types/actionCard.ts`
- Modify: `frontend/src/types/websocket.ts`
- Modify: `frontend/src/stores/chatStore.ts`
- Modify: `frontend/src/composables/useChat.ts`
- Test: `frontend/tests/stores/chatStore-action-cards.test.ts`
- Test: `frontend/tests/composables/useChat-action-cards.test.ts`

- [x] Add `metadataMessageId` and `metadataSessionId` to `ChatActionCard`.
- [x] Accept realtime `action_card` data with optional `metadataMessageId`.
- [x] Store metadata ids when adding realtime cards and when restoring cards from history records.
- [x] Add tests for realtime card metadata ids and historical restoration ids.
- [x] Run the related frontend store/composable tests.

### Task 3: Frontend Status Metadata Sync

**Files:**
- Modify: `frontend/src/components/chat/ChatMessage.vue`
- Test: `frontend/tests/components/chat/ChatMessage.test.ts` or nearest existing chat message/action-card tests

- [x] After `updateActionCardStatus`, if the card has a persisted metadata message id and the active session id is known, call `updateMessageMetadata(sessionId, messageId, metadata)`.
- [x] Metadata must include `{ type: 'action_card', payload, status, resultSummary, error }`.
- [x] Ignore API failures so UI state remains updated locally.
- [x] Run targeted frontend tests.

### Task 4: Verification

**Files:**
- No implementation files.

- [x] Run `cd frontend && pnpm run preflight`.
- [x] Run `cd backend && pnpm run preflight`.
- [ ] Commit all related changes.
