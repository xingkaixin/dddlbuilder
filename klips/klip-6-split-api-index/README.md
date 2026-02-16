---
created: "2026-02-16"
updated: "2026-02-16"
status: "completed"
priority: "P0"
---

# api/index.ts 拆分（klip-6）

**目标文件**: `api/index.ts`（595 行）  
**创建日期**: 2026-02-16  
**完成日期**: 2026-02-16  
**优先级**: P0

---

## 问题记录

`api/index.ts` 原先承担了过多职责：

1. CORS 与请求体限制工具函数。
2. `/parse-sql`、`/explain`、`/review`、`/generate-table` 多个路由。
3. OpenAI 客户端初始化与流式响应处理。
4. 大段系统提示词模板，影响可读性与审查效率。

---

## 实施结果（最小改动）

按职责拆分为路由、prompt 与 HTTP 工具层，并保持原 API 路径与行为：

1. 新增 `api/lib/http.ts`
2. 新增 `api/prompts/explain.ts`
3. 新增 `api/prompts/review.ts`
4. 新增 `api/prompts/generateTable.ts`
5. 新增 `api/routes/parseSql.ts`
6. 新增 `api/routes/explain.ts`
7. 新增 `api/routes/review.ts`
8. 新增 `api/routes/generateTable.ts`
9. `api/index.ts` 精简为 app 初始化 + CORS + 路由注册

### 行数对比

| 文件 | 拆分前 | 拆分后 |
|------|--------|--------|
| `api/index.ts` | 595 | 43 |
| `api/lib/http.ts` | — | 74 |
| `api/prompts/explain.ts` | — | 10 |
| `api/prompts/review.ts` | — | 73 |
| `api/prompts/generateTable.ts` | — | 84 |
| `api/routes/parseSql.ts` | — | 76 |
| `api/routes/explain.ts` | — | 82 |
| `api/routes/review.ts` | — | 123 |
| `api/routes/generateTable.ts` | — | 112 |

---

## 验证结果

1. `bun run lint` ✅
2. `bun run test:run` ✅（65 files / 634 tests）

---

## 持续跟进

- 任务清单: `klips/klip-6-split-api-index/task_plan.md`
