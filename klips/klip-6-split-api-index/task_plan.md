# Task Plan: api/index.ts 拆分

## Goal
将 API 入口文件按路由、提示词、公共工具拆分，降低耦合并保持行为不变。

## Phases
- [ ] Phase 1: 路由与依赖盘点
- [ ] Phase 2: Prompt 与公共函数抽离
- [ ] Phase 3: 路由模块化接入
- [ ] Phase 4: 回归验证

## TODO Checklist

### Phase 1: 路由盘点
- [ ] 盘点四个路由输入输出与共享依赖
- [ ] 识别可复用错误处理与流式输出逻辑

### Phase 2: 抽离公共模块
- [ ] 创建 `api/prompts/explain.ts`
- [ ] 创建 `api/prompts/review.ts`
- [ ] 创建 `api/prompts/generateTable.ts`
- [ ] 创建 `api/lib/http.ts`

### Phase 3: 路由模块化
- [ ] 创建 `api/routes/parseSql.ts`
- [ ] 创建 `api/routes/explain.ts`
- [ ] 创建 `api/routes/review.ts`
- [ ] 创建 `api/routes/generateTable.ts`
- [ ] 更新 `api/index.ts` 为轻量入口

### Phase 4: 验证
- [ ] 执行 `bun run lint`
- [ ] 执行 `bun run test:run`

## Issue Log
| 日期 | 位置 | 问题 | 级别 | 状态 | 备注 |
|------|------|------|------|------|------|
| 2026-02-16 | `api/index.ts` | 路由+Prompt+工具函数混合 | High | Open | 待拆分 |

## Status
**Planned** — 2026-02-16
