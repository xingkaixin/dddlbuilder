# Task Plan: App/index.tsx 组件拆分

## Goal
将近 1000 行的 App 上帝组件拆分为可维护的模块组合，保持行为不变。

## Phases
- [ ] Phase 1: Hooks 编排层抽取
- [ ] Phase 2: JSX 渲染区域拆分
- [ ] Phase 3: 业务回调外移
- [ ] Phase 4: 回归验证与文档更新

## TODO Checklist

### Phase 1: Hooks 编排层抽取
- [ ] 盘点 App 组件中所有 hook 调用，列出依赖关系图
- [ ] 设计 `useAppState()` 或分组 hooks 的接口签名
- [ ] 创建 `hooks/useAppState.ts`（或分组文件）
- [ ] 将 App 中的 hook 调用迁移到新 hook 中
- [ ] 更新 App 组件使用新的聚合 hook
- [ ] 执行 `bun run lint`
- [ ] 执行 `bun run test:run`

### Phase 2: JSX 渲染区域拆分
- [ ] 分析 App JSX 的区域划分（工具栏、主体、底部）
- [ ] 评估已有 `containers/GlobalDialogs.tsx` 的覆盖范围
- [ ] 创建 `AppMainContent.tsx` 容器组件
- [ ] 将主体渲染逻辑迁移到新容器
- [ ] 执行 `bun run lint`
- [ ] 执行 `bun run test:run`

### Phase 3: 业务回调外移
- [ ] 盘点 App 内定义的所有业务回调函数
- [ ] 将 `onNameChange` 迁移到对应 hook/action
- [ ] 将 `onCopy` 迁移到对应 hook/action
- [ ] 将 `onRollback` 迁移到对应 hook/action
- [ ] 清理 App 中残留的冗余代码
- [ ] 执行 `bun run lint`
- [ ] 执行 `bun run test:run`

### Phase 4: 回归验证
- [ ] 执行 `bun run test:e2e`
- [ ] 手动验证主界面渲染
- [ ] 手动验证 Tab 切换功能
- [ ] 手动验证所有对话框交互
- [ ] 更新 klip 文档状态为 completed
- [ ] 记录最终行数对比

## Decisions Made
- 暂无（待启动）

## Errors Encountered
- 暂无

## Status
**Proposed** — 等待排期执行。
