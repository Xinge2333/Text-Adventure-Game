# 微信文本冒险平台
**语言 / Language:** 中文 | [English](README.en.md)

面向微信小程序的全栈互动小说平台。Fastify + TypeScript 后端负责认证、目录存储、LLM 故事生成、遥测和个性化推荐，小程序前端提供故事体验、收藏与推荐展示。

**项目亮点**
- 微信原生体验：登录、会话、收藏与偏好同步。
- 端到端故事链路：LLM 提示组装、重试与超时保护。
- 个性化推荐：兴趣向量 + 热度/新鲜度 + 多样性过滤。
- 轻量存储：基于 JSON 快照，便于本地迭代与部署。
- 可观测性：Winston 日志 + 可选遥测下沉。

---

## 目录
1. 概览
2. 架构
3. 核心特性
4. 快速开始
5. 环境配置
6. 使用后端
7. 使用小程序
8. 数据与存储模型
9. 推荐逻辑
10. 遥测与可观测性
11. 项目结构
12. 开发流程
13. 故障排查
14. 许可证

---

## 1. 概览
- **目标**：在微信内提供由 LLM 驱动、带个性化推荐的文字冒险体验。
- **技术栈**：Fastify（Node.js 18、TypeScript）、微信小程序（ES2021 + WXML/WXSS）、腾讯 COS、DeepSeek/Qwen LLM、Winston 日志。
- **数据存储**：用户/行为/目录元数据采用 JSON 快照，便于本地迭代与简单部署。
- **推荐引擎**：兴趣向量 + 余弦相似度 + 热度 + 新鲜度 + 跳过惩罚。
- **遥测**：请求级日志，支持可选 HTTP 遥测下沉，覆盖故事回合与推荐事件。

---

## 2. 架构
```
微信小程序（前端）
 ├─ 故事页：开启/推进故事、渲染文本
 ├─ 目录页：主题列表、搜索、推荐
 └─ 收藏/设置：用户资料、夜间模式、模型偏好

后端（Fastify + TypeScript）
 ├─ 路由：auth、users、stories、catalog、recommendations、telemetry
 ├─ 服务：
 │   ├─ deepseekProxy：提示组装、LLM 调用、遥测挂钩
 │   ├─ themeIndex：COS 获取 + 缓存刷新
 │   ├─ recommendations：打分 + 多样性筛选
 │   └─ interestVector：标签权重、衰减、持久化
 ├─ 存储：userStore、behaviorStore（JSON 快照）
 └─ 遥测：Winston 日志 + 可选 HTTP 导出

外部依赖
 ├─ LLM：DeepSeek 或 Qwen（可配置、可 Mock）
 └─ 对象存储：腾讯 COS（含本地回退）
```

---

## 3. 核心特性
- **微信登录**：`wx.login` → 后端 `/auth/login`，会话持久化。
- **故事生成**：按主题走可配置的 LLM 提供商，含重试、超时、提示清洗。
- **玩家行为采集**：游玩、选项点击、跳过、收藏、回合深度。
- **兴趣向量维护**：衰减、阈值与奖励/惩罚规则。
- **推荐打分**：个性化 + 热度 + 新鲜度 + 跳过惩罚，多样性过滤并给出理由文案。
- **遥测端点**：内部 LLM 调用与客户端上报，可选转发到 HTTP Sink。
- **小程序体验**：夜间模式、加载动画、收藏同步、推荐刷新。

---

## 4. 快速开始

```bash
# 1. 安装工作区依赖
npm install

# 2. 配置环境变量
cp backend/.env.example backend/.env
# 根据实际填写 COS、遥测、LLM 密钥等

# 3. （可选）构建目录素材
npm run build:catalog

# 4. 本地运行后端
npm run dev --workspace backend

# 5. 在微信开发者工具打开 src/mini-program
# 如需自定义后端地址，改 app.js / globalData.apiBaseUrl
```

---

## 5. 环境配置

后端通过 `backend/.env` 读取环境变量：

