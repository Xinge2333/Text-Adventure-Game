# WeChat Text Adventure Mini Program

Interactive text-adventure built for WeChat Mini Program. The repo contains a Fastify + TypeScript backend plus the Mini Program frontend (ES2021). It supports turn-based storytelling powered by an LLM, catalog search/favorites, recommendation ranking, and telemetry forwarding with mock-friendly defaults.

- Recommendation: rank themes by tags + player behavior, including skip/negative signals.
- Catalog: batch-scan `.txt` prompts and generate `catalog/index.generated.json` with tag profiles.
- Auth & favorites: WeChat login (mock/live switch), favorites/profile syncing to the backend.
- Telemetry: client posts turn metrics; backend forwards to `TELEMETRY_ENDPOINT` and logs via Winston.

## Project layout
- `backend/`: Fastify + TypeScript service exposing stories, catalog, recommendations, auth, telemetry.
- `src/mini-program/`: WeChat Mini Program source & tests.
- `catalog/`: Default output for generated theme index.
- `themes/`: Sample prompt files scanned by `build:catalog`.
- `tools/`: Developer scripts such as `build-catalog.js`.
- `docs/`: Content guidelines, observability and release notes.

## Quick start
### Prereqs
- Node.js 18+ and npm (workspaces enabled).
- WeChat DevTools (import `src/mini-program`).
- Live WeChat/LLM access requires corresponding AppID/keys.

### Install
```bash
npm install
```

### Backend environment
Create a `.env` in the repo root, e.g.:
```bash
PORT=8080
HOST=0.0.0.0
COS_BUCKET=local-catalog
COS_REGION=local
COS_ACCESS_KEY=local-access
COS_SECRET_KEY=local-secret
COS_INDEX_KEY=catalog/index.json
TELEMETRY_ENDPOINT=https://example.com/telemetry
LLM_PROVIDER=qwen # or deepseek
LM_API_KEY=your-key # can be empty when LLM_MOCK=true
LLM_MOCK=true
WECHAT_MOCK=true
WECHAT_APP_ID=your-app-id
WECHAT_APP_SECRET=your-app-secret
SESSION_TTL_MINUTES=30
# CATALOG_REFRESH_DISABLED=true # disable background refresh when needed
```
> If `catalog/index.generated.json` exists locally, COS settings fall back to local mode automatically.

### Run & test
- Backend dev server:
  ```bash
  npm run dev --workspace backend
  ```
- Backend tests / lint:
  ```bash
  npm test --workspace backend
  npm run lint --workspace backend
  ```
- Build/refresh catalog index (scans `themes/`):
  ```bash
  npm run build:catalog
  # see docs/theme-metadata.md for advanced flags
  ```
- Mini program: import `src/mini-program` in WeChat DevTools; local tests:
  ```bash
  npm test --workspace src/mini-program
  ```

### Key endpoints
- `GET /healthz`
- `POST /auth/login`, `POST /auth/logout`, `GET /me`
- `GET /catalog`, `GET /stories/:id`, `POST /telemetry/turns`, `POST /recommendations`

## Docs
- `docs/release-notes.md`
- `docs/theme-metadata.md`
- `docs/content-guidelines.md`
- `docs/observability.md`

## License
MIT License – see `LICENSE` in the repo.
