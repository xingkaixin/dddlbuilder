---
created: "2026-02-20"
updated: "2026-02-20"
status: "ready"
priority: "P0"
---

# DataTable 字段批量操作评估（klip-16）

## 背景与现状
- `src/components/App/DataTable.tsx` 当前为逐行编辑和逐行删除（`RowActions`）。
- 未提供多选列与批量动作入口。
- 宽表场景（几十到上百字段）下，重复操作成本较高。

## 待解决问题
- 缺少批量删除与批量属性修改能力，效率瓶颈明显。
- 需要评估“多选态 + 批量动作”对现有交互与性能的影响。

## 拟新增 API / 接口 / 类型草案
- `BulkSelectionState`
- `BulkActionPayload`
- `applyBulkUpdate()`
- `clearBulkSelection()`

## 候选方案
### 方案 A：仅支持批量删除
- 优点：范围最小。
- 缺点：无法覆盖高频批量修改场景。

### 方案 B：支持多选 + 删除 + 属性批量变更（推荐）
- 优点：覆盖典型场景（如统一 NOT NULL、统一前缀）。
- 缺点：需要明确冲突规则与失败回滚语义。

### 方案 C：高级批处理（条件筛选、表达式）
- 优点：能力更强。
- 缺点：复杂度高，超出当前目标。

## 影响面
- 组件：`src/components/App/DataTable.tsx`、`src/components/App/table/columns.tsx`、`src/components/App/table/DataTableToolbar.tsx`
- Store：`src/stores/fieldStore.ts`（批量更新入口）
- Hooks：`useFieldRowMutations`、可能新增 `useBulkSelection`
- 服务：无
- 测试：批量操作单测、组件交互测试、E2E 回归
- i18n：批量操作按钮、确认提示文案

## 风险与依赖
- 风险：大批量更新导致渲染卡顿；与撤销系统耦合边界不清。
- 回归面：行顺序、复制粘贴、冻结列、删除确认流程。
- 依赖：字段 store 的批量原子更新能力。

## 评估矩阵
| 维度 | 评分(1-5) | 说明 |
|---|---:|---|
| 收益 | 5 | 宽表效率提升明显 |
| 复杂度 | 3 | 多选状态与动作一致性需设计 |
| 风险 | 3 | 主要在交互一致性与性能 |
| 可逆性 | 4 | 可先上删除，再扩展属性批量改 |

## 验收口径（评估 DoD）
- 明确首批批量动作范围与禁用条件。
- 明确 100+ 行场景的性能门槛与观测方式。
- 明确批量操作与撤销/重做协作规则。
- 输出是否进入开发与推荐阶段划分。

## 下一步决策项
- Go：批量动作边界清晰，风险可控。
- Hold：等待撤销/重做方案先稳定。
- Drop：若交互复杂度超过当前阶段目标。
