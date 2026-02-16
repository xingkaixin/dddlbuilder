---
created: "2026-02-16"
updated: "2026-02-16"
status: "planned"
priority: "P0"
---

# api/index.ts 拆分（klip-6）

**目标文件**: `api/index.ts`（595 行）  
**创建日期**: 2026-02-16  
**优先级**: P0

---

## 问题记录

`api/index.ts` 当前承担了过多职责：

1. CORS 与请求体限制工具函数。
2. `/parse-sql`、`/explain`、`/review`、`/generate-table` 多个路由。
3. OpenAI 客户端初始化与流式响应处理。
4. 大段系统提示词模板，影响可读性与审查效率。

**风险**：
- 任一路由改动都容易触碰同文件其他逻辑。
- Prompt 与路由实现耦合，不利于版本化管理。

---

## 拆分边界（最小改动）

1. `api/routes/*.ts`：按路由拆分处理函数。
2. `api/prompts/*.ts`：抽离 explain/review/generate 的系统提示词。
3. `api/lib/http.ts`：保留 `errorResponse`、`parseJsonBodyWithLimit` 等通用函数。
4. `api/index.ts` 仅保留 app 初始化 + 路由注册。

---

## 验证计划

1. `bun run lint`
2. `bun run test:run`
3. 如涉及前端交互变更，再执行 `bun run test:e2e`

---

## 持续跟进

- 任务清单: `klips/klip-6-split-api-index/task_plan.md`
