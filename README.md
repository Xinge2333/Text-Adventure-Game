# WeChat 文本冒险小程序

面向微信小程序的互动文字冒险项目，包含 Fastify + TypeScript 后端与前端小程序（ES2021）。支持故事轮次驱动、主题目录搜索/收藏、推荐排序和遥测上报，默认提供 Mock LLM/登录链路便于本地调试。

- 推荐：基于主题标签与玩家行为的排序，并处理跳过/负反馈。 
- 目录：批量扫描 `.txt` 提示词，生成带标签画像的 `catalog/index.generated.json`。
- 登录与收藏：微信登录（Mock/正式可切换），收藏与个人资料与后端同步。
- 遥测：前端上报 turn 数据，后端转发到 `TELEMETRY_ENDPOINT` 并通过 Winston 记录。

## 仓库结构
- `backend/`：Fastify + TypeScript 服务，提供故事、目录、推荐、登录、遥测等接口。
- `src/mini-program/`：微信小程序源代码与测试。
- `catalog/`：生成的主题索引默认输出位置。
- `themes/`：示例提示词存放处，可被 `build:catalog` 扫描。
- `tools/`：`build-catalog.js` 等开发脚本。
- `docs/`：内容规范、观察性与发行说明。

## 快速开始
### 环境要求
- Node.js 18+、npm（已启用 npm workspaces）。
- 微信开发者工具（导入 `src/mini-program`）。
- 若需直连微信登录/LLM，请准备对应的 AppID/密钥与网络权限。

### 安装依赖
```bash
npm install
```

### 配置后端环境变量
在仓库根目录创建 `.env`，常用字段示例：
```bash
PORT=8080
HOST=0.0.0.0
COS_BUCKET=local-catalog
COS_REGION=local
COS_ACCESS_KEY=local-access
COS_SECRET_KEY=local-secret
COS_INDEX_KEY=catalog/index.json
TELEMETRY_ENDPOINT=https://example.com/telemetry
LLM_PROVIDER=qwen # 可选 deepseek
LM_API_KEY=your-key # mock 模式下可留空
LLM_MOCK=true
WECHAT_MOCK=true
WECHAT_APP_ID=your-app-id
WECHAT_APP_SECRET=your-app-secret
SESSION_TTL_MINUTES=30
# CATALOG_REFRESH_DISABLED=true # 需要时可关掉后台轮询
```
> 若本地存在 `catalog/index.generated.json`，COS 相关配置会自动退化为本地模式。

### 运行 / 调试
- 启动后端（含自动预加载 catalog、定时刷新）：
  ```bash
  npm run dev --workspace backend
  ```
- 运行后端测试 / Lint：
  ```bash
  npm test --workspace backend
  npm run lint --workspace backend
  ```
- 构建/更新目录索引（扫描 `themes/`）：
  ```bash
  npm run build:catalog
  # 高级参数参考 docs/theme-metadata.md
  ```
- 小程序端：在微信开发者工具导入 `src/mini-program`，如需本地测试亦可运行：
  ```bash
  npm test --workspace src/mini-program
  ```

### 常用端点
- `GET /healthz`：存活探针。
- `POST /auth/login` / `POST /auth/logout` / `GET /me`：登录与会话。
- `GET /catalog`、`GET /stories/:id`、`POST /telemetry/turns`、`POST /recommendations`：核心业务接口。

## 相关文档
- `docs/release-notes.md`：最新变更与就绪清单。
- `docs/theme-metadata.md`：提示词 front-matter 规范与 `build:catalog` 使用说明。
- `docs/content-guidelines.md`：内容/错误文案约定。
- `docs/observability.md`：遥测信号与告警阈值。

## 许可证
本项目采用 MIT License 发行，详见仓库中的 `LICENSE`。

---
Need English? See `README.en.md` for an English version.
