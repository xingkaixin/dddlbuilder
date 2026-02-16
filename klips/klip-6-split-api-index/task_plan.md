# Task Plan: api/index.ts 拆分

## Goal
将 API 入口文件按路由、提示词、公共工具拆分，降低耦合并保持行为不变。

## Phases
- [x] Phase 1: 路由与依赖盘点
- [x] Phase 2: Prompt 与公共函数抽离
- [x] Phase 3: 路由模块化接入
- [x] Phase 4: 回归验证

## TODO Checklist

### Phase 1: 路由盘点
- [x] 盘点四个路由输入输出与共享依赖
- [x] 识别可复用错误处理与流式输出逻辑

### Phase 2: 抽离公共模块
- [x] 创建 `api/prompts/explain.ts`
- [x] 创建 `api/prompts/review.ts`
- [x] 创建 `api/prompts/generateTable.ts`
- [x] 创建 `api/lib/http.ts`

### Phase 3: 路由模块化
- [x] 创建 `api/routes/parseSql.ts`
- [x] 创建 `api/routes/explain.ts`
- [x] 创建 `api/routes/review.ts`
- [x] 创建 `api/routes/generateTable.ts`
- [x] 更新 `api/index.ts` 为轻量入口

### Phase 4: 验证
- [x] 执行 `bun run lint`
- [x] 执行 `bun run test:run`

## Issue Log
| 日期 | 位置 | 问题 | 级别 | 状态 | 备注 |
|------|------|------|------|------|------|
| 2026-02-16 | `api/index.ts` | 路由+Prompt+工具函数混合 | High | Closed | 已完成模块拆分 |

## Status
**Completed** — 2026-02-16
