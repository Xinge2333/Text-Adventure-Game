# WeChat Text Adventure Platform
**Language:** [中文](README.md) | English

A full-stack interactive fiction platform built for WeChat Mini Programs. The backend (Fastify + TypeScript) orchestrates authentication, catalog storage, LLM story generation, telemetry, and personalized recommendations, while the Mini Program frontend delivers the story experience, favorites, and recommendations UI.

**Highlights**
- Native WeChat experience: login, sessions, favorites, and preferences synced to backend.
- End-to-end storytelling: prompt assembly, retries, and timeouts around LLM calls.
- Personalization: interest vectors + popularity/freshness + diversity filter.
- Lightweight storage: JSON snapshots for fast iteration and simple deploys.
- Observability: Winston logging with optional telemetry sink.

---

## Contents
1. Overview
2. Architecture
3. Key Features
4. Quick Start
5. Environment Configuration
6. Working with the Backend
7. Working with the Mini Program
8. Data & Storage Model
9. Recommendation Logic
10. Telemetry & Observability
11. Project Structure
12. Development Workflow
13. Troubleshooting
14. License

---

## 1. Overview
- **Goal**: Provide a narrative adventure experience inside WeChat, driven by LLM-generated story turns and personalized recommendations.
- **Tech Stack**: Fastify (Node.js 18, TypeScript), WeChat Mini Program (ES2021 + WXML/WXSS), Tencent COS, DeepSeek/Qwen LLMs, Winston logging.
- **Data Storage**: JSON snapshot files for users, behavior, and catalog metadata—fast local iteration and simple deployment.
- **Recommendation Engine**: Interest vectors + cosine similarity + popularity + freshness + skip penalty.
- **Telemetry**: Request-level logging plus optional HTTP telemetry sink for turn and recommendation events.

---

## 2. Architecture
```
WeChat Mini Program (frontend)
 ├─ Story page: start/advance story, display narrative
 ├─ Catalog page: theme list, search, recommendations
 └─ Favorites/settings: user profile, night mode, model preference

Backend (Fastify + TypeScript)
 ├─ Routes: auth, users, stories, catalog, recommendations, telemetry
 ├─ Services:
 │   ├─ deepseekProxy: prompt assembly, LLM invocation, telemetry hooks
 │   ├─ themeIndex: COS fetch + cache refresh
 │   ├─ recommendations: scoring + diversity filter
 │   └─ interestVector: tag weighting, decay, persistence
 ├─ Storage: userStore, behaviorStore (JSON snapshots)
 └─ Telemetry: Winston logs + optional HTTP exporter

External dependencies
 ├─ LLMs: DeepSeek or Qwen (configurable, mockable)
 └─ Object storage: Tencent COS (with local fallback)
```

---

## 3. Key Features
- **WeChat login** exchange (`wx.login` → backend `/auth/login`) and session persistence.
- **Story generation** per theme via configurable LLM providers with retry, timeout, and prompt hygiene.
- **Player behavior tracking**: plays, option clicks, skips, favorites, turn depth.
- **Interest vector maintenance** with decay, caps, and bonus/penalty rules.
- **Recommendation scoring** combining personalization, popularity, freshness, skip penalty, plus diversity filter & reason strings.
- **Telemetry endpoints** for internal LLM calls and client reports, optionally forwarded to an HTTP sink.
- **Mini Program UX**: night mode, loading animations, favorites sync, recommendation refresh.

---

## 4. Quick Start

```bash
# 1. Install workspace dependencies
npm install

# 2. Set up environment variables
cp backend/.env.example backend/.env
# edit backend/.env with your values (COS, telemetry, LLM keys, etc.)

# 3. (Optional) build catalog assets
npm run build:catalog

# 4. Run backend locally
npm run dev --workspace backend

# 5. Open Mini Program project (src/mini-program) in WeChat DevTools.
# Configure backend URL inside app.js/globalData.apiBaseUrl if needed.
```

---

## 5. Environment Configuration

Backend configuration is sourced from environment variables (loaded via `backend/.env`).

