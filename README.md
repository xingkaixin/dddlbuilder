# DDLBuilder —— 多数据库建表语句生成器

一个基于 React + TypeScript + Vite 的轻量工具：通过表单与表格输入，实时生成不同数据库的建表 DDL，并支持一键复制。

## 功能特性

- 支持数据库：MySQL、PostgreSQL、PostgreSQL Citus、SQL Server、Oracle、MariaDB、TiDB、达梦 (Dameng)、OceanBase (MySQL/Oracle 模式)
- **MySQL 分区配置**：支持 MySQL、MariaDB、TiDB 的分区表配置
  - 分区类型：RANGE、RANGE COLUMNS、LIST、LIST COLUMNS、HASH、KEY
  - 支持分区表达式（如 `YEAR(col)`、`dayofmonth(col)`）
  - RANGE 分区快捷生成：按年/月/日一键生成分区定义
- **PostgreSQL Citus 分片配置**：支持副本表 (Reference Table) 和分片表 (Distributed Table) 模式，自动生成对应 DDL
- 实时生成建表语句；支持表注释与列注释
- 索引与权限配置支持，可折叠面板管理
- 主键支持与唯一约束索引配置
- 字段校检：重复字段名或使用数据库保留关键字高亮告警
- 类型智能映射与别名识别（如 varchar/varchar2、json/jsonb、serial/identity 等）
- 便捷表格编辑：序号自动维护、批量添加行、复制粘贴「是否为空」列（支持 YNyn 输入）
- 字段默认值与更新策略（如 UUID、当前时间戳）
- 支持 SQL 导入：解析 CREATE TABLE、CREATE INDEX、ALTER TABLE、GRANT 语句，自动回填表结构、索引及权限配置
- 一键清空与便捷操作按钮
- 一键复制 SQL，白底代码主题，便于文档或评审拷贝
- 帮助文档入口，按语言跳转对应文档并查看更新说明

## 开发与构建

依赖 Node.js 与 pnpm：

```bash
# 安装依赖
pnpm install

# 本地开发（应用，支持热更新）
pnpm run dev

# 仅启动前端开发服务
pnpm run dev:app

# Worker 运行时调试
pnpm run dev:worker

# 产物构建
pnpm run build

# 部署（自动读取 .deploy.secrets）
pnpm run deploy
```

开发命令说明：

- `pnpm run dev`：启动前端开发服务、Worker 运行时与文档开发服务，入口为 `http://localhost:3000`，修改页面代码会通过 Vite 自动热更新。
- `pnpm run dev:app`：仅启动前端开发服务（Vite）。
- `pnpm run dev:worker`：先构建一次 Worker 产物，再用 `wrangler dev` 在 `http://localhost:8787` 启动运行时调试服务。
- `pnpm run db:migrate:local`：初始化或升级本地 D1 用户系统 schema。
- `pnpm run db:seed:local`：写入本地 D1 最小种子数据。
- `pnpm run db:reset:local`：清空并重建本地 D1 schema，再重新 seed。
- `pnpm run db:inspect:local`：查看本地 D1 当前表与索引。
- `pnpm run db:migrate:remote` / `pnpm run db:inspect:remote`：显式连接 remote D1 执行迁移或检查。
- `pnpm run dev:docs`：仅启动文档开发服务（`http://127.0.0.1:5174/docs/`）。
- `pnpm run dev` 运行时，`/docs` 会自动代理到 docs dev server；如果只运行 `pnpm run dev:app`，需要再单独运行 `pnpm run dev:docs` 才能通过 `http://localhost:3000/docs/` 查看文档。
- `pnpm run dev` 或 `pnpm run dev:app` 运行时，前端的 `/api/*` 请求会代理到 `http://127.0.0.1:8787`。如果没有启动 `pnpm run dev:worker`，D1 / KV / Better Auth / Turnstile 都不会生效。

### 部署 secrets

`wrangler.deploy.toml` 适合放 Worker 名称、KV / D1 绑定、静态资源等非敏感配置，不适合把 secret 明文直接写进去。

项目现在的部署方式是：

