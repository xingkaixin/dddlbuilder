# Batch 1 整改记录（2026-02-09）

## 1. 基本信息

- 批次: `Batch 1`
- 日期: `2026-02-09`
- 执行人: `Codex`
- 对应计划: `EXECUTION_PLAN.md`

## 2. 变更范围

### 2.1 目标

- 清理调试遗留，移除业务代码中的裸 `console.error`
- 引入 App 根错误边界
- 提供统一错误上报入口
- 补齐保存/加载/生成失败态测试

### 2.2 改动文件

- `src/utils/errorReporter.ts`
- `src/components/AppErrorBoundary.tsx`
- `src/main.tsx`
- `src/components/App/index.tsx`
- `src/utils/share.ts`
- `src/utils/SqlParser.ts`
- `src/scripts/parseChangelog.ts`
- `src/__tests__/utils/errorReporter.test.ts`
- `src/__tests__/components/AppErrorBoundary.test.tsx`
- `src/__tests__/hooks/useSavedTables.failure.test.ts`
- `src/__tests__/hooks/useAIGenerateTable.test.ts`
- `klips/klip-0-evaluation/EXECUTION_PLAN.md`

### 2.3 非目标范围

- 不进行大规模组件拆分
- 不进行状态管理二期迁移
- 不修改 DDL 业务逻辑

## 3. 风险评估

| 风险项 | 影响 | 应对措施 |
| --- | --- | --- |
| 错误边界 fallback 影响 UI 体验 | 异常场景展示改变 | fallback 保持最小实现，只在崩溃时展示 |
| 错误上报入口替换不完整 | 诊断链路不一致 | 对 App/share/SqlParser/script 四处统一接入 `reportError` |
| 新增测试与现有 mock 冲突 | 测试不稳定 | 采用独立测试文件，按模块 mock 并在每例后恢复 |

## 4. 验证结果

### 4.1 自动化

- [x] `bun run lint` 通过
- [x] `bun run test:run` 通过
- [ ] `bun run build` 通过（本批次未执行）

### 4.2 人工冒烟

- [ ] 本次未执行 UI 人工冒烟（建议在合并前补充）

## 5. 指标变化

- 关键结果:
  - `src/` 中裸 `console.error` 已清理，仅保留统一入口 `errorReporter.ts`
  - 新增 App 根错误边界组件，运行时渲染异常可被兜底
  - 新增失败态测试:
    - 保存失败: `useSavedTables.failure.test.ts`
    - 加载失败: `useSavedTables.failure.test.ts`
    - 生成失败: `useAIGenerateTable.test.ts`

## 6. 回滚步骤

1. 移除 `main.tsx` 中的 `<AppErrorBoundary>` 包裹。
2. 回退 `reportError` 接入点（`App/index.tsx`、`share.ts`、`SqlParser.ts`、`parseChangelog.ts`）。
3. 删除新增测试文件与 `AppErrorBoundary.tsx`、`errorReporter.ts`。
4. 执行 `bun run lint && bun run test:run` 验证回滚后状态。

## 7. 结论与下一步

- 本批次结论: `完成`
- 下一步建议: 进入 `Batch 2`，开始对话框逻辑抽象（`useDialogState / useDialogManager`）。
