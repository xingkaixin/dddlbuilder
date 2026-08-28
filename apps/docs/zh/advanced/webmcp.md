# WebMCP Agent 协作

## 使用对象

适合使用支持 WebMCP 的浏览器 Agent，并希望让 Agent 在当前 DDLBuilder 页面中读取结构、导入 SQL、检查规范或提出可审阅变更的使用者。

## 解决问题

WebMCP 把 DDLBuilder 的领域操作声明为结构化工具。Agent 不需要从截图或 DOM 猜测按钮含义，就能可靠地读取当前结构、生成分页输出并提出事务式修改。

## 前置条件

- 使用实现了 `document.modelContext` 的浏览器。WebMCP 仍处于实验阶段，Chrome 可通过 Origin Trial 或本地实验开关启用，具体版本要求以 [Chrome WebMCP 文档](https://developer.chrome.com/docs/ai/webmcp) 为准。
- DDLBuilder 页面必须保持打开；关闭页面后，WebMCP 工具不再可用。
- 写入操作需要用户在页面中确认，Agent 不能绕过确认窗口。

## 可用能力

- `get_auth_status`：读取当前登录状态和可用能力组，不返回邮箱、姓名或点数。
- `start_sign_in`：打开登录窗口。密码、人机验证和邮箱验证必须由用户在页面中完成。
- `inspect_active_schema`：分页读取当前表的概要、字段、索引、关系和表级选项。
- `lint_active_schema`：运行确定性的 Schema 规范检查。
- `read_generated_output`：分段读取 DDL、DCL、ORM、ALTER 或回滚 SQL。
- `preview_schema_patch`：预览表、字段和索引修改，不直接写入工作区。
- `import_sql_preview`：按指定数据库方言解析 SQL，并生成导入预览。
- `apply_schema_patch`：等待用户确认后应用预览；如果文档在确认前已经变化，操作会被拒绝。

## 登录与匿名工作区

1. 未登录时，Agent 仍可编辑当前浏览器中的匿名草稿、导入 SQL、运行检查并读取输出。结果：本地设计流程不会被登录阻断。
2. 当任务需要云同步、账号已保存表或付费 AI 时，Agent 调用 `start_sign_in`。结果：页面打开登录窗口。
3. 用户通过页面或密码管理器填写凭据并完成验证。结果：密码不会进入 Agent 参数或工具输出。
4. 登录成功后，页面刷新 WebMCP 工具和工作区状态。结果：Agent 可以继续原任务，匿名数据可按页面提示迁移到账号工作区。

## 结构变更流程

1. Agent 调用 `inspect_active_schema` 获取当前结构和 `baseSignature`。结果：修改基于一个明确版本。
2. Agent 携带 `baseSignature` 调用 `preview_schema_patch` 或 `import_sql_preview`。结果：页面展示结构差异和 Schema 检查结果。
3. Agent 调用 `apply_schema_patch`。结果：工具等待用户在页面中确认。
4. 用户确认后，系统再次检查当前文档签名。结果：签名一致时写入，不一致时返回冲突并要求重新读取。

## 易错点与失败处理

- 浏览器不支持 WebMCP：页面仍可正常人工使用，但 Agent 看不到 WebMCP 工具。
- 登录窗口已打开但任务没有继续：先由用户完成登录，再让 Agent 重新读取登录状态。
- 返回 `CONFLICT`：当前结构在预览后发生变化，重新读取结构并生成新的预览。
- 分享页面无法修改：只读分享页只允许读取和检查，不允许应用结构变更。
- WebMCP 不是后台接口：无头或云端 Agent 若没有当前浏览器标签页，应使用带授权的后端 MCP，而不是依赖 WebMCP。

索引数据使用 `kind` 表达类型：`index`（普通索引）、`unique_index`（唯一索引）、`unique_constraint`（唯一约束）、`primary`（主键）。工具输出和新写入应使用 `kind`；旧保存数据中的 `unique`、`isPrimary`、`isUniqueConstraint` 会在读取时兼容转换。
