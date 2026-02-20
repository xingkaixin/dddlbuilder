---
created: "2026-02-20"
updated: "2026-02-20"
status: "ready"
priority: "P1"
---

# Index/Partition 展示层再拆分评估（klip-13）

## 背景与现状
- `src/components/App/IndexPanel.tsx` 与 `src/components/App/PartitionPanel.tsx` 已有清晰业务功能，但渲染与行为逻辑仍较集中。
- `DataTable` 已完成拆分经验可复用（`src/components/App/table/*`）。
- 当前目标是继续降低主面板圈复杂度，保持最小改动。

## 待解决问题
- Index/Partition 主组件承担较多 UI 细节，后续扩展时评审成本偏高。
- 部分纯展示逻辑可抽成 Dumb Components，但尚未形成明确拆分边界。

## 拟新增 API / 接口 / 类型草案
- `FieldCheckboxGroupProps`
- `PartitionTypeSelectProps`
- `PartitionDefinitionListProps`
- `IndexActionButtonsProps`

## 候选方案
### 方案 A：维持现状
- 优点：零迁移。
- 缺点：后续功能累积会继续抬高复杂度。

### 方案 B：按“容器 + 无状态展示组件”二次拆分（推荐）
- 优点：主组件仅保留状态编排，渲染片段可复用且更易测试。
- 缺点：需控制组件颗粒度，避免碎片化。

### 方案 C：引入通用表单引擎
- 优点：配置化程度高。
- 缺点：过度设计，不符合当前最小改动目标。

## 影响面
- 组件：`src/components/App/IndexPanel.tsx`、`src/components/App/PartitionPanel.tsx`
- Store：`src/stores/indexStore.ts`、`src/stores/partitionStore.ts`
- Hooks：可能新增局部展示 hooks
- 服务：无
- 测试：Index/Partition 组件测试需补强
- i18n：复用现有 key，原则上不新增文案

## 风险与依赖
- 风险：拆分后 props 过长导致“换一种形式的复杂”。
- 回归面：索引建议下拉、分区类型切换、分区定义增删改。
- 依赖：现有 UI 组件库与样式体系。

## 评估矩阵
| 维度 | 评分(1-5) | 说明 |
|---|---:|---|
| 收益 | 4 | 可读性、可测性、复用性均有提升 |
| 复杂度 | 2 | 可按视图片段渐进抽取 |
| 风险 | 2 | 主要是渲染行为保持一致 |
| 可逆性 | 5 | 纯拆分，回滚成本低 |

## 验收口径（评估 DoD）
- 给出最小拆分单元列表（建议 3-5 个展示组件）。
- 明确每个组件“只收 props，不碰 store”的边界。
- 输出回归点清单（键盘、点击、输入、提示）。
- 形成是否进入开发的结论。

## 下一步决策项
- Go：拆分边界明确且不引入跨模块改造。
- Hold：发现拆分收益有限，继续维持当前结构。
- Drop：若评估结果显示重构成本高于收益。