1. 复制 `.deploy.secrets.example` 为 `.deploy.secrets`
2. 在 `.deploy.secrets` 中填写生产 secrets
3. 执行 `pnpm run deploy`

`pnpm run deploy` 会在构建后自动调用 `wrangler deploy --config wrangler.deploy.toml`，如果检测到 `.deploy.secrets`，会额外带上 `--secrets-file .deploy.secrets`，不需要再一个个手动 `wrangler secret put`。

`.deploy.secrets` 使用标准 `.env` 格式，例如：

```bash
OPENAI_API_KEY=xxx
BETTER_AUTH_SECRET=xxx
TURNSTILE_SECRET_KEY=xxx
```

这个文件已加入 `.gitignore`，不会被提交。

如果你想把 secrets 文件放在别处，部署时可通过环境变量覆盖：

```bash
WRANGLER_SECRETS_FILE=/absolute/path/to/prod.secrets pnpm run deploy
```

### 环境变量

可通过 `.env` 配置后端行为（示例见 `.env.sample`）：

- `OPENAI_BASE_URL`：OpenAI 兼容接口地址
- `OPENAI_API_KEY`：模型服务密钥
- `OPENAI_MODEL_NAME`：默认模型名
- `CORS_ALLOWED_ORIGINS`：允许跨域来源，多个来源用逗号分隔
- `BETTER_AUTH_SECRET`：Better Auth 签名密钥
- `BETTER_AUTH_URL`：Better Auth 对外基址，必须填写用户浏览器实际访问的公开站点。Vite + Worker 本地联调时应使用 `http://localhost:3000`，不要填 Worker 内部端口如 `http://127.0.0.1:8787`
- `RESEND_API_KEY`：Resend API key
- `RESEND_FROM_EMAIL`：认证邮件发件地址
- `RESEND_FROM_NAME`：认证邮件发件名
- `TURNSTILE_SECRET_KEY`：Turnstile 服务端校验密钥
- `SIGNUP_BONUS_CREDITS`：注册赠送额度
- `VITE_BETTER_AUTH_URL`：前端 Better Auth 基址，默认可与站点同源
- `OPENAI_RATELIMIT_ENABLED`：是否启用 AI 接口限流
- `OPENAI_RATELIMIT_WINDOW_MS`：限流窗口时长（毫秒）
- `OPENAI_RATELIMIT_EXPLAIN_MAX` / `OPENAI_RATELIMIT_REVIEW_MAX` / `OPENAI_RATELIMIT_GENERATE_MAX`：各 AI 路由窗口内最大请求数
- `OPENAI_RATELIMIT_STORE`：计数存储（`kv` 或 `memory`，默认 `kv`，失败自动降级）
- `OPENAI_DAILY_BUDGET_ENABLED`：是否启用每日预算控制
- `OPENAI_DAILY_BUDGET_MAX_TOKENS`：每日预算上限（估算 token）
- `OPENAI_STREAM_DEBUG`：是否启用后端 AI streaming 调试日志（默认 `false`）
- `TELEGRAM_NOTIFY_ENABLED`：是否启用 AI usage Telegram 通知（默认 `false`）
- `TELEGRAM_BOT_TOKEN`：Telegram Bot Token
- `TELEGRAM_CHAT_ID`：Telegram 接收消息的 chat id
- `CSP_ENABLE`：是否启用 CSP 响应头
- `CSP_MODE`：CSP 灰度模式（`off` / `report-only` / `enforce` / `both`）
- `CSP_POLICY`：自定义 CSP 策略文本（可选，不配置则使用内置默认策略）

说明：`CSP_*` 配置在本地 Node 服务端与 API 运行时生效；`vercel.json` 中仍保留静态 CSP 兜底策略。

- `VITE_ENABLE_CNY_FIREWORKS`：是否启用春节烟花入口与节日动效（默认 `false`，设为 `true` 后恢复 Header 入口和烟花 overlay）
- `VITE_ENABLE_AI_STREAM_DEBUG`：是否启用前端 AI streaming 调试日志（构建时变量，默认 `false`）

认证说明：

