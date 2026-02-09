---
created: "2026-02-09"
status: "draft"
---

# klip-1 - AG Grid 替换 Handsontable

## 背景
当前项目表格能力基于 Handsontable 实现，相关依赖、类型和样式分散在 `DataTable`、`hooks`、`stores` 与测试 mock 中。  
随着项目继续演进，Handsontable 在许可证成本、可访问性治理和后续维护成本上带来额外约束。  
本 klip 目标是在保持现有业务体验基本稳定的前提下，将表格引擎替换为 AG Grid（Community 版本）。

## 目标
1. 用 AG Grid 完整替换 Handsontable，覆盖当前字段编辑表格的核心交互。
2. 保持现有业务能力可用：单元格编辑、下拉选项、行增删、复制粘贴、撤销重做、只读列控制。
3. 对上层业务调用保持稳定，优先复用现有 `DataTable` 对外接口，降低对其他模块影响。
4. 清理 Handsontable 相关依赖、样式和测试 mock，避免双栈并存。

## 非目标
1. 不在本次替换中重构整体页面架构或状态管理方案（如大规模改造 store 结构）。
2. 不引入 AG Grid Enterprise 能力（如高级分组、透视、服务端模型等）。
3. 不在本阶段统一重写全量视觉风格，仅做必要样式对齐。
4. 不扩展超出现有表格能力范围的新业务功能。

## 前置依赖
1. 依赖调整：移除 `handsontable`、`@handsontable/react-wrapper`，引入 `ag-grid-community`、`ag-grid-react`。
2. 组件基线：确认 `src/components/App/DataTable.tsx` 作为主替换入口，先保证对外 props 兼容。
3. 类型基线：将 `Handsontable.CellChange` 等类型替换为项目内部定义的变更模型，减少对具体表格库的强绑定。
4. 样式基线：梳理 `src/index.css` 中 `.handsontable` 相关规则，迁移为 AG Grid 主题与局部覆盖样式。
5. 测试基线：更新 `src/__tests__/mocks/handsontable.ts` 及关联用例，替换为 AG Grid mock 与行为断言。

## 术语表
- Handsontable：当前使用的表格引擎。
- AG Grid：目标替换引擎，本方案默认使用 Community 版本。
- DataTable：当前承载字段编辑能力的核心组件。
- 兼容层：保持 `DataTable` 对外接口不变的过渡实现层。
- 变更模型：表格编辑事件在项目内的统一数据结构（与具体库解耦）。

## 设计概览
1. 替换策略  
采用“组件内替换 + 接口稳定”的最小改动方案：优先在 `DataTable` 内部完成 Handsontable 到 AG Grid 的切换，不改动业务调用方。

2. 实施阶段  
- 阶段一：搭建 AG Grid 版 `DataTable`，完成列定义、编辑器、只读控制与变更回调映射。  
- 阶段二：迁移 hooks/store 中的 Handsontable 类型依赖，统一为内部变更模型。  
- 阶段三：清理 Handsontable 依赖、样式与测试 mock，完成回归验证。

3. 关键设计点  
- 事件映射：将 AG Grid 的 `onCellValueChanged`、`onRowDataUpdated` 等事件映射到现有业务处理流程。  
- 列能力对齐：为现有枚举/布尔/文本列配置对应 AG Grid editor 与 value parser。  
- 行操作对齐：通过事务 API（add/remove/update）实现当前行增删改交互。  
- 可维护性：避免在业务层直接引用 AG Grid 原生类型，后续可继续替换表格实现而不影响业务逻辑。

## 执行待办事项
### 跟踪约定
1. 状态取值统一为：`todo`（未开始）、`doing`（进行中）、`done`（已完成）、`blocked`（受阻）。
2. 每次推进后同步更新“状态”和“最后更新”，并在备注中记录阻塞原因或关键决策。
3. 原则上一次只开启一个 `doing` 的主任务，降低并行改动带来的回归风险。

| ID | 待办项 | 状态 | 预期产出 | 最后更新 | 备注 |
|---|---|---|---|---|---|
| T1 | 安装 AG Grid 依赖并移除 Handsontable 依赖 | todo | `package.json` 与 lock 文件完成依赖切换 | 2026-02-09 | |
| T2 | 在 `DataTable` 内完成 AG Grid 基础渲染与列定义迁移 | todo | AG Grid 版表格可渲染并展示现有字段数据 | 2026-02-09 | |
| T3 | 对齐核心交互：编辑、下拉、行增删、复制粘贴、撤销重做 | todo | 关键交互在本地可用且不阻断主流程 | 2026-02-09 | |
| T4 | 迁移 `hooks/store` 的 Handsontable 类型依赖到内部变更模型 | todo | `useTableData`、`fieldStore` 去除 Handsontable 类型绑定 | 2026-02-09 | |
| T5 | 迁移与清理样式：替换 `.handsontable` 相关规则 | todo | 样式稳定，无明显 UI 退化 | 2026-02-09 | |
| T6 | 更新测试：替换 Handsontable mock，补齐 AG Grid 关键用例 | todo | 单测/E2E 通过，关键场景有覆盖 | 2026-02-09 | |
| T7 | 全量清理引用并回归验收 | todo | 代码中无 Handsontable 运行时引用，验收项通过 | 2026-02-09 | |

## 验收标准
1. 功能验收  
- 字段编辑主流程可用，编辑结果可正确驱动 DDL 生成。  
- 现有表格关键交互可用：编辑、下拉选择、行增删、复制粘贴、撤销重做。  
- 只读字段与校验提示行为不弱化。

2. 工程验收  
- `package.json` 中不再包含 Handsontable 相关依赖。  
- 代码中不再出现 Handsontable 运行时引用（类型注释可按迁移进度短暂保留，但最终需清理）。  
- 相关单测与 E2E 用例通过（至少覆盖关键编辑与导入回填场景）。

3. 质量验收  
- 页面无明显样式破坏与交互阻断。  
- 表格交互性能不低于替换前基线（首屏渲染、编辑响应、批量粘贴）。

## 兼容性与边界
1. 浏览器兼容性沿用 AG Grid 官方社区版支持范围，低版本浏览器不作为本次新增适配目标。
2. 仅保证当前“字段配置表格”场景替换，不承诺同步覆盖项目内未来新增的复杂分析型表格需求。
3. 若 Handsontable 与 AG Grid 在少量交互细节上存在差异，以“业务结果一致、学习成本可接受”为裁剪原则。
4. 本文档为替换方案基线，具体字段级交互差异通过后续实现清单逐项确认。
