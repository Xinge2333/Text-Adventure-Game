# Research: WeChat Text Adventure Mini Program

## R1. Backend Framework for DeepSeek Proxy
- **Decision**: Use Fastify on Node.js 18 with TypeScript.
- **Rationale**: Fastify provides high-performance JSON handling, built-in schema validation for requests/responses, and integrates cleanly with TypeScript definitions for contract enforcement.
- **Alternatives Considered**:
  - **Express**: Simpler but slower routing and no native schema enforcement.
  - **NestJS**: Heavyweight for this feature; adds DI/Boilerplate not required for a slim proxy.

## R2. Theme Prompt Storage & Hot Updates
- **Decision**: Host `.txt` theme prompts in Tencent Cloud Object Storage with a lightweight index JSON to power search metadata.
- **Rationale**: COS supports atomic object uploads, presigned URLs for controlled access, and integrates with mini program backend without extra infrastructure. Index JSON lets backend refresh quickly and append newly uploaded themes within minutes.
- **Alternatives Considered**:
  - **Git repository sync**: Slower deployment pipeline, requires developer intervention for each update.
  - **Database table**: Overkill for append-only text assets; increases maintenance overhead.

## R3. Session Management & Safety Moderation
- **Decision**: Backend maintains per-session context in memory with TTL caching, invoking DeepSeek via proxy and running moderation on responses before returning to the client.
- **Rationale**: Aligns with spec assumption that backend holds conversation state and ensures safety reviews happen server-side. TTL cache keeps infra minimal while preventing stale sessions from leaking memory.
- **Alternatives Considered**:
  - **Client-side context**: Violates requirement to keep session control on backend for moderation.
  - **Persistent store (Redis)**: Deferred until concurrency exceeds in-memory capacity (5k DAU manageable with process clustering).

## R4. Telemetry & Observability Signals
- **Decision**: Emit structured logs per story turn capturing session ID (hashed), theme ID, latency in ms, outcome status, and DeepSeek request ID to a dedicated `/telemetry` endpoint.
- **Rationale**: Supports FR-009, enables SC-001/002/003 validation, and feeds dashboards/alerts without exposing PII.
- **Alternatives Considered**:
  - **Client-only console logging**: Unobservable in production.
  - **DeepSeek-only monitoring**: Lacks user-facing latency metrics and option render accuracy.

## R5. Frontend Testing Approach
- **Decision**: Use `miniprogram-simulate` to snapshot render the catalog and story pages, paired with mocked API modules.
- **Rationale**: Provides deterministic UI validation, fits WeChat ecosystem, and supports test-first requirement for US1 and US2.
- **Alternatives Considered**:
  - **Manual QA only**: Violates Test-First constitution principle.
  - **End-to-end cloud testing**: Valuable later but slower for red/green cycles.
