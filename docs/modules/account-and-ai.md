# 账号、额度与 AI 治理

范围：`apps/worker` 的认证、额度、AI 路由和管理后台；`packages/db` 的迁移；`packages/shared-types` 的账号与 AI 契约；`apps/web` 的登录、用户设置和管理端界面。

## 认证与会话

- Better Auth 运行在 Worker 内，数据存 D1，邮件经 Resend 发送。登录方式为邮箱 + 密码，邮箱用六位验证码验证。
- Drizzle ORM 跟随 1.0 RC 通道，认证关联使用 Relational Queries v2 的 `defineRelations`，通过 `relations` 传给 D1 驱动。Better Auth 的关联查询保持启用。
- Better Auth 1.7.28 的 Drizzle 适配器仍使用旧的关联查询过滤格式，仓库通过 pnpm 补丁改用 RQB v2 的 `RAW` 回调，并在回调中使用查询别名构造过滤和排序。上游修复后，验证邮箱验证码、会话和运行时端到端测试再移除补丁。
- 浏览器使用 cookie session，不使用 bearer token。
- 业务数据直接以 Better Auth 的 `user.id` 作为用户主键，不维护外部身份映射。
- 认证接口在交给 Better Auth 之前，先做按 IP 的 D1 限流。Better Auth 自带的限流关闭，不依赖进程内计数。禁用绕过已验证账号检查的 `/email-otp/send-verification-otp` 路径，统一走原生发信接口；Better Auth 实例按 isolate 级稳定的 D1 绑定作 WeakMap 缓存键，禁止捕获请求态 `env`。
- HTTP 路由和 Durable Object 使用同一套会话有效性判断：会话未过期，且用户未被禁用。会话被撤销（退出、管理员禁用、批量删会话路径）时，按用户去重并主动断开该用户的同步连接。
- 业务表时间列统一存储 INTEGER Unix 毫秒，对外 HTTP API 保持 ISO 字符串；种子脚本写入账本时使用 `WHERE NOT EXISTS` 而非 `OR IGNORE`，避免 SQLite 余额校验触发器先于唯一约束触发。

## 额度账本

- `credit_ledger` 是事实源，`credit_accounts.balance` 是投影。账本只有 grant、consume、refund 三类记录。
- 额度变化只通过插入账本记录完成：插入语句计算 `balance_after`，触发器校验余额并更新投影，在同一条语句内原子完成（ADR 0001）。应用层不直接更新余额。
- 每条记录带幂等键，按 `(user_id, idempotency_key)` 唯一。相同键重试时返回已有记录；载荷不同则返回冲突错误。
- 注册赠送额度在用户创建后发放。发放失败时，在查询余额或预留额度时幂等补发。
- 计价为 1 token = 1 credit，不按路由设倍率。

## AI 请求链路

所有场景通过 `aiConversations` 路由进入独立的 AI Conversation Durable Object。pi-durable 内置 Conversation/GenerationTask 负责模型执行、历史、检查点和恢复；不再维护另一套 Effect/SDK 重试循环。Effect 保留在请求鉴权、配置、Schema 和旧用量回收边界，业务账本仍由 D1 负责。

1. 服务端鉴权、按用户与场景限流，签发操作身份，并绑定用户、原始登录会话和 Conversation。
2. 操作提交后固定输入哈希；同一身份只能重放同一输入。Conversation 同时只运行一轮，上一轮停止或超时后先完成结算再接受下一轮；被拒绝的操作直接关闭。模型及 thinking 配置在接受操作时固定。只有建表和改表复用 Conversation；DDL 审查每次新建，审查卡片只属于当前操作。
3. 每次实际模型请求前重新检查身份、期限与停止标记，再签发独立的 Usage Identity，预留用户额度和服务预算。调用记录、预留和派发标记在同一个 D1 batch 内提交；预留被拒绝时整批回滚，不留下调用记录。数据库失败不能启动模型。
4. 供应商结果先写入 DO 用量凭据，再写入 D1。完整业务输出通过 Schema 后才能成功；建表和修改的预览不能自动应用。
5. 结算先写持久化意图，再经现有 D1 batch 和账本触发器退还差额或补扣。DO 凭据可重放；重放不重复扣费。
6. Alarm 恢复同一 Submission。恢复前先结算上一物理调用，再重新鉴权和预留。模型请求在途时 DO 中断算一次失败尝试，超过 `settings.retry` 上限后操作以失败结束。Cron 补偿 D1 已接受、DO 未完成的操作；旧回收器排除这些新调用，避免双重回收。

