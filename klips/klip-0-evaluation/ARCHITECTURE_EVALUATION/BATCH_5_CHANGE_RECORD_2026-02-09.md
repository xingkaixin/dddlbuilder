# Batch 5 整改记录（2026-02-09）

## 1. 基本信息

- 批次: `Batch 5`
- 日期: `2026-02-09`
- 执行人: `Codex`
- 对应计划: `EXECUTION_PLAN.md`

## 2. 变更范围

### 2.1 目标

- 完成批次5第二阶段：在字段/索引 store 迁移基础上，引入组件内 selector 级订阅。
- 收敛 `DataTable` / `IndexPanel` 管道型传参，降低中间层 props 传递成本。

### 2.2 改动文件

- `src/stores/fieldStore.ts`
- `src/stores/indexStore.ts`
- `src/stores/index.ts`
- `src/components/App/index.tsx`
- `src/components/App/DataTable.tsx`
- `src/components/App/IndexPanel.tsx`
- `src/__tests__/stores/fieldStore.test.ts`
- `src/__tests__/stores/indexStore.test.ts`
- `src/__tests__/stores/subscriptionScope.test.tsx`
- `klips/klip-0-evaluation/EXECUTION_PLAN.md`
- `klips/klip-0-evaluation/BATCH_5_CHANGE_RECORD_2026-02-09.md`

### 2.3 非目标范围

- 本轮不做重度性能压测与细粒度渲染分析（仅做功能回归保障）。
- 本轮不触及分区/分片/授权等其他功能域状态迁移。

## 3. 风险评估

| 风险项 | 影响 | 应对措施 |
| --- | --- | --- |
| store 迁移影响核心编辑链路 | 字段/索引编辑异常 | 保持原行为语义，新增 store 单测并跑全量回归 |
| 迁移后依赖遗漏 | 回调闭包问题 | 通过 lint 的 hooks 依赖规则修复并复测 |
| 任务范围膨胀 | 回归风险增大 | 本轮仅完成状态迁移与 props 收敛，性能压测放下一轮 |

## 4. 验证结果

### 4.1 自动化

- [x] `bun run lint` 通过
- [x] `bun run test:run` 通过（47 files / 564 tests）
- [ ] `bun run build` 通过（本轮未执行）

### 4.2 迁移完成项

- [x] 字段状态迁移到 `fieldStore`（`rows` 与行编辑动作）
- [x] 索引状态迁移到 `indexStore`（输入/候选/索引列表与动作）
- [x] `App` 已切换到 `useFieldStore` / `useIndexStore` 作为字段/索引状态来源
- [x] `DataTable` 已改为组件内直接订阅 `fieldStore + appStore`
- [x] `IndexPanel` 已改为组件内直接订阅 `indexStore + fieldStore + appStore`
- [x] `App -> TableBuilderContainer` 的字段/索引管道 props 已显著收敛

### 4.3 待下一轮项

- [x] 校验重渲染范围并记录性能对比（新增 `subscriptionScope` 测试，验证 selector 订阅边界）

## 5. 指标快照

- 基线文件: `klips/klip-0-evaluation/baselines/baseline-2026-02-09.md`
- `src/components/App/index.tsx` 行数: `1497 -> 1427`
- `src/components/App/index.tsx` 中 `useAppStore` 使用次数: `50`
- `src/components/App/index.tsx` 中 `useFieldStore/useIndexStore` 使用次数: `13`
- `src/components/App/index.tsx` 中 `useState` 使用次数: `0`
- `dataTableProps` 透传字段数: `13 -> 4`
- `indexPanelProps` 透传字段数: `13 -> 2`

## 6. 结论与下一步

- 本次结论: `批次5完成`
- 下一步建议:
  1. 进入批次6，开始 hook 职责拆分与共享逻辑收敛。