| Variable | Description | Default/Fallback |
| --- | --- | --- |
| `PORT`, `HOST` | Fastify server binding | 8080 / 0.0.0.0 |
| `COS_BUCKET`, `COS_REGION`, `COS_ACCESS_KEY`, `COS_SECRET_KEY` | Tencent COS credentials | required unless `COS_LOCAL_PATH` detected |
| `COS_INDEX_KEY` | Catalog index object key | `catalog/index.json` |
| `TELEMETRY_ENDPOINT` | HTTP endpoint for telemetry export | required |
| `TELEMETRY_ENABLED` | Enable remote telemetry | `true` |
| `LM_API_KEY` | Default LLM API key | required unless mock |
| `LLM_PROVIDER` | `deepseek` \| `qwen` | `qwen` |
| Provider-specific overrides | `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, etc. | see `config.ts` |
| `LLM_MOCK` | Enable mock responses for testing | `false` |
| `WECHAT_APP_ID`, `WECHAT_APP_SECRET`, `WECHAT_MOCK` | WeChat login | defaults to mock (`WECHAT_MOCK=true`) |
| `SESSION_TTL_MINUTES` | Session token TTL | 30 |
| `USER_STORE_PATH`, `BEHAVIOR_STORE_PATH` | Override snapshot locations | optional |

> **Security**: Never commit real API keys. `.gitignore` is configured to exclude `.env`.

---

## 6. Working with the Backend

### Install & Build
```bash
npm install --workspace backend
npm run build --workspace backend
```

### Development Server
```bash
npm run dev --workspace backend
```

### Tests
```bash
npm test --workspace backend   # contract + integration tests
npm run lint --workspace backend
```

### Important Files
- `backend/src/index.ts`: server bootstrap (routes, telemetry, catalog refresh scheduler).
- `backend/src/config.ts`: environment parsing, COS + LLM + WeChat configuration.
- `backend/src/routes/*`: Fastify routes for auth, stories, catalog, recommendations, telemetry, users.
- `backend/src/services/deepseekProxy.ts`: prompt assembly, provider switching, fetch w/ retry.
- `backend/src/services/recommendations.ts`: scoring algorithm, diversity selection.
- `backend/src/services/interestVector.ts`: interest vector updates (option interaction, skip, favorite addition).
- `backend/src/storage/*.ts`: JSON snapshot persistence.

---

## 7. Working with the Mini Program

### Setup
1. Open `src/mini-program` in WeChat Developer Tools.
2. Ensure `app.js` points `globalData.apiBaseUrl` to the backend URL.
3. Enable mocks if backend not running (`LLM_MOCK=true`, `WECHAT_MOCK=true`).

### Tests (Jest)
```bash
npm test --workspace src/mini-program
```

### Key Pages
- `pages/story/index.js`: story execution, LLM requests, telemetry submission.
- `pages/catalog/index.js`: theme list, search, polling, recommendation refresh, favorites toggle.
- `pages/favorites/index.js`: profile display, login flow, night mode, model preference.

### Utilities
- `utils/api.js`: HTTP wrapper w/ session token headers.
- `utils/storage.js`: local favorites cache.
- `components/loading-sequence`: animated loading steps.

---

## 8. Data & Storage Model

Snapshot files (JSON) under `backend/snapshots/` provide lightweight persistence:

1. **User Store (`user-store.json`)**
   - `userId`, `openId`, profile (`nickName`, `avatarUrl`).
   - `favorites`: list of `{ themeId, title, description }`.
  - `interestVector`: tag → weight map (capped at 50 tags).
  - Session info: `sessionToken`, `sessionExpiresAt`.
  - Timestamps: `createdAt`, `updatedAt`, `lastLoginAt`.

2. **Behavior Store (`behavior-store.json`)**
   - `userHistory[userId][themeId]` with `plays`, `optionClicks`, `skips`, `lastPlayedAt`, `maxTurnDepth`.
   - `themeStats[themeId]` with aggregated `plays`, `favorites`, `optionClicks`, `skips`.

3. **Catalog (`catalog/index.generated.json`)**
   - `catalogVersion`, theme list with metadata (`themeId`, `title`, `description`, `tags`, `lastUpdated`, `promptPath`, etc.).

> Stores are lazily loaded on first access, deduped, and written back after mutations.

---

## 9. Recommendation Logic

For each theme `t`, compute:

- **User Profile Vector** `p(tag)`:
  - Start with stored `interestVector`. If empty, derive from favorites + history weights.
  - Option interactions: +0.4 per click (capped at 3.0 after weighting).
  - Turn depth: +0.2 per new depth (cap 2.0).
  - Completion bonus: +3.0.
  - Favorite addition: +2.0 (no decay).
  - Skip penalty: −1.2/−0.8/−0.3 for shallow/mid/deep skip.
  - Decay factor 0.96 per update, remove near-zero entries, cap at ±10, top-K = 50 tags.

- **Score Components**:
  - Cosine similarity `sim(u,t)` with theme tags.
  - Popularity weight `0.15 * (plays + 2*favorites + 0.5*optionClicks)`.
  - Freshness weight `0.2 * exp(-ageDays / 14)`.
  - Skip penalty `0.5 * skips`.

- **Final Score**:
  ```
  score = sim + popularityWeight - skipPenalty + freshWeight
  ```

- **Diversity Filter**:
  - Greedy pick by score, limiting each primary tag to at most 2 (ensures variety).
  - Fill remaining slots with highest scores.
  - Cap output at requested limit (<=10).
  - Recommendation reason:
    - If similarity > 0.15 and dominant tag weight > 0: “因为你喜欢 <tag>”.
    - Else if fresh > 0.4: “新鲜上线”.
    - Else: “热门推荐”.

---

## 10. Telemetry & Observability

- **Server Logging**: Winston logger to stdout (JSON with timestamp).
- **Telemetry Client** (`telemetry/metrics.ts`):
  - No-op (if disabled) or HTTP POST to configured endpoint with turn/recommendation events.
  - Turn events include `sessionIdHash`, `themeId`, `turnIndex`, `latencyMs`, `outcome`.
  - Recommendation events include `userIdHash`, `themeId`, `action`, `recSetId`, `position`, `reason`.
- **Lifecycle Hooks**: Telemetry client configured at startup; story route sends records on success/error.
- **Catalog Cache**: `themeIndex` service caches index in-memory for 5 min; scheduler refreshes periodically.

---

## 11. Project Structure

```
.
├─ backend/
│  ├─ src/
│  │  ├─ routes/          Fastify route handlers
│  │  ├─ services/        LLM proxy, recommendations, interest vector, theme index, auth
│  │  ├─ storage/         JSON snapshot handlers (users, behavior, COS)
│  │  ├─ telemetry/       Telemetry client setup
│  │  └─ utils/           Shared utilities (session tokens)
│  ├─ tests/              Contract & integration tests
│  └─ snapshots/          Default JSON data stores
├─ src/mini-program/
│  ├─ pages/              catalog, story, favorites
│  ├─ components/         reusable UI
│  ├─ utils/              HTTP client, storage helpers, telemetry
│  └─ tests/              Mini program Jest tests
├─ catalog/               Generated catalog index, tag summaries, prompts
├─ themes/                Prompt source files
├─ docs/                  Additional documentation (content guidelines, observability, releases)
├─ specs/                 Spec-kit plans, requirements, data models
├─ tools/                 Build scripts (catalog generation)
└─ package.json           Workspace configuration
```

---

## 12. Development Workflow

- **Spec-kit + Codex**: Structured task planning and specification files live under `specs/`.
- **Branching**: Default branch `main`. Use topic branches for new features.
- **Testing**: Run `npm test` across workspaces before push.
- **Linting**: `npm run lint --workspace backend`.
- **Telemetry Mocking**: Disable telemetry via `TELEMETRY_ENABLED=false` during local dev if no endpoint.

---

## 13. Troubleshooting

| Issue | Diagnosis | Fix |
| --- | --- | --- |
| Backend fails with missing env var | Missing COS/Telemetry/LLM credentials | Edit `backend/.env` |
| Story generation returns provider unavailable | Provider API key empty while `LLM_MOCK=false` | Supply API key or enable mock |
| Mini program login fails | Running with `WECHAT_MOCK=false` without real credentials | Switch to mock or configure appId/secret |
| Catalog not updating | Cached index in memory | GET `/__catalog-demo` and `/__catalog-demo` DELETE to clear |
| Recommendation list empty | Behavior data missing or LLM unreachable | Check snapshots, ensure backend endpoints reachable |
| Telemetry requests rejected | Endpoint not accessible | Disable telemetry or fix endpoint |

---

## 14. License

MIT License

Copyright (c) 2025 Text Adventure Game contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---
