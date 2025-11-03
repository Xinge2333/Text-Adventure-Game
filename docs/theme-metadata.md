# 主题提示词与标签元数据

为了支撑 150+ 乃至 1000+ 个 `.txt` 提示词，我们约定每个主题文件开头必须携带一段 JSON front-matter，用来描述标签、主题 ID 等结构化信息。该数据随后由 `tools/build-catalog.js` 聚合生成 `catalog/index.generated.json`，供后台加载、推荐算法计算与目录展示使用。

## Front-matter 结构

每个 `.txt` 需在第一行写入 `---`，接着是一段 **合法 JSON**，再写入 `---`。示例：

```
---
{
  "themeId": "school-revenge",
  "title": "复仇游戏：攻略了仇人的儿子",
  "description": "复仇少女潜入名校，与仇人之子斗智斗勇的暗流游戏",
  "tags": ["校园", "复仇", "多主角"],
  "primaryTag": "校园",
  "keywords": ["情感操控", "豪门"],
  "tone": "悬疑",
  "maturity": "teen"
}
---
正文提示词……
```

字段要求：

- `themeId`：必填，短横线风格 ID，唯一。
- `title`：必填，展示标题。
- `description`：必填，用于目录 / 推荐理由的简述。
- `tags`：必填数组，主标签 + 次标签；脚本会自动去重、为推荐算法做画像。
- `primaryTag`：可选，未提供时默认取 `tags[0]`。
- `keywords`、`tone`、`maturity`、`series` 等可选字段会原样透传，便于后续精细化推荐或分级。

## 构建 Catalog 索引

执行根目录脚本将扫描 `.txt` 并生成索引与标签统计：

```bash
# 默认扫描 ./themes 并输出 catalog/index.generated.json
npm run build:catalog

# 自定义输入、输出、版本号和标签汇总
npm run build:catalog -- \
  --input themes,extra-themes \
  --output snapshots/catalog/index.json \
  --summary snapshots/catalog/tag-summary.json \
  --version 2025-q1
```

脚本行为：

1. 递归搜索 `.txt` 文件，读取 front-matter，校验 `themeId/title/description/tags`。
2. 为每个主题写入 `promptPath`（相对仓库路径）、`lastUpdated`（文件 mtime）、`primaryTag` 等字段。
3. 产出 `catalog/index.generated.json`，示例结构：
   ```json
   {
     "catalogVersion": "generated-2025-01-12T08-30-12-345Z",
     "generatedAt": "2025-01-12T08:30:12.345Z",
     "themes": [
       { "themeId": "school-revenge", "tags": ["校园", "复仇"], ... }
     ]
   }
   ```
4. 可选地输出 `tagSummary`（或通过 `--summary` 写入单独文件），帮助运营审视标签覆盖率。

## 后台接入

- 本地开发：后端会自动检测 `catalog/index.generated.json` 并优先使用；如需自定义路径，可在 `.env` 中设置 `COS_LOCAL_PATH` 覆盖。
- 生产部署：将生成的 `catalog/index.generated.json` 与 `.txt` 提示词一并上传到 COS，`promptPath` 字段指向对应对象 Key。

## 约束与最佳实践

- 所有标签请使用统一词汇表（可在未来扩展独立配置文件），避免「校园」/「校園」等变体导致画像稀释。
- 建议在脚本输出的 `tagSummary` 中检查异常，如标签过多或主题缺少主标签。
- 若需要临时跳过旧文件，可使用 `--allow-missing-frontmatter`，但生成的主题会被忽略；上线前务必补齐 front-matter。

借助这套流程，新增 1000 个 `.txt` 也能保持一致的标签语义，使推荐算法、目录搜索和多样性控制在数据层面可追踪、可扩展。