| 变量 | 描述 | 默认/回退 |
| --- | --- | --- |
| `PORT`, `HOST` | Fastify 监听 | 8080 / 0.0.0.0 |
| `COS_BUCKET`, `COS_REGION`, `COS_ACCESS_KEY`, `COS_SECRET_KEY` | 腾讯 COS 凭证 | 检测到 `COS_LOCAL_PATH` 时可省 |
| `COS_INDEX_KEY` | 目录索引对象键 | `catalog/index.json` |
| `TELEMETRY_ENDPOINT` | 遥测导出 HTTP 端点 | 必填 |
| `TELEMETRY_ENABLED` | 启用远程遥测 | `true` |
| `LM_API_KEY` | 默认 LLM API Key | Mock 时可省 |
| `LLM_PROVIDER` | `deepseek` \| `qwen` | `qwen` |
| 提供商专属字段 | `DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL` 等 | 见 `config.ts` |
| `LLM_MOCK` | 启用 Mock 响应 | `false` |
| `WECHAT_APP_ID`, `WECHAT_APP_SECRET`, `WECHAT_MOCK` | 微信登录 | 默认 Mock（`WECHAT_MOCK=true`） |
| `SESSION_TTL_MINUTES` | 会话 Token TTL | 30 |
| `USER_STORE_PATH`, `BEHAVIOR_STORE_PATH` | 快照存储路径重写 | 可选 |

> **安全**：勿提交真实密钥，`.gitignore` 已排除 `.env`。

---

## 6. 使用后端

### 安装与构建
```bash
npm install --workspace backend
npm run build --workspace backend
```

### 开发服务
```bash
npm run dev --workspace backend
```

### 测试
```bash
npm test --workspace backend   # 契约 + 集成测试
npm run lint --workspace backend
```

### 关键文件
- `backend/src/index.ts`：服务启动（路由、遥测、目录刷新调度）。
- `backend/src/config.ts`：环境解析，COS/LLM/微信配置。
- `backend/src/routes/*`：auth、stories、catalog、recommendations、telemetry、users 路由。
- `backend/src/services/deepseekProxy.ts`：提示组装、提供商切换、重试抓取。
- `backend/src/services/recommendations.ts`：打分算法与多样性选择。
- `backend/src/services/interestVector.ts`：兴趣向量更新（选项、跳过、收藏）。
- `backend/src/storage/*.ts`：JSON 快照持久化。

---

## 7. 使用小程序

### 设置
1. 在微信开发者工具打开 `src/mini-program`。
2. 确认 `app.js` 中 `globalData.apiBaseUrl` 指向后端。
3. 若未启服务，可开启 Mock（`LLM_MOCK=true`，`WECHAT_MOCK=true`）。

### 测试（Jest）
```bash
npm test --workspace src/mini-program
```

### 关键页面
- `pages/story/index.js`：故事执行、LLM 请求、遥测提交。
- `pages/catalog/index.js`：主题列表、搜索、轮询、推荐刷新、收藏切换。
- `pages/favorites/index.js`：资料展示、登录流程、夜间模式、模型偏好。

### 工具方法
- `utils/api.js`：带会话 Token 的 HTTP 包装。
- `utils/storage.js`：本地收藏缓存。
- `components/loading-sequence`：加载动画。

---

## 8. 数据与存储模型

`backend/snapshots/` 下的 JSON 快照提供轻量持久化：

1. **用户存储（`user-store.json`）**
   - `userId`、`openId`、资料（`nickName`、`avatarUrl`）。
   - `favorites`：`{ themeId, title, description }` 列表。
   - `interestVector`：标签 → 权重（最多 50 个标签）。
   - 会话：`sessionToken`、`sessionExpiresAt`。
   - 时间戳：`createdAt`、`updatedAt`、`lastLoginAt`。

2. **行为存储（`behavior-store.json`）**
   - `userHistory[userId][themeId]`：`plays`、`optionClicks`、`skips`、`lastPlayedAt`、`maxTurnDepth`。
   - `themeStats[themeId]`：聚合的 `plays`、`favorites`、`optionClicks`、`skips`。

3. **目录（`catalog/index.generated.json`）**
   - `catalogVersion`、主题列表及元数据（`themeId`、`title`、`description`、`tags`、`lastUpdated`、`promptPath` 等）。

> 快照在首次访问时延迟加载、去重，并在变更后写回。

---

## 9. 推荐逻辑

对每个主题 `t` 计算：