- 当前认证链路为 `Better Auth + D1 + Resend + Cookie Session`
- 注册 / 登录默认使用邮箱 + 密码
- 邮箱验证、忘记密码、重置密码邮件由 `Resend` 发送
- 前端所有需要登录态的请求都通过 `credentials: 'include'` 携带 cookie，不再发送 bearer token
- 业务用户主键直接使用 Better Auth 的 `user.id`

调试说明：

- 后端 `OPENAI_STREAM_DEBUG` 在 Worker 运行时生效；使用 `pnpm run dev:worker` 时，优先通过项目根目录下的 `.dev.vars` 注入，例如：

```bash
OPENAI_STREAM_DEBUG=true
```

- 前端 `VITE_ENABLE_AI_STREAM_DEBUG` 是构建时变量；如果只是临时本地排查，可直接在浏览器控制台执行：

```js
localStorage.setItem('ddlbuilder:ai-stream-debug', 'true');
```

- AI 路由响应头会暴露 `X-AI-Stream-Debug`。
  值为 `1` 表示后端 stream debug 已生效，值为 `0` 表示当前请求未开启后端 stream debug。

### 用户系统本地联调

首次拉起用户系统底座时，按下面顺序执行：

```bash
pnpm run db:migrate:local
pnpm run db:seed:local
pnpm run dev:worker
```

如果需要回到干净状态：

```bash
pnpm run db:reset:local
```

说明：

- 默认所有 D1 命令都操作 local simulation。
- remote D1 只允许通过显式的 `:remote` 命令访问。
- `pnpm run dev:worker` 和 `pnpm run db:*:local` 共享同一份本地 D1，持久化目录都是 `.wrangler/state/dev`。

## 使用说明

1. 填写表名与表中文名，选择数据库类型；或点击右上角“导入 SQL”按钮，粘贴已有 DDL 语句进行快速导入。
2. 在表格中按列填写：字段名、字段中文名、字段类型、是否为空。
3. 右侧区域将实时生成对应数据库的建表 DDL，可点击“全部复制”。

### 字段类型与空值规则

- 类型别名示例：
  - 文本类：varchar/nvarchar/char/nchar/text/mediumtext/longtext/clob
  - 数值类：tinyint/smallint/int/bigint/decimal(18,2)/float/double/real/number
  - 日期时间：date/time/timetz/timestamp/timestamptz/datetime/datetime2
  - 其它：uuid/json/jsonb/blob/varbinary/raw/xml/serial
- “是否为空”支持值：是/否、y/yes/true/1/√（其余视为否）。

### 各数据库生成规则要点（摘录）

- MySQL：列注释使用 COMMENT；text/json 等类型直接映射；serial → BIGINT UNSIGNED AUTO_INCREMENT。
- PostgreSQL：表与列注释使用 COMMENT 语句；json → jsonb；timestamp/time 带/不带时区遵循输入。
- PostgreSQL Citus：支持副本表 (`create_reference_table`) 和分片表 (`create_distributed_table`) 模式。
- SQL Server：text/json 使用 NVARCHAR(MAX)；日期时间使用 DATETIME2；注释用扩展属性 sp_addextendedproperty；uuid → UNIQUEIDENTIFIER；自增为 IDENTITY。
- Oracle：varchar → VARCHAR2，nvarchar → NVARCHAR2；整型映射为 NUMBER(n)；长文本用 CLOB，二进制用 BLOB；自增为 NUMBER GENERATED ALWAYS AS IDENTITY。
- MariaDB：基于 MySQL 语法，支持 MariaDB 特有关键字。
- TiDB：兼容 MySQL 语法，支持 TiDB 特有关键字。
- 达梦 (Dameng)：类 Oracle 语法，支持达梦特有类型映射。
- OceanBase：支持 MySQL 模式和 Oracle 模式，根据模式选择对应语法。

## 技术栈

- React 19、TypeScript、Vite 7
- UI 与交互：Tanstack Table 表格、Radix UI、Lucide 图标、Tailwind CSS
- 代码高亮：react-syntax-highlighter（白底主题）

---

本项目旨在快速生成可读、可复制的建表 DDL，适用于评审与落库前的沟通与对齐场景。
