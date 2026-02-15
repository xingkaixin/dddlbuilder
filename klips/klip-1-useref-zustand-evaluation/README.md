---
created: "2026-02-15"
updated: "2026-02-15"
status: "ready"
---

# DDLBuilder useRef 替换 Zustand 可行性评估（klip-1）

**评估日期**: 2026-02-15  
**评估范围**: `/src` 下所有 `useRef` 使用点（共 34 处）  
**评估目标**: 判断“将 `useRef` 替换为 `zustand`”是否合理，并给出最小改动方案

---

## 执行摘要

- 项目当前已广泛使用 `zustand`（`/src/stores` 已覆盖核心业务状态）。
- `useRef` 现有 34 处中，**28 处明确不应替换**（DOM 引用、定时器、并发控制、交互瞬时态）。
- 剩余 6 处中，5 处是“初始化哨兵位”可讨论重构，但**不建议为了替换而替换到 zustand**；1 处（`initialDataRef`）建议保留。
- 结论: **不建议发起“全面 useRef -> zustand”改造**。建议仅在“跨组件共享且需要触发渲染”的状态上继续使用 zustand，其它保持 useRef。

---

## 1. 现状盘点

### 1.1 useRef 统计

- 使用文件数: 22
- 使用点总数: 34
- 典型集中区域:
  - 组件交互层（焦点、拖拽、编辑态）
  - 异步请求控制（`AbortController`、活动请求）
  - 动画/定时器句柄
  - 持久化初始化防重入

### 1.2 分类结果

| 类别 | 数量 | 代表位置 | 是否建议迁移到 zustand |
| --- | ---: | --- | --- |
| DOM/焦点/容器引用 | 12 | `src/components/App/containers/GlobalDialogs.tsx:96` | 否 |
| 定时器/动画句柄 | 5 | `src/hooks/useToast.ts:11` | 否 |
| 交互瞬时态（拖拽/键盘来源） | 6 | `src/components/App/SavedTablesSidebar.tsx:53` | 否 |
| 请求生命周期与并发控制 | 5 | `src/hooks/useDDLReview.ts:82` | 否 |
| 初始化哨兵位 | 6 | `src/hooks/useAuthManagement.ts:25` | 条件性（见第 3 节） |

---

## 2. 为什么不应“全面替换”

### 2.1 useRef 与 zustand 的职责不同

- `useRef`: 保存“不参与渲染”的可变引用（DOM、timer、controller、一次性标记）。
- `zustand`: 管理“应驱动 UI 重渲染”的共享业务状态。

将前者硬迁移到后者，会引入以下问题:

- 不必要的全局化，增加耦合和维护成本。
- 触发额外渲染与订阅更新，影响性能边界。
- 生命周期语义被破坏（例如 `AbortController`、DOM 节点引用不适合进全局 store）。

### 2.2 明确不建议迁移的关键点

- DOM 引用: `saveInputRef`、`tableRef`、`canvasRef`、`inputRef` 等。
- 定时器句柄: `sqlTimerRef`、`hideTimerRef`、`timeoutsRef`。
- 并发控制: `activeRequestRef`、`abortControllerRef`。
- 交互瞬时态: `resizingRef/startXRef/startWidthRef`、`triggerSourceRef`。

---

## 3. 可讨论的“最小改动”范围（非必须）

以下不是“必须改”，而是如果团队想进一步统一状态语义，可小步推进:

1. 统一持久化初始化标记（可选）
- 目标点:  
  `src/hooks/useAuthManagement.ts:25`  
  `src/hooks/useCitusSharding.ts:35`  
  `src/hooks/useMysqlPartition.ts:56`  
  `src/hooks/useTableOptions.ts:33`
- 建议: 在对应 store 内增加 `hydratedFromPersisted` 标记，减少重复 `initializedRef` 逻辑。
- 预期收益: 逻辑集中、可测试性更好。

2. `usePersistedState` 的 `hydratedRef`（可选）
- 目标点: `src/hooks/usePersistedState.ts:16`
- 建议: 优先用现有 `hydrated` 状态/依赖关系重写防抖保存门控；无需引入 zustand。

3. `useDialogState` 的 `initialDataRef`（建议保留）
- 目标点: `src/hooks/useDialogState.ts:30`
- 原因: 它是局部 hook 的“初值快照”，不属于共享业务状态，全局化收益低。

---

## 4. 建议决策

### 推荐方案（建议采用）

- 不做“useRef 全量替换”。
- 保持现状策略:
  - 渲染型共享业务状态 -> `zustand`
  - 非渲染型引用与生命周期句柄 -> `useRef`
- 如要优化，仅做第 3 节中的可选小改动。

### 不推荐方案

- 发起“一刀切 useRef -> zustand”重构。
- 该方案风险高、收益低，并可能带来行为回归。

---

## 5. 实施建议（若执行可选优化）

1. 先改一个域（例如 `auth`）验证模式，再推广到 `tableOptions/partition/sharding`。  
2. 每步均保持最小修改并执行:
- `bun run lint`
- `bun run test:run`
3. 若涉及 UI 交互行为变更，再补:
- `bun run test:e2e`

本轮落地结果（2026-02-15）:
- 已完成 4 个域的 `initializedRef -> store hydration 标记` 改造
- `bun run lint` 通过
- `bun run test:run` 通过（`62 files / 614 tests`）
- `bun run test:e2e` 未执行（本轮未涉及 UI 交互行为调整）

---

## 6. 结论

你提到的 `UserRef` 在项目中未检索到，当前实际使用的是 React `useRef`。  
基于现状评估，**“将 useRef 替换为 zustand”不应作为通用目标**；建议继续按职责边界使用两者，并仅对少量初始化哨兵位做可选优化。

## 7. 持续跟进

- 持续任务清单: `klips/klip-1-useref-zustand-evaluation/task_plan.md`
