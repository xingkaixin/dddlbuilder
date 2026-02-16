# Task Plan: SqlParser.ts 拆分

## Goal
将 SQL 解析流程按核心编排、AST 处理器、normalize 工具拆分，降低复杂度并保持兼容。

## Phases
- [x] Phase 1: 解析流程与辅助函数分层
- [x] Phase 2: AST 处理器抽离
- [x] Phase 3: 保持外部 API 稳定
- [x] Phase 4: 回归验证

## TODO Checklist

### Phase 1: 分层设计
- [x] 明确 `SqlParser` 对外最小接口
- [x] 梳理当前私有方法归属（loader/preprocess/normalizer/handler）

### Phase 2: 模块拆分
- [x] 创建 `sql-parser/types.ts`
- [x] 创建 `sql-parser/parserLoader.ts`
- [x] 创建 `sql-parser/preprocessMysql.ts`
- [x] 创建 `sql-parser/normalizers.ts`
- [x] 创建 `sql-parser/astHandlers.ts`

### Phase 3: 接口回接
- [x] 在 `SqlParser.ts` 中回接新模块
- [x] 确保 `parse` / `parseAsync` 行为一致
- [x] `parseWithParser` 暂保留在 `SqlParser.ts`（编排层）

### Phase 4: 验证
- [x] 执行 `bun run lint`
- [x] 执行 `bun run test:run`

## Issue Log
| 日期 | 位置 | 问题 | 级别 | 状态 | 备注 |
|------|------|------|------|------|------|
| 2026-02-16 | `src/utils/SqlParser.ts` | 解析编排与映射规则耦合 | High | Closed | 已完成模块拆分 |

## Status
**Completed** — 2026-02-16
