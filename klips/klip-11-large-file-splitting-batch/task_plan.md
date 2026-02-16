# Task Plan: 大文件模块拆分批次（klip-11）

## Goal
建立统一的问题清单与 TODO 跟踪基线，为后续逐项拆分提供可执行计划。

## Phases
- [x] Phase 1: 确认批次范围与优先级
- [x] Phase 2: 建立各子任务 klip 文档
- [ ] Phase 3: 按优先级执行拆分
- [ ] Phase 4: 回归验证与状态收敛

## TODO Checklist

### Phase 1: 范围与优先级
- [x] 识别待拆分目标文件
- [x] 排除已完成拆分项（`klip-2`、`klip-3`）
- [x] 确定批次优先级（P0/P1/P2）

### Phase 2: 子任务文档初始化
- [x] 创建 `klip-6-split-api-index`
- [x] 创建 `klip-7-split-sql-parser`
- [x] 创建 `klip-8-split-constants`
- [x] 创建 `klip-9-split-alter-ddl-generator`
- [x] 创建 `klip-10-split-saved-tables-drawer`

### Phase 3: 执行拆分（后续）
- [ ] 完成 `klip-6` 拆分并验证
- [ ] 完成 `klip-7` 拆分并验证
- [ ] 完成 `klip-8` 拆分并验证
- [ ] 完成 `klip-9` 拆分并验证
- [ ] 完成 `klip-10` 拆分并验证

### Phase 4: 回归验证
- [ ] `bun run lint`
- [ ] `bun run test:run`
- [ ] 涉及 UI 交互改动时执行 `bun run test:e2e`
- [ ] 更新所有 klip 状态与最终行数对比

## Issue Log
| 日期 | 模块 | 问题 | 级别 | 状态 | 备注 |
|------|------|------|------|------|------|
| 2026-02-16 | 批次整体 | 大文件多职责导致维护成本高 | High | Open | 初始建档 |

## Status
**Planned** — 2026-02-16
