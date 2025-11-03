# Observability Playbook

## Critical Signals
- **Turn latency**: `latencyMs` reported per story turn. Target p95 ≤ 2000 ms (aligns with SC-001).
- **Outcome distribution**: `outcome` values `success`, `handled_error`, `moderated`. Alert when handled_error > 5% or moderated > 1% of turns in a 15 min window.
- **Catalog refresh**: Background scheduler updates catalog every 5 minutes; log entry `telemetry-configured` confirms telemetry bootstrap.

## Data Flow
1. Mini program client posts turn metrics to backend `/telemetry/turns` (Fastify ingestion route).
2. Backend `HttpTelemetry` client forwards payloads to `TELEMETRY_ENDPOINT` (configured in `.env`).
3. Winston logger streams JSON logs (`turn-telemetry`, `telemetry-submit-failed`) for ingestion.

## Alert Thresholds
| Metric | Warning | Critical |
|--------|---------|----------|
| Turn latency p95 | 1800 ms | 2000 ms |
| Handled error rate | 3% | 5% |
| Moderated content rate | 0.5% | 1% |

## Runbooks
- **Spike in handled errors**: Inspect DeepSeek logs, verify option parsing integrity, fall back to manual moderation if needed.
- **Telemetry endpoint failure**: Winston warning log `telemetry-submit-failed` surfaces error; validate network connectivity and endpoint availability. Telemetry client will retry on next turn automatically.
- **Catalog staleness**: Verify `scheduleCatalogRefresh` running; restart backend to re-establish interval.

## Dashboards
- `turn_latency_ms` histogram (p50/p95/p99).
- `turn_outcome_count` grouped by `outcome`.
- `catalog_version` gauge showing last update time.

Document owner: Feature team 001-speckit-specify-wechat.
