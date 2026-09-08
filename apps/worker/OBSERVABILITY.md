# AI 可观测性

AI 业务阶段使用 Effect span，由 `server-api/lib/aiTracing.ts` 接到 Cloudflare Worker 的原生自定义 span。通过异步上下文快照，Effect fiber 切换后仍保留平台上的父子关系，平台自动采集的 fetch 和数据库调用也能归到当前阶段。

## 阶段

- `ai.request`：一次 AI 操作，流消费、输出校验和结算完成后结束。
- `ai.authenticate`、`ai.rate_limit`：鉴权和限流。
- `ai.reserve`、`ai.budget.reserve`：额度及预算预留。
- `ai.provider.attempt`：一次上游尝试，`ai.attempt` 从 1 开始。
- `ai.stream.consume`：整个流消费过程，不逐 chunk 创建 span。
- `ai.output.validate`：路由输出 Schema 校验。
- `ai.settle`：结算；失败可与成功生成同时发生，应结合 `ai.accounting_finalized` 排查。

`ai.outcome` 区分 `succeeded`、`rejected`、`failed`、`cancelled`。`ai.failure_kind` 标识上游、输出、记账、治理、超时或内部错误。HTTP 200 不代表流成功，应查看操作结果及终止事件。

## 定时用量恢复

Cron 的 `ai.usage.recovery` 覆盖用量回收、预算补结算和过期治理记录清理，完整 Promise 交给 `waitUntil`。子阶段包括 `ai.usage.reclaim.scan`、`ai.usage.reclaim.entry`、`ai.usage.reclaim.settle`、`ai.usage.reclaim.defer`、`ai.budget.reconcile` 和 `ai.governance.cleanup`。

回收按条执行。单条结算失败后写入下次重试时间；延期写入也失败时保留两份错误，继续处理后续条目。存在单条失败时，根 span 标记 `ai.outcome=failed`，后台日志记录失败条目。扫描或后续整批阶段失败则让后台任务失败，留待下次 Cron 恢复。数据库中的结算意图、触发器和幂等约束仍负责持久化一致性。

## 日志关联

通过日志的 `requestId` 和 span 的 `request.id` 关联。Effect 内部生成的 trace ID 不作为 Cloudflare trace ID 输出。Cloudflare 的实际 trace ID 由平台提供。

非流请求沿用请求日志；流请求结束时通过 `ai-operation` 后台日志输出最终审计，包括用量、重试、结算状态及 `ai.observability.firstChunkMs`。首字延迟包含鉴权和额度预留时间。完整后台任务挂到 `waitUntil`。

Trace 属性使用白名单，不包含 SQL、提示词、响应正文、密钥和原始异常信息。追踪 API 失败不影响请求或结算。

## 查询

生产配置在 `wrangler.deploy.toml`：日志采样 100%，Trace 采样 5%。在 Cloudflare Traces 中查找 `ai.request`，按 `request.id`、`ai.route`、`ai.error_code` 和 `ai.accounting_finalized` 筛选。错误率和用量应从完整审计统计，不能把 5% 的 Trace 样本当成总量。

本地 Wrangler 的 Local Explorer 提供只读查询接口：

```sh
curl -s http://127.0.0.1:3000/cdn-cgi/local/explorer/api/local/observability/query \
  -H 'Content-Type: application/json' \
  -d '{"sql":"SELECT name, span_id, parent_id, duration_ms, json(attributes) FROM spans WHERE name LIKE '\''ai.%'\'' LIMIT 50"}'
```

本地运行时测试开启 100% Trace 采样，并检查真实采集到的 AI 根 span、鉴权子 span 和请求标识。运行 `pnpm run test:e2e:runtime` 验证。