有完整 usage 按实际 token 收费；未发出的调用和明确的供应商请求拒绝按零结算。显式停止或流中断时，按已观测的输入 token 加已收到的文本与 thinking 字符数结算输出，输出不超过 maxTokens；尚未收到响应就中断时按输入估算结算。进程丢失、没有任何回执时，按预留量与已知用量的较大值保守结算。不完整 usage 均标明估算。恢复的新模型调用单独计费。供应商响应不完整时不承诺精确账单，也不以 HTTP 200 代表业务成功。

浏览器断开只取消观察。显式停止、原登录会话失效、用户禁用或超时会阻止后续调用，并中断进行中的请求。撤销会话主动通知 AI DO；Alarm 和下一次调用检查作为补偿。结果与 Workspace Document 分开保存，重新连接不会自动覆盖用户正在编辑的表。

## 设计原则

1. `credit_ledger` 仍是额度事实源。DO 和 D1 之间没有事务，必须通过持久化凭据、结算意图及幂等约束恢复。
2. 每次可能产生供应商用量的物理调用都独立记录。运行时恢复不等于 token 续传，也不保证供应商调用恰好一次。
3. SDK 自动重试和供应商消息线程续接关闭，避免线程回退绕过持久化重试与回执结算；运行时有持久化调用上限。额度、预算或数据库故障不能被归类为可重试的模型错误。
4. 身份、配置、密钥和计费状态按请求或 DO 实例提供，禁止放入全局可变 Runtime。
5. 客户端不能决定用户身份、计费身份或供应商配置。模型不能直接写 Workspace。
6. AI 上下文与 Workspace Y.Doc 独立存储；删除会话先停止并完成结算，再清理 DO。账本按原保留策略维护。
7. 额度响应校验失败不能回退成余额 0。可观测性不记录提示词、SQL、输出或密钥。
8. pi-durable 1.x 标记为 Experimental，DO 内的 SQLite schema 只向前迁移。升级 pi-durable 后不能直接回滚到旧版本代码，回滚前要排空进行中的操作并清理 AI Conversation DO。存储错误会关闭 Harness，DO 随即重置并在下一个事件重新打开。
9. **运行时与协议细节**：DO 将 `persistWithinMs` 设为 0 以保证 `observeCommits` 实时推送 `/events`，首次并发提交复用同一创建 Promise，结算后立即调度 alarm 检查挂起删除；Cron 恢复限制单批并发上限以控制单次 invocation 子请求数，并保留旧结算状态枚举与 `(status, created_at)` 索引、预算窗口 `MAX` 幂等回填以兼容历史记录。请求入口并行执行限流检查与幂等赠额补发；请求预估按字符数计 token（中文约 1 字符≈1 token）。因 Anthropic 限制结构化输出 union 参数，供应商侧使用扁平 schema，业务侧仍按判别联合校验；多轮建表裁剪历史仅保留最新一条 assistant 基线，提交前剔除空白占位行，字段 `id` 区分保留身份（字符串）与新增字段（`null`），索引建议字段不合法时整条拒绝；流式生成期间禁止应用建议，跳过未闭合 JSON 对象，未知流式错误码前向回退为错误文本展示。

## 管理后台

- 使用独立的管理员密码和 HMAC 签名 cookie。会话记录在 D1 `admin_sessions`，可以在服务端撤销，与普通用户会话完全隔离。管理员登录按 IP 限流。
- 能力：查看用户、发送重置密码邮件、禁用或启用用户、修改邮箱验证状态、手动增加额度、查看流水和用量。
- 禁用用户时，立即删除其会话并断开同步连接。
- 手动增加额度复用账本写入，记为 grant / manual_adjustment，并带幂等键。后台不能直接设置密码或余额。

## 已放弃的方案

- KV 限流和幂等键：已全部迁到 D1。
- 基于 `version` 的乐观锁：已由“账本插入 + 触发器”取代。`version` 只由触发器自增，应用层不做 CAS。
- Turnstile 人机验证：设计过但未实现，注册保留 IP 限流。
