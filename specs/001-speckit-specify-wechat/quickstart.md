# Quickstart: WeChat Text Adventure Mini Program

## Prerequisites
- Node.js 18.x and npm 9+
- WeChat Developer Tools installed locally
- Access credentials for Tencent COS bucket containing theme `.txt` files
- DeepSeek API key configured for backend proxy service

## 1. Install Dependencies
```bash
npm install --prefix backend
```

## 2. Configure Environment
Create `backend/.env` with:
```
PORT=8080
COS_BUCKET=weapp-story-themes
COS_REGION=ap-shanghai
COS_ACCESS_KEY=your-secret-id
COS_SECRET_KEY=your-secret-key
COS_INDEX_KEY=catalog/index.json
# optional: use local file instead of COS during development
COS_LOCAL_PATH=specs/001-speckit-specify-wechat/contracts/theme-index.mock.json
LLM_PROVIDER=qwen
LM_API_KEY=your-shared-llm-api-key
LLM_MOCK=true
LLM_TIMEOUT_MS=0
LLM_MAX_RETRIES=1
# provider-specific overrides (optional)
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
TELEMETRY_ENDPOINT=https://metrics.internal.example/v1/ingest
SESSION_TTL_MINUTES=30
```

> 提示：若没有可用的真实接口 Key，可保持 `LLM_MOCK=true`，使用内置模拟响应完成本地调试。需要调用真实模型时，把 `LLM_MOCK` 设为 `false`，并提供 `LM_API_KEY`；`LLM_TIMEOUT_MS=0` 表示不设超时，如需限制请求时长再改为具体毫秒值。

要切换至 DeepSeek，只需把 `LLM_PROVIDER=deepseek` 并提供对应的密钥。必要时可通过 `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` 覆盖默认的接口；如果仍想单独禁用真实调用，可改设 `LLM_MOCK=true`。

## 3. Seed Theme Index (Optional for local testing)
```bash
npm run --prefix backend seed:themes
```
This script uploads sample theme metadata and prompts to the COS bucket and generates the catalog index JSON.

## 4. Run Backend Locally
```bash
npm run --prefix backend dev
```
This starts the Fastify server with live reload;若 `LLM_MOCK=true` 或未提供 `LM_API_KEY`，将自动使用内置的故事生成模拟响应。

## 5. Configure Mini Program
- Open WeChat Developer Tools and select "Import Project".
- Choose `src/mini-program` as the project directory.
- Set the request domain whitelist to include `http://localhost:8080`.
- Update `src/mini-program/utils/api.js` to point to the backend base URL if not already set.

## 6. Run Tests (Test-First)
```bash
npm test --prefix backend         # Backend unit + contract tests
npm run test:simulate --prefix src/mini-program  # Simulated mini program tests
```
All tests should fail initially until implementation is complete, per Test-First principle.

## 7. Launch Mini Program Preview
- In WeChat Developer Tools, click **Compile**.
- Navigate to the catalog page to list themes.
- Start a story to verify mocked responses.

## 8. Telemetry Verification
- Trigger several story turns.
- Inspect backend logs or telemetry endpoint to confirm per-turn latency and outcome events are emitted.

## 9. Shutdown
- Stop the backend dev server.
- Close WeChat Developer Tools session.

## US1 Acceptance Script (Three-Turn Story Loop)
1. 清空小程序本地存储，重新编译项目。
2. 在 Catalog 页面选择 "科技侦探" 主题。
3. 记录首轮故事段落，确认出现四个带编号按钮。
4. 依次选择选项 2、3、1，确认每次返回新段落。
5. 确认第三次选择后出现结束视图与重新开始按钮。
6. 打开后台日志或 `/telemetry` 捕获端，确认每回合都有延迟与 outcome 记录。