- **用户画像向量** `p(tag)`：
  - 先取存储的 `interestVector`，为空则从收藏与历史推导。
  - 选项交互：每点一次 +0.4（权重后封顶 3.0）。
  - 回合深度：每层 +0.2（封顶 2.0）。
  - 完成奖励：+3.0。
  - 收藏奖励：+2.0（不衰减）。
  - 跳过惩罚：浅/中/深分别 −1.2 / −0.8 / −0.3。
  - 衰减系数 0.96，每次更新后清理接近 0 的项，取前 50 个标签，权重区间 ±10。

- **得分组件**：
  - 与主题标签的余弦相似度 `sim(u,t)`。
  - 热度权重 `0.15 * (plays + 2*favorites + 0.5*optionClicks)`。
  - 新鲜度权重 `0.2 * exp(-ageDays / 14)`。
  - 跳过惩罚 `0.5 * skips`。

- **最终得分**：
  ```
  score = sim + popularityWeight - skipPenalty + freshWeight
  ```

- **多样性过滤**：
  - 按得分贪心选取，每个主标签最多 2 个，保证多样。
  - 剩余名额按最高分填充，最多返回 10 个。
  - 推荐理由：
    - 相似度 > 0.15 且主标签权重大于 0：“因为你喜欢 <tag>”。
    - 否则若新鲜度 > 0.4：“新鲜上线”。
    - 否则：“热门推荐”。

---

## 10. 遥测与可观测性

- **服务日志**：Winston 输出到 stdout（带时间戳的 JSON）。
- **遥测客户端**（`telemetry/metrics.ts`）：
  - 关闭时 no-op；开启时向配置端点 POST 回合/推荐事件。
  - 回合事件包含 `sessionIdHash`、`themeId`、`turnIndex`、`latencyMs`、`outcome`。
  - 推荐事件包含 `userIdHash`、`themeId`、`action`、`recSetId`、`position`、`reason`。
- **生命周期钩子**：启动时配置遥测；故事路由在成功或错误时上报。
- **目录缓存**：`themeIndex` 在内存中缓存 5 分钟，调度器周期刷新。

---

## 11. 项目结构

```
.
├─ backend/
│  ├─ src/
│  │  ├─ routes/          Fastify 路由
│  │  ├─ services/        LLM 代理、推荐、兴趣向量、目录、认证
│  │  ├─ storage/         JSON 快照（用户、行为、COS）
│  │  ├─ telemetry/       遥测客户端初始化
│  │  └─ utils/           公共工具（会话 Token）
│  ├─ tests/              契约与集成测试
│  └─ snapshots/          默认 JSON 数据
├─ src/mini-program/
│  ├─ pages/              目录、故事、收藏页面
│  ├─ components/         可复用组件
│  ├─ utils/              HTTP、存储、遥测工具
│  └─ tests/              小程序 Jest 测试
├─ catalog/               生成的目录索引、标签摘要、提示词
├─ themes/                提示词源文件
├─ docs/                  补充文档（内容规范、观测、发布）
├─ specs/                 Spec-kit 计划、需求、数据模型
├─ tools/                 构建脚本（目录生成）
└─ package.json           Workspace 配置
```

---

## 12. 开发流程

- **Spec-kit + Codex**：结构化任务与规格位于 `specs/`。
- **分支策略**：默认分支 `main`，新特性使用主题分支。
- **测试**：推送前运行 `npm test`（跨 workspace）。
- **Lint**：`npm run lint --workspace backend`。
- **遥测 Mock**：本地无端点时可 `TELEMETRY_ENABLED=false`。

---

## 13. 故障排查

| 问题 | 诊断 | 解决 |
| --- | --- | --- |
| 后端因缺少环境变量启动失败 | COS/遥测/LLM 凭证缺失 | 补充 `backend/.env` |
| 故事生成提示提供商不可用 | `LLM_MOCK=false` 但 API Key 为空 | 配置密钥或启用 Mock |
| 小程序登录失败 | `WECHAT_MOCK=false` 且无真实凭证 | 切换 Mock 或配置 appId/secret |
| 目录不更新 | 内存缓存未刷新 | GET `/__catalog-demo` 后 DELETE `/__catalog-demo` 清缓存 |
| 推荐列表为空 | 行为数据缺失或 LLM 不可达 | 检查快照并确认后端可达 |
| 遥测请求被拒 | 端点不可访问 | 关闭遥测或修复端点 |

---

## 14. 许可证

MIT

---
