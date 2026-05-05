# KLIP-40 工作区实时同步成本与健康度观测

## 目标

0.19.0 的同步链路使用 D1、Durable Objects WebSocket 和 Durable Object storage。上线后需要能回答三个问题：

- D1 rows read / rows written 是否随 workspace changes 和 checkpoint 增长。
- Durable Object 是否因为 update 过密、compact 过频、连接数过高导致成本上升。
- 当前同步参数在单用户、多设备、多人协作房间下是否留有余量。

## 计费口径

Cloudflare D1 当前以 rows read、rows written 和存储计费；Paid 计划包含每月 25B rows read、50M rows written，超出后 rows read 为 $0.001 / million rows，rows written 为 $1.00 / million rows，存储为 $0.75 / GB-month。D1 每个 query 的 `meta` 会返回 `rows_read` 和 `rows_written`，适合直接写入结构化日志。

Durable Objects 当前以 compute request、duration 和 storage 计费；Paid 计划包含每月 1M requests、400,000 GB-s duration，超出后 requests 为 $0.15 / million，duration 为 $12.50 / million GB-s。WebSocket 建连计为 request，入站 WebSocket message 按 20:1 折算到 compute request，出站 message 为 $0。SQLite storage backend 的 rows read / rows written 限额和费率与 D1 一致，SQL stored data 为 $0.20 / GB-month。

参考：

- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/pricing/

## 指标输出

当前实现复用 Worker 结构化日志，事件名固定为：

- `workspace_sync_d1`：记录 workspace changes pull/push 和 Y.Doc checkpoint 路径的 D1 `queries`、`rowsRead`、`rowsWritten`、`durationMs`。
- `workspace_yjs_do_health`：记录 DO `load`、`connect`、`update`、`compact` 的健康指标。

关键字段：

| 事件           | 字段                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| `changes_pull` | `workspaceId`、`since`、`entityCount`、`d1.rowsRead`、`d1.rowsWritten`                                                |
| `changes_push` | `workspaceId`、`changeCount`、`acceptedCount`、`conflictCount`、`d1.rowsRead`、`d1.rowsWritten`                       |
| `checkpoint`   | `workspaceId`、`entityCount`、`upserted`、`deleted`、`skipped`、`d1.rowsRead`、`d1.rowsWritten`                       |
| `load`         | `loadDurationMs`、`storedUpdateCount`、`storedUpdateBytes`、`restoredFromD1`                                          |
| `connect`      | `connectedSockets`、`updateCount`、`updateBytes`、`compactCount`                                                      |
| `update`       | `updateCount`、`updateBytes`、`pendingUpdateBytes`、`connectedSockets`                                                |
| `compact`      | `compactDurationMs`、`compactCount`、`compactedUpdateCount`、`snapshotBytes`、`lastCompactedSeq`、`lastCheckpointSeq` |

## 成本估算

估算按每月 30 天、当前 25ms 客户端 update batching、DO compact 阈值 100 updates / 512 KB、checkpoint 跟随 compact 计算。真实账单以日志和 Cloudflare Analytics 为准。

| 场景           | 假设                                                                          | D1 月用量估算                  | DO 月用量估算                                                          | 判断                              |
| -------------- | ----------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------- | --------------------------------- |
| 单用户日常编辑 | 200 次 batched update / day，20 个 workspace entities，12 次 checkpoint / day | reads 约 0.1M，writes 约 0.01M | 入站 WS messages 约 6K，折算 requests 约 300；duration 低于 100 GB-s   | 远低于 Paid included 用量         |
| 多设备同一用户 | 600 次 batched update / day，30 个 entities，24 次 checkpoint / day           | reads 约 0.4M，writes 约 0.03M | 入站 WS messages 约 18K，折算 requests 约 900；duration 低于 300 GB-s  | 主要观察 checkpoint 频率          |
| 10 人协作房间  | 10K 次 batched update / day，100 个 entities，24 次 checkpoint / day          | reads 约 3M，writes 约 0.2M    | 入站 WS messages 约 300K，折算 requests 约 15K；8h/day 连接约 922 GB-s | duration 和 update bytes 是主指标 |

## 阈值与降级动作

| 触发条件                                                                  | 建议动作                                                               |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `workspace_yjs_do_health.update.pendingUpdateBytes` 持续快速增长          | 扩大客户端 batching 窗口，例如 25ms 提到 50-100ms                      |
| `workspace_yjs_do_health.compact.compactCount` 明显高于活跃小时数         | 提高 compact 阈值，例如 100 updates 提到 200 updates，512 KB 提到 1 MB |
| `workspace_sync_d1.checkpoint.d1.rowsWritten` 接近月 50M included 的 20%  | 降低 checkpoint 频率，优先让 DO snapshot 承担短期恢复                  |
| `workspace_yjs_do_health.load.loadDurationMs` 随 `storedUpdateCount` 上升 | 缩短 compact 间隔，降低冷启动回放成本                                  |
| 10 人房间 `connectedSockets` 和 duration 同时增长                         | 评估 WebSocket Hibernation API，降低长连接 duration 成本               |
