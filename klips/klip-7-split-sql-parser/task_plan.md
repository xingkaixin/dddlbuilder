# Task Plan: SqlParser.ts 拆分

## Goal
将 SQL 解析流程按核心编排、AST 处理器、normalize 工具拆分，降低复杂度并保持兼容。

## Phases
- [ ] Phase 1: 解析流程与辅助函数分层
- [ ] Phase 2: AST 处理器抽离
- [ ] Phase 3: 保持外部 API 稳定
- [ ] Phase 4: 回归验证

## TODO Checklist

### Phase 1: 分层设计
- [ ] 明确 `SqlParser` 对外最小接口
- [ ] 梳理当前私有方法归属（core/handler/normalizer）

### Phase 2: 模块拆分
- [ ] 创建 `sql-parser/core/parserLoader.ts`
- [ ] 创建 `sql-parser/core/parseWithParser.ts`
- [ ] 创建 `sql-parser/handlers/createTable.ts`
- [ ] 创建 `sql-parser/handlers/indexAndGrant.ts`
- [ ] 创建 `sql-parser/normalizers/value.ts`

### Phase 3: 接口回接
- [ ] 在 `SqlParser.ts` 中回接新模块
- [ ] 确保 `parse` / `parseAsync` 行为一致

### Phase 4: 验证
- [ ] 执行 `bun run lint`
- [ ] 执行 `bun run test:run`

## Issue Log
| 日期 | 位置 | 问题 | 级别 | 状态 | 备注 |
|------|------|------|------|------|------|
| 2026-02-16 | `src/utils/SqlParser.ts` | 解析编排与映射规则耦合 | High | Open | 待拆分 |

## Status
**Planned** — 2026-02-16
