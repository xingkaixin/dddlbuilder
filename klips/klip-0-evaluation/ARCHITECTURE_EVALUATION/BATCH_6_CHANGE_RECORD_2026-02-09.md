# Batch 6 整改记录（2026-02-09）

## 1. 基本信息

- 批次: `Batch 6`
- 日期: `2026-02-09`
- 执行人: `Codex`
- 对应计划: `EXECUTION_PLAN.md`

## 2. 变更范围

### 2.1 目标

- 完成混合 hook 职责拆分：将请求/流解析与 UI 状态编排解耦。
- 收敛重复流式读取逻辑，统一到共享 service。
- 增补模块边界文档，明确后续改造依赖方向。

### 2.2 改动文件

- `src/hooks/useDDLReview.ts`
- `src/hooks/useDDLExplain.ts`
- `src/hooks/useAIGenerateTable.ts`
- `src/services/reviewService.ts`
- `src/services/streamingText.ts`
- `src/services/aiGenerateTableService.ts`
- `src/types/aiGenerate.ts`
- `src/utils/parsePartialTableSchema.ts`
- `src/__tests__/services/reviewService.test.ts`
- `src/__tests__/services/streamingText.test.ts`
- `src/__tests__/services/aiGenerateTableService.test.ts`
- `src/__tests__/utils/parsePartialTableSchema.test.ts`
- `klips/klip-0-evaluation/MODULE_BOUNDARY.md`
- `klips/klip-0-evaluation/EXECUTION_PLAN.md`
- `klips/klip-0-evaluation/task_plan.md`
- `klips/klip-0-evaluation/BATCH_6_CHANGE_RECORD_2026-02-09.md`

### 2.3 非目标范围

- 本轮不调整页面交互和 UI 结构。
- 本轮不做性能压测与复杂度自动化统计平台接入。
- 本轮不补 `bun run build` 校验。

## 3. 风险评估

| 风险项 | 影响 | 应对措施 |
| --- | --- | --- |
| 流逻辑抽取后节流行为变化 | 渐进渲染体验波动 | 保留“首包立即 + 间隔更新 + 结束补发”策略，新增 `streamingText` 测试 |
| `useAIGenerateTable` 拆分后行为偏差 | 生成结果或会话上下文异常 | 保持 hook 对外 API 不变，新增 service/parser 测试覆盖关键路径 |
| 类型迁移造成引用断裂 | 编译/运行失败 | 在 hook 中保留类型 re-export，避免影响现有导入点 |

## 4. 验证结果

### 4.1 自动化

- [x] `bun run lint` 通过
- [x] `bun run test:run` 通过（51 files / 573 tests）
- [ ] `bun run build` 通过（本轮未执行）

### 4.2 本轮完成项

- [x] `useDDLReview` 请求与流解析下沉至 `reviewService`。
- [x] `useDDLExplain` / `useAIGenerateTable` 接入共享流工具 `streamingText`。
- [x] `useAIGenerateTable` 中 partial 解析拆分至 `parsePartialTableSchema`。
- [x] `useAIGenerateTable` 接口请求拆分至 `aiGenerateTableService`。
- [x] `useAIGenerateTable` 会话拼装逻辑抽离为独立 helper。
- [x] 新增模块边界文档 `MODULE_BOUNDARY.md`。
- [x] 新增服务层/解析层测试 4 个文件。

### 4.3 待后续项

- [ ] 补充 `bun run build` 验证。
- [ ] 核心链路人工冒烟（保存、加载、DDL 生成、关键对话框）。

## 5. 指标快照

- 基线文件: `klips/klip-0-evaluation/baselines/baseline-2026-02-09.md`
- 关键变化:
  - `useDDLReview.ts` 行数: `229 -> 179`
  - `useDDLExplain.ts` 行数: `148 -> 116`
  - `useAIGenerateTable.ts` 行数: `450 -> 185`
  - 新增分层模块:
    - `src/services/aiGenerateTableService.ts`
    - `src/types/aiGenerate.ts`
    - `src/utils/parsePartialTableSchema.ts`
  - 测试规模: `49 files / 568 tests -> 51 files / 573 tests`

## 6. 回滚步骤

1. 回退 `src/hooks/useAIGenerateTable.ts` 到批次6前版本（恢复 parser/request 内联实现）。
2. 回退 `src/hooks/useDDLReview.ts` / `src/hooks/useDDLExplain.ts` 的 service 接入改动。
3. 删除新增 service/utils/types 与对应测试文件。
4. 执行 `bun run lint && bun run test:run` 验证回滚结果。

## 7. 结论与下一步

- 本批次结论: `Batch 6 完成（代码/文档范围）`
- 下一步建议:
  1. 进入下一批次前补一次 `build + 人工冒烟`，形成完整 DoD 闭环。
  2. 若继续结构优化，优先针对容器边界与高复杂组件做增量拆分。
