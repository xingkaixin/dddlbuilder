---
created: "2026-02-15"
updated: "2026-02-15"
status: "ready"
---

# useRef 与 Zustand 代码审查清单

## 适用范围
- 所有新增或修改 `useRef`、`zustand store`、持久化 hydration 逻辑的 PR。

## A. 状态归属判定（必须）
- [ ] 该状态是否“驱动 UI 渲染”？
- [ ] 若是跨组件共享且驱动渲染，是否优先放入 `zustand`？
- [ ] 若仅为 DOM 引用、定时器句柄、请求控制器、瞬时交互标记，是否保持 `useRef`？
- [ ] 是否避免“为了统一而全局化”的无收益迁移？

## B. useRef 场景检查（必须）
- [ ] DOM 引用是否仅在组件生命周期内使用（不进入 store）？
- [ ] `AbortController` / 请求句柄是否具备正确清理（`abort`）？
- [ ] 定时器引用是否在卸载时清理（`clearTimeout/clearInterval`）？
- [ ] 拖拽/键盘/焦点等瞬时态是否未被错误持久化？

## C. store 设计检查（必须）
- [ ] store 字段命名是否语义清晰（如 `hydratedFromPersisted`）？
- [ ] 是否提供必要的 `reset*`，并在 reset 时清理辅助标记？
- [ ] setter 是否支持函数式更新（需要时）？
- [ ] 是否避免把不可序列化对象（DOM、Controller、Timeout ID 映射等）放入全局 store？

## D. hydration 与持久化检查（必须）
- [ ] hydration 是否“仅一次生效”且可复位（通过 reset）？
- [ ] 分享参数/本地存储回退顺序是否正确？
- [ ] 保存门控是否明确（例如 `hydrated` 后才允许保存）？
- [ ] URL 清理逻辑是否保持（读取 `s` 参数后 remove）？

## E. 回归与测试检查（必须）
- [ ] `bun run lint` 通过
- [ ] `bun run test:run` 通过
- [ ] 如涉及 UI 交互行为，`bun run test:e2e` 已执行
- [ ] 新增/修改逻辑有对应测试（至少覆盖 happy path + reset path）
- [ ] 行为语义测试已锁定（例如 `useDialogState` 初始快照语义）

## F. 风险与回滚（建议）
- [ ] PR 描述包含风险点与影响面
- [ ] PR 描述包含可执行回滚步骤
- [ ] 是否保持最小改动（未触及无关模块）

## 审查结论模板

```markdown
### useRef/zustand 审查结论
- 结论: 通过 / 需修改
- 关键问题:
  1. ...
  2. ...
- 风险等级: 低 / 中 / 高
- 回滚建议: ...
```
