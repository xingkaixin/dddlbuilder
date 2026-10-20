# AI 可观测性

AI 业务阶段使用 Effect span，由 `server-api/lib/aiTracing.ts` 接到 Cloudflare Worker 的原生自定义 span。通过异步上下文快照，Effect fiber 切换后仍保留平台上的父子关系，平台自动采集的 fetch 和数据库调用也能归到当前阶段。

## 请求与 Conversation

Trace 中的 `ai.request` span 覆盖操作准备入口，`ai.authenticate` 标记鉴权。模型执行不属于这次 HTTP 响应的生命周期：DO 的模型调用、观察流和结算通过 `waitUntil` 继续运行，Alarm 可在另一 invocation 恢复。

后台 `ai-conversation` 日志按 `ai.operationId`、`ai.conversationId` 关联，包含场景、模型、thinking 开关、业务结果与结算状态。每个结算完成的操作只写一条这样的日志，并附带 `audit`：action 为 `ai.request`，actor 为用户，outcome 为 `success`、`denied`（额度不足）或 `failure`，`reason` 为错误码，`correlationId` 为 operationId。开启 Telegram 通知时，成功和失败的操作在结算后各发一条用量消息，用户停止的操作不发。`ai-conversation-recovery` 的 `recovery_pending` 表示本轮执行或记账尚未完成，需结合持久化记录排查。日志不输出原始异常中的提示词或供应商响应。

`ai_operations` 记录原始身份、输入哈希、期限、停止与完成时间；`ai_call_attempts` 关联独立的 `usage_events`。`dispatched_at` 表示调用可能已发送，`usage_complete` 区分完整用量和估算。一次 Operation 可以对应多次供应商调用，每次有自己的预留和结算。HTTP 200、观察流结束与账本结算完成是不同状态。

## 定时用量恢复

Cron 的 `ai.usage.recovery` 覆盖用量回收、预算补结算和过期治理记录清理，完整 Promise 交给 `waitUntil`。子阶段包括 `ai.usage.reclaim`、`ai.budget.reconcile` 和 `ai.governance.cleanup`；`ai.usage.reclaim` 下又分为 `ai.usage.reclaim.scan`、`ai.usage.reclaim.entry`、`ai.usage.reclaim.settle` 和 `ai.usage.reclaim.defer`。

扫描、状态查询和延期写入通过 `@effect/sql-d1` 执行，SQL span 为 `sqlite`，数据库失败标记 `ai.failure_kind=accounting`。SQL client Layer 按任务创建；驱动产生的 SQL 文本属性仍受追踪白名单过滤。余额结算继续使用原生 D1 原子批处理。

回收按条执行。单条结算失败后写入下次重试时间；延期写入也失败时保留两份错误，继续处理后续条目。存在单条失败时，根 span 标记 `ai.outcome=failed`，后台日志记录失败条目。扫描或后续整批阶段失败则让后台任务失败，留待下次 Cron 恢复。数据库中的结算意图、触发器和幂等约束仍负责持久化一致性。

## 日志关联

HTTP 日志和原生 span 通过 `requestId` / `request.id` 关联；跨 invocation 的 AI 执行通过 operationId 关联。Effect 内部 trace ID 不作为 Cloudflare trace ID 输出。

Trace 属性使用白名单，不包含 SQL、提示词、响应正文、密钥和原始异常信息。追踪 API 失败不影响请求或结算。生产采样沿用 Cloudflare 配置。

## 查询

生产采样配置在 `cloudflare.config.ts`：日志采样 100%，Trace 采样 5%。在 Cloudflare Traces 中查找 `ai.request`，按 `request.id`、`ai.outcome` 和 `ai.error_code` 筛选；操作结算状态查询 Conversation 日志与 D1。错误率和用量应从完整审计统计，不能把 5% 的 Trace 样本当成总量。

`cf dev` 启动的本地运行时 Local Explorer 提供只读查询接口：

```sh
curl -s http://127.0.0.1:3000/cdn-cgi/local/explorer/api/local/observability/query \
  -H 'Content-Type: application/json' \
  -d '{"sql":"SELECT name, span_id, parent_id, duration_ms, json(attributes) FROM spans WHERE name LIKE '\''ai.%'\'' LIMIT 50"}'
```

本地运行时测试开启 100% Trace 采样，并检查真实采集到的 AI 根 span、鉴权子 span、请求标识，以及定时恢复的 SQL 扫描和预算清理阶段。运行 `pnpm run test:e2e:runtime` 验证。
