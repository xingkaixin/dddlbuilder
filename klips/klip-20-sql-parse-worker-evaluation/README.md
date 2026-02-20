---
created: "2026-02-20"
updated: "2026-02-20"
status: "ready"
priority: "P2"
---

# SQL 解析 Worker 化必要性评估（klip-20）

## 背景与现状
- 当前解析主链路为前端请求 `/api/parse-sql`：`src/services/sqlParseService.ts` -> `api/routes/parseSql.ts`。
- 服务端路由内部使用 `SqlParser.parseAsync()` 完成解析，浏览器主线程并不直接执行重型解析。
- 已支持长度限制与错误治理，需先验证真实瓶颈位置。

## 待解决问题
- 对超长 SQL（几千行）场景，需确认瓶颈在前端渲染、网络传输还是服务端解析。
- 在当前架构下，是否有必要引入 WebWorker，或应优先优化现有 API 流程。

## 拟新增 API / 接口 / 类型草案
- `SqlParseWorkerRequest`
- `SqlParseWorkerResponse`
- `parseInWorker()`
- `parseViaApi()`

## 候选方案
### 方案 A：保持 API 解析，先做性能观测与后端优化（推荐）
- 优点：符合当前架构事实，改动最小。
- 缺点：离线本地解析能力仍为空白。

### 方案 B：新增前端 Worker 解析通道
- 优点：可在纯前端场景减少主线程阻塞。
- 缺点：需要双实现一致性维护，成本上升。

### 方案 C：API + Worker 混合降级
- 优点：兼顾在线与离线。
- 缺点：复杂度最高，需严格一致性测试。

## 影响面
- 组件：`ImportSqlDialog` 导入体验
- Store：无直接影响
- Hooks：可能新增解析策略选择 hook
- 服务：`api/routes/parseSql.ts`、`src/services/sqlParseService.ts`
- 测试：大 SQL 性能基准与一致性测试
- i18n：无直接新增

## 风险与依赖
- 风险：双路径解析结果不一致。
- 回归面：解析错误提示、导入预览一致性、大文本处理稳定性。
- 依赖：构建链路对 Worker 打包支持与监测基线工具。

## 评估矩阵
| 维度 | 评分(1-5) | 说明 |
|---|---:|---|
| 收益 | 3 | 需先证明真实瓶颈才有收益 |
| 复杂度 | 4 | 双路径维护与一致性成本高 |
| 风险 | 3 | 架构复杂化风险中等 |
| 可逆性 | 3 | 新增 worker 后回退成本中等 |

## 验收口径（评估 DoD）
- 完成基线数据采样：大 SQL 导入耗时拆分（网络/解析/渲染）。
- 明确瓶颈归因并给出建议优先级。
- 如建议 Worker，给出一致性保障与降级策略草案。
- 形成 Go/Hold/Drop 结论。

## 下一步决策项
- Go：确认主瓶颈在前端解析且 Worker 收益明显。
- Hold：当前证据不足，先补观测。
- Drop：确认 API 解析足够且优化空间在其他环节。
