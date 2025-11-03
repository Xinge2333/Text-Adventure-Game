---
description: "Task list for WeChat Text Adventure Mini Program"
---

# Tasks: WeChat Text Adventure Mini Program

**Input**: Design documents from `/specs/001-speckit-specify-wechat/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Per the Test-First Verification principle, author failing tests before implementation work begins.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story (Independent Value Increments).

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
- **Mini program**: `src/mini-program/...`
- **Backend**: `backend/src/...`
- **Tests**: `backend/tests/...`, `src/mini-program/pages/.../__tests__/`

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 [P] Initialize Fastify + TypeScript project scaffolding with linting in `backend/` per plan.md.
- [x] T002 [P] Configure Jest test runner and base contract test harness in `backend/tests/` with OpenAPI schemas.
- [x] T003 [P] Import or scaffold WeChat mini program project skeleton in `src/mini-program/` with catalog, story, favorites pages.
- [x] T004 Establish shared lint/format scripts and npm workspaces linking frontend/backend tooling.

---

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T005 Implement configuration loader and `.env` sample covering COS, DeepSeek, telemetry settings in `backend/src/config.ts` and `backend/.env.example`.
- [x] T006 Build COS client and theme index loader with caching placeholder in `backend/src/services/themeIndex.ts` (no business rules yet).
- [x] T007 Implement telemetry utility module with schema validation stub in `backend/src/telemetry/metrics.ts` referenced by routes.
- [x] T008 Create API client wrappers for catalog, story, telemetry endpoints in `src/mini-program/utils/api.js` and `src/mini-program/utils/telemetry.js`.

**Checkpoint**: Backend runtime, config, and client API wrappers are ready; user story work may proceed.

---

## Phase 3: User Story 1 - Start Interactive Story (Priority: P1) 🎯 MVP

**Goal**: Player experiences three AI-driven turns with four options each.

**Independent Test**: Run automated story loop test using mocked DeepSeek responses to confirm UI + backend logic handle three turns with telemetry emission.

### Tests for User Story 1 (Write First) ⚠️

- [x] T009 [P] [US1] Author contract test for `POST /stories` and `POST /stories/{sessionId}/turns` using `backend/tests/contract/stories.test.ts` and OpenAPI schema.
- [x] T010 [P] [US1] Create mini program simulation test covering three-turn loop in `src/mini-program/pages/story/__tests__/story-loop.test.js` with mocked API module.

### Implementation for User Story 1

- [x] T011 [US1] Implement DeepSeek proxy service with session TTL + moderation pipeline in `backend/src/services/deepseekProxy.ts`.
- [x] T012 [US1] Wire `POST /stories` route to create sessions, seed context, and return initial turn in `backend/src/routes/stories.ts`.
- [x] T013 [US1] Handle `POST /stories/{sessionId}/turns` route to submit player choice, call proxy, and honor ending flag in `backend/src/routes/stories.ts`.
- [x] T014 [US1] Implement story page state machine handling option taps, loading, and ending screen in `src/mini-program/pages/story/index.js`.
- [x] T015 [US1] Build story page UI layout + styles with option buttons and ending summary in `src/mini-program/pages/story/index.wxml` and `index.wxss`.
- [x] T016 [US1] Integrate telemetry emission per turn in `src/mini-program/utils/telemetry.js` and ensure backend `/telemetry/turns` receives events.
- [ ] T017 [US1] Document manual acceptance script for three-turn loop in `docs/US1-story-loop.md` (or append to quickstart).

**Checkpoint**: Story loop playable end-to-end with telemetry and tests passing.

---

## Phase 4: User Story 2 - Discover and Manage Themes (Priority: P2)

**Goal**: Player searches catalog, marks favorites, and sees them pinned.

**Independent Test**: Execute catalog discovery simulation verifying search filtering and favorites persistence without running story loop.

### Tests for User Story 2 (Write First) ⚠️

- [x] T018 [P] [US2] Add contract test for `GET /themes` covering search parameters in `backend/tests/contract/catalog.test.ts`.
- [x] T019 [P] [US2] Create mini program simulation verifying catalog search + favorites toggling in `src/mini-program/pages/catalog/__tests__/catalog-search.test.js`.

### Implementation for User Story 2

- [x] T020 [US2] Extend `backend/src/services/themeIndex.ts` to load metadata, filter by keyword/tag, and annotate favorites.
- [x] T021 [US2] Implement `GET /themes` route with caching + favorites annotation in `backend/src/routes/catalog.ts`.
- [x] T022 [US2] Implement catalog page data fetch, search input handlers, and list rendering in `src/mini-program/pages/catalog/index.js`.
- [x] T023 [US2] Style catalog list and favorites badge in `src/mini-program/pages/catalog/index.wxml` and `index.wxss`.
- [x] T024 [US2] Implement favorites storage helper to persist selections locally in `src/mini-program/utils/storage.js` and favorites view in `pages/favorites/`.

**Checkpoint**: Catalog supports search/favorites with persistence and tests pass independently.

---

## Phase 5: User Story 3 - Surface Newly Added Themes (Priority: P3)

**Goal**: Catalog refresh surfaces new themes within five minutes without restarting mini program.

**Independent Test**: Trigger backend catalog refresh and confirm new theme appears in client within SLA while ongoing story unaffected.

### Tests for User Story 3 (Write First) ⚠️

- [x] T025 [P] [US3] Write backend integration test simulating new theme upload and refresh in `backend/tests/integration/catalog-refresh.test.ts`.
- [x] T026 [P] [US3] Create mini program simulation verifying periodic refresh updates list in `src/mini-program/pages/catalog/__tests__/catalog-refresh.test.js`.

### Implementation for User Story 3

- [x] T027 [US3] Implement catalog refresh scheduler + webhook handler to rebuild index versioning in `backend/src/services/themeIndex.ts`.
- [x] T028 [US3] Expose catalog version metadata and stale detection in `backend/src/routes/catalog.ts`.
- [x] T029 [US3] Implement client-side polling/notification to reload themes when version changes in `src/mini-program/pages/catalog/index.js`.

**Checkpoint**: New themes appear automatically post-refresh with backend + client synced.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T030 Harden telemetry ingestion with Winston transport + alert thresholds documented in `backend/src/telemetry/metrics.ts` and `docs/observability.md`.
- [x] T031 Review moderation/error messaging UX across pages and document fallback copy in `docs/content-guidelines.md`.
- [ ] T032 Execute full quickstart walkthrough from `quickstart.md`, capturing issues and readiness notes in `docs/release-notes.md`.

---

## Dependencies & Execution Order

1. **Setup** → 2. **Foundational** → 3. **US1 (MVP)** → 4. **US2** → 5. **US3** → 6. **Polish**
2. US2 and US3 can start only after Foundational completes; US3 also depends on catalog services from US2.
3. Telemetry hardening (T030) depends on T016 and backend telemetry routes.

## Parallel Execution Examples

- During US1, T009 and T010 can run in parallel while backend services (T011) proceed independently.
- Within US2, T022 (client logic) and T021 (backend route) can progress concurrently once T020 delivers filtering logic.
- In US3, T025 and T026 provide parallel validation while T027 focuses on backend scheduling.

## Implementation Strategy

1. **MVP First**: Complete US1 to deliver playable story loop with telemetry; demo to stakeholders.
2. **Incremental Delivery**: Layer US2 catalog enhancements, then US3 refresh behavior, validating each increment independently.
3. **Polish**: Finalize telemetry alerts, moderation UX, and full walkthrough before release.
