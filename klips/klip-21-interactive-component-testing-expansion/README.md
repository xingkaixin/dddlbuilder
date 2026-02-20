---
created: "2026-02-20"
updated: "2026-02-20"
status: "ready"
priority: "P1"
---

# 强交互组件测试补齐评估（klip-21）

## 背景与现状
- 已有单测与 E2E 基础：`src/__tests__/components/App/table/*`、`e2e/*`。
- 现有覆盖点对核心逻辑有效，但 DataTable 强交互状态（焦点、编辑、粘贴、冻结列联动）仍可继续增强。
- 目标是评估“组件级回归保护网”的补齐范围与优先级。

## 待解决问题
- 复杂交互场景仍较依赖 E2E，定位成本与稳定性成本偏高。
- 需要在 Vitest + RTL 层增加可重复、快速反馈的交互状态测试。

## 拟新增 API / 接口 / 类型草案
- `DataTableInteractionTestCase`
- `createInteractionHarness()`
- `assertCellFocusState()`
- `assertFreezeColumnStyle()`

## 候选方案
### 方案 A：继续以 E2E 为主
- 优点：贴近真实流程。
- 缺点：反馈慢、定位粗。

### 方案 B：补齐组件级交互测试矩阵（推荐）
- 优点：快速回归、定位清晰，与 E2E 互补。
- 缺点：需要维护测试基建与稳定选择器。

### 方案 C：仅补 store 层单测
- 优点：成本较低。
- 缺点：难覆盖 UI 交互细节回归。

## 影响面
- 组件：`src/components/App/DataTable.tsx`、`src/components/App/table/*`
- Store：`src/stores/*`（作为测试驱动数据源）
- Hooks：`useDataTableNavigation`、`useDataTableClipboard`、`useFreezeColumns`
- 服务：无
- 测试：新增组件交互用例文件
- i18n：一般无新增

## 风险与依赖
- 风险：测试实现细节耦合过深导致脆弱。
- 回归面：键盘导航、编辑提交、粘贴映射、冻结列视觉状态。
- 依赖：测试工具链稳定性（Vitest + RTL）。

## 评估矩阵
| 维度 | 评分(1-5) | 说明 |
|---|---:|---|
| 收益 | 4 | 可显著降低强交互回归漏检 |
| 复杂度 | 2 | 可分主题逐步补齐 |
| 风险 | 2 | 主要是测试维护成本 |
| 可逆性 | 5 | 测试增量改动，业务风险低 |

## 验收口径（评估 DoD）
- 明确首批补测场景（焦点、编辑、粘贴、冻结列）。
- 明确组件测试与 E2E 的职责边界。
- 给出用例优先级与最小覆盖清单。
- 输出是否立项与预计批次。

## 下一步决策项
- Go：覆盖缺口明确且投入可控。
- Hold：先修复现有不稳定测试再扩充。
- Drop：若当前阶段测试投入优先级不足。
