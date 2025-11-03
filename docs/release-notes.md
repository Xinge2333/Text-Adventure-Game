# Release Notes - WeChat Text Adventure Mini Program

## Readiness Checklist (2025-10-25)
- ✅ Backend + mini program suites (`npm test`) all passing on 2025-10-25, covering contract, integration, and simulation flows.
- ✅ US1 story loop runs through three turns with telemetry output (mock DeepSeek/Qwen providers).
- ✅ Catalog search & favorites functional against mock index with persisted selections.
- ✅ Catalog auto-refresh polling detects new themes (mock refresh) and surfaces to users within SLA.
- ✅ Telemetry ingestion endpoint `/telemetry/turns` accepts payloads and forwards to logger/external endpoint.

## Latest Changes
- Added mock WeChat login handshake (`POST /auth/login`) issuing session tokens plus `/me` profile endpoints with server-side favorite persistence.
- Mini program now bootstraps with `wx.login`, syncs favorites to the backend when toggled, and shares profile data with catalog/favorites tabs.
- Upgraded `/auth/login` to call the official WeChat `code2session` API when `WECHAT_MOCK=false`, and added `/auth/logout` so sessions can be invalidated from the client UI (favorites tab).
- Introduced `/recommendations` powered by tag + 行为权重的排序算法，记录游玩/选项/收藏行为，故事页首屏按推荐序列排序并展示推荐理由。
- 通过 `/recommendations/skip` 记录“进入后未互动立即跳过”的负反馈，推荐得分会扣除高频跳过的主题标签，前端在上下切换时自动上报。
- 新增 JSON front-matter 规范与 `npm run build:catalog` 工具，可批量扫描上百份 `.txt` 提示词并生成带标签统计的 `catalog/index.generated.json`；后端自动检测该文件，开发环境无需再手动配置 COS。

## Known Issues
- DeepSeek/Qwen proxy still runs in mock mode locally; production API keys + moderation review pending.
- Observability dashboard setup tracked separately via SRE backlog.

## Next Steps
1. Swap COS + LLM integrations from local/mock data to production Tencent COS + provider credentials, then re-run contracts against live endpoints.
2. Author the manual acceptance walk-through for US1 (`docs/US1-story-loop.md`) and link from quickstart so QA has a deterministic script.
3. Capture telemetry dashboard wiring (Grafana + alerts) in `docs/observability.md` once infra team provisions sinks.

Document owner: Feature team 001-speckit-specify-wechat.
