# Task Plan: useRef 与 Zustand 职责治理

## Goal
在保持现有行为不变的前提下，持续收敛“初始化哨兵位”实现，避免无收益的全量 `useRef -> zustand` 改造。

## Phases
- [x] Phase 1: 输出可行性评估与边界结论
- [x] Phase 2: 落地第一批最小改动（4 个域的 hydration 标记下沉到 store）
- [x] Phase 3: 回归验证（lint/test/e2e 视改动范围）
- [x] Phase 4: 第二批可选优化评估（`usePersistedState` / `useDialogState`）
- [ ] Phase 5: 阶段复盘与规范固化（开发约定 + 代码审查清单）

## Key Questions
1. `usePersistedState` 的 `hydratedRef` 是否值得在不引入行为风险前提下去除？
2. `useDialogState` 的 `initialDataRef` 是否保留当前设计，还是引入更明确的 `reset` 策略？
3. 是否需要新增 lint 规则，限制“可疑全局状态化”的改动？

## Decisions Made
- 不做全量 `useRef -> zustand`。
- 仅对可选且低风险的“初始化哨兵位”做增量治理。
- DOM 引用、定时器、请求控制、交互瞬时态继续使用 `useRef`。
- `usePersistedState` 已去除 `hydratedRef`，使用 `hydrated` 门控保存逻辑。
- `useDialogState` 保留 `initialDataRef`（首帧快照）实现，避免引入 reset 语义变更。

## Errors Encountered
- 暂无

## TODO Checklist
- [x] 为 `authStore` 增加 `hydratedFromPersisted` 与标记方法
- [x] 为 `tableOptionsStore` 增加 `hydratedFromPersisted` 与标记方法
- [x] 为 `partitionStore` 增加 `hydratedFromPersisted` 与标记方法
- [x] 为 `shardingStore` 增加 `hydratedFromPersisted` 与标记方法
- [x] 更新 `useAuthManagement` 去除 `initializedRef`
- [x] 更新 `useTableOptions` 去除 `initializedRef`
- [x] 更新 `useMysqlPartition` 去除 `initializedRef`
- [x] 更新 `useCitusSharding` 去除 `initializedRef`
- [x] 补充 4 个 store 对应测试（校验 reset 后标记清理）
- [x] 执行 `bun run lint`
- [x] 执行 `bun run test:run`
- [ ] 如涉及 UI 交互改动，执行 `bun run test:e2e`（本轮无需）
- [x] 更新 `klip-1` 文档的验证结果与下一步计划
- [x] 更新 `usePersistedState` 并补充分享参数场景持久化断言
- [x] 补充 `useDialogState` “初始快照语义”测试

## Validation Snapshot (2026-02-15)
- `bun run lint`: 通过（`biome check .`）
- `bun run test:run`: 通过（`62 files / 615 tests`）
- `bun run test:e2e`: 本轮未执行（未涉及 UI 交互行为调整）

## Status
**Currently in Phase 5** - 收敛本轮经验并固化后续代码审查约束。
