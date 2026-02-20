---
created: "2026-02-20"
updated: "2026-02-20"
status: "ready"
priority: "P0"
---

# 强交互状态自治评估（klip-12）

## 背景与现状
- 当前核心状态已拆分至 `src/stores/appStore.ts`、`src/stores/fieldStore.ts`、`src/stores/indexStore.ts`、`src/stores/partitionStore.ts`、`src/stores/shardingStore.ts`。
- 强交互局部态仍分散在组件内部，例如 `src/components/App/DataTable.tsx`（选中单元格、导航、拖拽过程态）与 `src/components/App/IndexPanel.tsx`（编辑索引名、建议面板局部态）。
- 已有渲染范围验证基础：`src/__tests__/stores/subscriptionScope.test.tsx`。

## 待解决问题
- 强交互链路（拖拽排序、字段重命名联动、跨面板同步）中，局部状态与全局状态边界仍不够统一。
- 局部状态过深时，容器组件需要传递较多行为函数，维护成本上升。
- 需要评估是否引入“交互态专用 store”以降低重复渲染与沟通成本。

## 拟新增 API / 接口 / 类型草案
- `InteractionStateSlice`
- `TableInteractionState`
- `useTableInteractionStore()`
- `setSelectedCell()` / `setEditingRow()` / `setDragState()`

## 候选方案
### 方案 A：维持现状，仅继续 selector 微调
- 优点：改动最小，短期风险最低。
- 缺点：复杂交互增长后，状态分布仍会继续分散。

### 方案 B：为强交互域引入“局部 Zustand slice”（推荐）
- 优点：状态自治，降低跨层传参与重复渲染风险；与现有 Zustand 体系一致。
- 缺点：需要明确 store 边界，避免将短生命周期 UI 态过度全局化。

### 方案 C：全面状态全局化
- 优点：统一入口。
- 缺点：高耦合、高噪声，不符合最小化改动原则。

## 影响面
- 组件：`src/components/App/DataTable.tsx`、`src/components/App/IndexPanel.tsx`、`src/components/App/PartitionPanel.tsx`
- Store：`src/stores/*`
- Hooks：`src/components/App/table/useDataTableNavigation.ts` 等
- 服务：无直接影响
- 测试：`src/__tests__/stores/subscriptionScope.test.tsx`、DataTable 交互测试
- i18n：无直接新增文案

## 风险与依赖
- 风险：状态边界定义不清导致“全局态膨胀”。
- 回归面：单元格导航、拖拽排序、索引联动、分区/分片字段联动。
- 依赖：现有 Zustand 模式与 selector 订阅策略。

## 评估矩阵
| 维度 | 评分(1-5) | 说明 |
|---|---:|---|
| 收益 | 5 | 对复杂交互可维护性与渲染稳定性收益高 |
| 复杂度 | 3 | 需要边界设计与迁移顺序控制 |
| 风险 | 3 | 主要是状态语义迁移引发行为回归 |
| 可逆性 | 4 | 分域迁移可回退 |

## 验收口径（评估 DoD）
- 给出“哪些状态入 store、哪些保留局部”的清单与判定规则。
- 识别至少 2 条可先落地的低风险迁移路径。
- 明确性能观测指标（重渲染次数、交互延迟）与基线采样方式。
- 形成是否进入开发的决策结论。

## 下一步决策项
- Go：边界清晰且预估收益显著。
- Hold：边界争议较大，先补采样与可视化观测。
- Drop：确认现有结构已足够支撑中短期需求。
