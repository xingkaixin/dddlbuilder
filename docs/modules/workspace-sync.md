# 工作区存储与同步

范围：`packages/workspace-core`；`apps/web` 的工作区存储、`WorkspaceYDocProvider` 和同步客户端；`apps/worker` 的 `WorkspaceYDocDurableObject`、工作区路由和迁移接口。

## 模型

- 每个用户目前只有一个默认工作区，首次访问时在 D1 `workspaces` 中惰性创建。
- 工作区内容是一个 Y.Doc（Workspace Document），包含 drafts、savedTables、savedDrafts、folders 四个集合。字段、索引、外键以稳定 ID 存为 `Y.Map`，顺序单独存储，支持字段级合并。
- 回收站是记录上的 `trashedAt`，随文档同步。永久删除就是把记录从文档中移除。
- 编辑会话（激活标签、当前来源）只存本地，不进入文档。
- 表版本历史和评审历史只存本地 IndexedDB，不同步。表从文档中消失时，清理对应的历史。

## 权威与副本

| 状态 | 权威 | 副本 |
| --- | --- | --- |
| 匿名 | IndexedDB 中的匿名分区 | 无 |
| 登录（客户端运行时） | 浏览器中的 Y.Doc | y-indexeddb 离线副本 |
| 登录（服务端） | Durable Object 存储（快照 + 增量 update） | D1 `workspace_entities` 投影 |

## 同步链路

1. 启动：先从 y-indexeddb 恢复本地副本并解除编辑门禁，再建立同步连接。会话尚未解析时，可以用本地记录的身份加载离线副本。
2. 连接：Worker 路由校验会话和工作区归属（非 owner 返回 403），再按 workspaceId 转发到对应的 Durable Object。
3. 传输：客户端使用 y-protocols sync，外加自定义帧头（sync / syncWithAck / persisted）。本地 update 合并后批量发送；页面隐藏或关闭时立即发送。
4. 服务端处理：DO 只接受二进制帧。先在校验文档上检查受影响的表，再应用；先持久化再确认，然后广播给其他已授权的连接。
5. 写入 D1：DO 只在压缩或定时 alarm 时 checkpoint 到 D1，按内容哈希只写有变化的实体。checkpoint 不在确认路径上。
6. 冷启动：DO 自身存储非空时只用自身数据；为空时从 D1 投影恢复；两者都为空时，写入一份已初始化的空文档。

## 匿名数据迁入账号

- 触发条件：已登录、账户文档已完成远端同步且为空、本机匿名分区有内容。
- 两阶段：analyze 返回冲突供用户确认；commit 后服务端经 DO 合并进文档，再压缩并 checkpoint。
- 冲突按实体 ID 判定：内容相同则跳过，不同则另存为带 “(Imported)” 后缀的副本，不覆盖账户中已有的数据。
- 幂等依据是本机内容指纹（`workspace_links`），同一份内容重复提交不会重复写入。
- 迁移后保留本机匿名分区。

## 登出

先拉取远端更新，并等待本地改动被服务端确认持久化；未确认则取消登出，保留本地数据。确认后删除该账号的本地副本和历史。清理失败时记录待清理状态，下次启动先重试清理，再开放工作区。

## 设计原则

1. 一个工作区对应一个 Y.Doc 和一个 DO 房间。服务端权威在 DO，不在 D1。
2. 高频编辑不写 D1。D1 投影只用于 DO 冷启动恢复，客户端不直接读写。服务端新功能需要读取工作区内容时，先评估能否从 DO 读取，不要让投影变成第二个权威。
3. 已初始化的文档即使为空也是权威，不能被旧数据替换。
4. 写入目标未确定时阻塞写入。登录状态解析期间不渲染编辑器、不写入，避免数据落进匿名分区后无法合回。
5. 不静默覆盖用户数据。迁移冲突另存副本；同步失败、启动读取失败都进入可见的错误态或重试，不用空数据继续。
6. 访问控制在每个入口执行。HTTP 升级时校验；DO 在握手、处理消息和广播时，都以 D1 中的会话和归属为准。会话撤销时，通过 kick 主动断开连接。
7. 文档模型、编解码、校验、同步帧和合并策略只在 `workspace-core` 实现一次，Web 和 Worker 共用。历史数据格式只在 `workspace-core` 的解码器中兼容（ADR 0002）。
8. 远端 update 只对发生变化的表做校验和物化，不全量重建。

## 已放弃的方案

- 手动上传/下载快照（IndexedDB 为主、D1 为备份）：已删除。
- HTTP 增量同步（changes 接口、客户端 outbox、`workspace_mutations` 日志、实体级冲突界面）：已被 Y.Doc + DO 取代。

没有新的理由，不要恢复这些路径。

## 观测

成本与健康日志事件为 `workspace_yjs_do_health`、`workspace_sync_d1`、`workspace_legacy_backfill`（`apps/worker/server-api/lib/workspaceSyncMetrics.ts` 等）和客户端的 `workspace_yjs_client_batch`（`apps/web/src/services/workspaceYDocSyncClient.ts`）。
