---
created: "2026-02-20"
updated: "2026-02-20"
status: "ready"
priority: "P0"
---

# 全局快捷键体系评估（klip-15）

## 背景与现状
- 当前仅有零散快捷键逻辑，例如 `src/components/App/AIGenerateDialog.tsx` 内的 `Enter + meta/ctrl`。
- 尚无统一全局快捷键注册与冲突管理机制。
- 目标是评估高频操作快捷键（保存、AI 生成、导出）落地价值与边界。

## 待解决问题
- 高频操作缺少统一快捷入口，效率依赖鼠标点击。
- 输入框、对话框、表格编辑态下的快捷键冲突策略未定义。

## 拟新增 API / 接口 / 类型草案
- `ShortcutAction`
- `ShortcutBinding`
- `ShortcutRegistry`
- `registerShortcut()` / `unregisterShortcut()`

## 候选方案
### 方案 A：手写 `window.keydown` 管理
- 优点：依赖少。
- 缺点：冲突处理与可维护性较差。

### 方案 B：引入 `react-hotkeys-hook` 统一绑定（推荐）
- 优点：实现简单、可读性好、可按作用域启停。
- 缺点：需评估依赖引入与行为一致性。

### 方案 C：做命令系统/命令面板
- 优点：扩展性强。
- 缺点：超出当前“适度优化”范围。

## 影响面
- 组件：`src/components/App/index.tsx`、`src/components/App/Header.tsx`、`src/components/App/AIGenerateDialog.tsx`
- Store：保存/导出/对话框开关相关 action
- Hooks：可能新增 `useGlobalShortcuts`
- 服务：无
- 测试：快捷键单测与 E2E 冲突场景
- i18n：快捷键提示文案（工具提示）

## 风险与依赖
- 风险：与输入框编辑、浏览器默认行为冲突（如 `Cmd/Ctrl+S`）。
- 回归面：表格输入态、弹窗打开态、跨平台按键差异。
- 依赖：快捷键库（若采用方案 B）。

## 评估矩阵
| 维度 | 评分(1-5) | 说明 |
|---|---:|---|
| 收益 | 5 | 高频操作效率提升明显 |
| 复杂度 | 2 | 关键在冲突策略，不在技术实现 |
| 风险 | 2 | 可通过作用域与禁用条件控制 |
| 可逆性 | 5 | 可逐个快捷键灰度启用 |

## 验收口径（评估 DoD）
- 明确首批快捷键集合：`Cmd/Ctrl+S`、`Cmd/Ctrl+Enter`、`Cmd/Ctrl+E`。
- 给出冲突处理规则（输入控件、弹窗、浏览器默认行为）。
- 明确跨平台行为标准（macOS / Windows）。
- 输出是否立项与推荐实现方式。

## 下一步决策项
- Go：冲突矩阵清晰，收益显著。
- Hold：先补可用性验证或用户反馈。
- Drop：若与核心交互冲突不可接受。
