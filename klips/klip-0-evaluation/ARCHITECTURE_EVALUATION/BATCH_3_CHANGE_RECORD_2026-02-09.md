# Batch 3 整改记录（2026-02-09）

## 1. 基本信息

- 批次: `Batch 3`
- 日期: `2026-02-09`
- 执行人: `Codex`
- 对应计划: `EXECUTION_PLAN.md`

## 2. 变更范围

### 2.1 目标

- 拆分 `App/index.tsx` 的渲染区为容器组件
- 降低主组件 JSX 复杂度，建立功能域边界
- 将文件夹/模板/Schema 应用等高复杂度动作下沉到 App 域 hooks

### 2.2 改动文件

- `src/components/App/index.tsx`
- `src/components/App/containers/SavedTablesContainer.tsx`
- `src/components/App/containers/TableBuilderContainer.tsx`
- `src/components/App/containers/OutputContainer.tsx`
- `src/components/App/containers/GlobalDialogs.tsx`
- `src/components/App/hooks/useFolderActions.ts`
- `src/components/App/hooks/useTemplateActions.ts`
- `src/components/App/hooks/useSchemaApplyActions.ts`
- `src/components/App/hooks/useSavedTableFlowActions.ts`
- `src/components/App/hooks/usePersistedSync.ts`
- `src/components/App/hooks/useApplySavedState.ts`
- `src/components/App/hooks/useClearAllActions.ts`
- `src/components/App/hooks/useReviewActions.ts`
- `src/components/App/hooks/useShareAction.ts`
- `src/components/App/hooks/useNavigationActions.ts`
- `src/components/App/hooks/useTemplateToolbarLeft.tsx`
- `klips/klip-0-evaluation/EXECUTION_PLAN.md`
- `klips/klip-0-evaluation/baselines/baseline-2026-02-09.md`
- `klips/klip-0-evaluation/baselines/baseline-2026-02-09.json`

### 2.3 非目标范围

- 不处理状态管理二期（字段/索引 store 化）
- 不一次性将 `App/index.tsx` 压到 <1000 行

## 3. 风险评估

| 风险项 | 影响 | 应对措施 |
| --- | --- | --- |
| 容器组件 props 过多 | 可读性下降 | 通过 `ComponentProps` 复用类型并保持容器职责清晰 |
| 拆分后行为回归 | 主流程功能异常 | 全量 lint + test 回归，并保持业务逻辑未改 |
| hooks 入参较多 | 维护成本增加 | 保持 App 域 hooks 内聚、仅抽离同一职责动作 |
| 重构深度不足 | 行数目标未达成 | 将“逻辑内聚”放入后续批次继续收敛 |

## 4. 验证结果

### 4.1 自动化

- [x] `bun run lint` 通过
- [x] `bun run test:run` 通过
- [ ] `bun run build` 通过（本批次未执行）

### 4.2 人工冒烟

- [ ] 本次未执行 UI 人工冒烟（建议合并前补充）

## 5. 指标变化

- 基线文件: `klips/klip-0-evaluation/baselines/baseline-2026-02-09.md`
- 关键变化（相较批次 2）:
  - `src/components/App/index.tsx` 行数: `2086 -> 1431`（-655）
  - `useState` 数量: `12 -> 8`（-4）
  - App 内 `console.error` 数量: `0 -> 0`
- 复核追加（2026-02-09）:
  - `src/components/App/index.tsx` 当前行数: `998`
  - 保存/加载/重命名/删除流程动作已抽离到 `src/components/App/hooks/useSavedTableFlowActions.ts`
  - 持久化同步链路（hydrate/save）已抽离到 `src/components/App/hooks/usePersistedSync.ts`
  - `applySavedState`、清空流程、评审副作用、分享与导航回调已拆分到 App 域 hooks

## 6. 回滚步骤

1. 删除 `src/components/App/containers/` 新增容器文件。
2. 回退 `src/components/App/index.tsx` 到拆分前版本。
3. 执行 `bun run lint && bun run test:run` 验证回滚结果。

## 7. 结论与下一步

- 本批次结论: `核心任务完成（DoD 待补齐）`
  - 已完成渲染层容器拆分。
  - 已完成文件夹/模板/Schema 应用动作的 App 域 hooks 下沉。
  - 已完成第一刀与第二刀：保存/加载/重命名/删除主流程下沉到 `useSavedTableFlowActions`。
  - 已完成第三刀：持久化同步（hydrate/save）下沉到 `usePersistedSync`。
  - 已达成 `App/index.tsx < 1000`（当前 `998`）。

## 8. 待办事项（复核后）

- [x] 已推进: 保存/加载主流程与加载确认链路已下沉到 `useSavedTableFlowActions`。
- [x] 已推进: 重命名/删除主流程已下沉到 `useSavedTableFlowActions`。
- [x] 已推进: 持久化同步链路（hydrate/save）已下沉到 `usePersistedSync`。
- [x] 已推进: `App/index.tsx` 已进一步收敛到“布局与编排”职责，并降到 `<1000`。
- [ ] 待办: 补 `build` 与人工冒烟，完成批次3 DoD 闭环。
