# Task Plan: constants.ts 拆分

## Goal
将大体量常量按职责拆分为独立模块，减少文件冲突并提升可读性。

## Phases
- [x] Phase 1: 常量分类与导出策略
- [x] Phase 2: 分文件迁移与兼容导出
- [x] Phase 3: 引用路径渐进收敛（评估后跳过，先保持兼容导出）
- [x] Phase 4: 回归验证

## TODO Checklist

### Phase 1: 分类
- [x] 列出所有导出常量与当前引用点
- [x] 明确数据类常量和 UI 类常量边界

### Phase 2: 迁移
- [x] 创建 `constants/databaseOptions.ts`
- [x] 创建 `constants/reservedKeywords.ts`
- [x] 创建 `constants/uiDefaults.ts`
- [x] 创建 `constants/index.ts` 统一 re-export

### Phase 3: 兼容
- [x] 保留旧导出路径的兼容层
- [x] 按模块逐步替换 import（评估后跳过，不作为本次完成条件）

### Phase 4: 验证
- [x] 执行 `bun run lint`
- [x] 执行 `bun run test:run`

## Issue Log
| 日期 | 位置 | 问题 | 级别 | 状态 | 备注 |
|------|------|------|------|------|------|
| 2026-02-16 | `src/utils/constants.ts` | 多类常量集中导致维护成本高 | Medium | Closed | 已拆分并保留兼容出口 |

## Status
**Completed** — 2026-02-16
