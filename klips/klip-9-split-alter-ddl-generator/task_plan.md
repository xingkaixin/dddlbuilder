# Task Plan: alterDdlGenerator.ts 拆分

## Goal
按语句类型拆分 DDL 生成逻辑，降低圈复杂度并保持输出一致性。

## Phases
- [ ] Phase 1: 逻辑切面识别
- [ ] Phase 2: 语句模块拆分
- [ ] Phase 3: 聚合导出与兼容
- [ ] Phase 4: 回归验证

## TODO Checklist

### Phase 1: 切面识别
- [ ] 列出字段、索引、表注释、默认值、回滚各自逻辑边界
- [ ] 标记跨函数共享依赖

### Phase 2: 模块拆分
- [ ] 创建 `alter-ddl/columnStatements.ts`
- [ ] 创建 `alter-ddl/indexStatements.ts`
- [ ] 创建 `alter-ddl/defaultClause.ts`
- [ ] 创建 `alter-ddl/generateAlterDDL.ts`
- [ ] 创建 `alter-ddl/generateRollbackDDL.ts`

### Phase 3: 接口兼容
- [ ] 保持 `src/utils/alterDdlGenerator.ts` 出口兼容
- [ ] 清理重复分支逻辑

### Phase 4: 验证
- [ ] 执行 `bun run lint`
- [ ] 执行 `bun run test:run`

## Issue Log
| 日期 | 位置 | 问题 | 级别 | 状态 | 备注 |
|------|------|------|------|------|------|
| 2026-02-16 | `src/utils/alterDdlGenerator.ts` | 正向/回滚/细节函数耦合 | Medium | Open | 待拆分 |

## Status
**Planned** — 2026-02-16
