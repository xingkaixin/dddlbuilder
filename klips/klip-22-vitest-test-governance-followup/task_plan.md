# Task Plan: Vitest 测试治理与缺口补齐（klip-22）

## Goal
在不影响当前可用性的前提下，分批修复已识别测试治理问题，建立可持续回归保护网。

## Phases
- [x] Phase 1: P1 缺陷修复（SQLServer 注释层级）
- [x] Phase 2: 核心策略单测补齐（MySQL/PostgreSQL/SQLServer/Oracle）
- [x] Phase 3: parse-sql 路由错误分支补测
- [ ] Phase 4: 覆盖率口径治理与门禁校准
- [ ] Phase 5: 回归验证与文档收敛

## TODO Checklist

### Phase 1: P1 缺陷修复
- [x] 修复 `src/strategies/SqlServerStrategy.ts` 表注释 `@level1type` 逻辑
- [x] 为该缺陷补充回归测试（含 schema 场景）
- [x] 本地验证 `bun run test:run`

### Phase 2: 核心策略单测补齐
- [x] 新增 `mysql-strategy.test.ts`
- [x] 新增 `postgres-strategy.test.ts`
- [x] 新增 `sqlserver-strategy.test.ts`
- [x] 新增 `oracle-strategy.test.ts`
- [x] 覆盖默认值/自增/注释/schema 命名关键分支

### Phase 3: parse-sql 路由补测
- [x] 新增 `api/__tests__/parse-sql-route.test.ts`
- [x] 覆盖 `SQL_REQUIRED`
- [x] 覆盖 `INVALID_DATABASE_TYPE`
- [x] 覆盖 `SQL_PARSE_FAILED`

### Phase 4: 覆盖率治理
- [ ] 评估并调整 `vitest.config.ts` 的 `coverage.include`
- [ ] 评估并调整 `coverage.exclude`，避免过度排除业务逻辑文件
- [ ] 确认调整后阈值仍合理且可执行

### Phase 5: 回归与收敛
- [ ] 执行 `bun run lint`
- [ ] 执行 `bun run test:run`
- [ ] 执行 `bun run test:coverage`
- [ ] 回填 `README.md` 中的跟进记录与状态

## Issue Log
| 日期 | 事项ID | 问题 | 级别 | 状态 | 备注 |
|------|--------|------|------|------|------|
| 2026-02-21 | F-001 | SQLServer 表注释层级类型错误 | P1 | Resolved | 已修复并新增回归测试 |
| 2026-02-21 | F-002 | 覆盖率统计口径存在盲区 | P2 | Open | 当前阈值可通过但不完整 |
| 2026-02-21 | F-003 | 4 个核心策略缺少直接单测 | P2 | Resolved | 已补齐 MySQL/PostgreSQL/SQLServer/Oracle 策略测试 |
| 2026-02-21 | F-004 | parse-sql 关键错误分支覆盖不全 | P3 | Resolved | 已新增 route 测试并覆盖三类错误码 |

## Status
**In Progress** — 2026-02-21
