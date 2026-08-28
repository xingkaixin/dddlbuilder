# 2026-08-28 代码审查问题处理报告

## 范围与结果

依据 `ddlbuilder-code-review-issues-2026-08-28.md` 处理 W1–W10、S1–S8、U1–U10、C1–C12，共 40 项编号问题。直接在 `main` 开发，起点为 `85aa6fac`。文档中的方案按实际代码、运行结果和兼容要求取舍，没有机械照搬。

最终状态：40 项编号问题全部处理完成，单元测试、脚本测试、E2E 与文档构建均已通过。

共 30 个本地提交（含本报告），按认证、计费、同步、生成器、界面和验证拆分。未推送远端、未创建 PR、未部署，也没有改动生产数据。

## 逐项处理

### Worker：10 项

| 编号 | 处理内容 | 主要回归覆盖 / 提交 |
| --- | --- | --- |
| W1 | 对 Better Auth 原生登录、找回密码、验证邮件等端点增加 D1 限流；统一路径归一化，不依赖进程内计数器。 | `auth-route`、`requestRateLimit`；`4a28d846` |
| W2 | 使用当前版本的 `auth.api.requestPasswordReset`；失败明确返回错误；邮件回调进入前端实际识别的重置密码表单。 | `admin-route`；`4a28d846`、`5cafdaf1` |
| W3 | 注册赠送额度支持幂等懒补发；注册时暂时失败不会导致账号永久没有初始额度。 | `credits`、`credits-route`；`9b75f0d8` |
| W4 | HTTP 与 Durable Object 共用会话有效性判断；管理员撤销会话经过认证适配器生命周期，统一触发连接踢出。 | `betterAuth`、`workspaceYDocAccess`、`admin-route`；`ddfa4d7f`、`1619dbd4` |
| W5 | 预留和结算分别以 D1 batch 原子执行；分录使用 RETURNING；输入校验提前；新请求不再依赖中间结算状态，旧记录仍可回收。 | SQLite 事务、分录约束、并发/重复结算和故障回滚测试；`9b75f0d8` |
| W6 | 上游流中断时按已产生输出估算用量结算；没有输出时退款，避免部分输出却全额退款。 | `aiRoute`、`aiUsage`；`9b75f0d8` |
| W7 | 非法迁移快照使用领域错误返回 400；移除把所有异常包装成 503 的路由逻辑。 | `workspaceMigration`；`c68fd830` |
| W8 | 过期治理数据由定时任务清理；移除限流请求热路径的清理写入；保留结算记录的安全留存窗口。 | `requestRateLimit`、`aiBudget`；`c68fd830` |
| W9 | 同批 Yjs 更新合并到一个存储事务；减少重复闹钟检查；checkpoint 仅读取比较所需的哈希元数据；恢复直接压缩目标文档。 | `workspaceYDocDurableObject`、`workspaceYDocStorage`、`workspaceEntitySnapshot`；`c68fd830` |
| W10 | 删除认证别名、空转导出和重复注释；请求体解析结果改为明确的成功/失败联合类型。 | 类型检查、HTTP/路由测试；`c68fd830`、`9b75f0d8` |

### Web 状态与同步：8 项

| 编号 | 处理内容 | 主要回归覆盖 / 提交 |
| --- | --- | --- |
| S1 | 只有首次认证解析进入 loading；后台刷新不再卸载匿名编辑器。 | `AuthSessionProvider`、工作区门禁；`c9c44fad` |
| S2 | 草稿直接以 Y.Doc 更新为准，移除过期三方合并基线；同时修正“远端恢复旧值时被相等判断忽略”的第二处问题。 | 本地修改后远端回退、远端连续变更；`c9c44fad` |
| S3 | 稳定文档上下文与连接状态分离；相同状态不重复通知，但同步等待者仍正常完成。 | Provider 渲染次数、SyncClient 状态通知；`b5604044` |
| S4 | Y.Doc 模式的草稿列表由文档投影得到，不再手动维护重复列表；写入失败不留下虚假记录；本地删除队列不二次删除刚重建的文档。 | `useDraftRecords`；`0cfd7e96` |
| S5 | 清理账号全部已登记工作区缓存、版本和评审历史；云端永久删除表同步清孤儿历史；分享缓存采用最近 5 个的 LRU。 | `workspaceAccountService`、历史清理、缓存淘汰；`03186a68`、`117a2521` |
| S6 | 启动读取失败进入可重试错误态并阻止保存；退出清理失败保留待清理记录、提示用户，下次启动重试后再开放工作区。 | bootstrap、hydration、Provider 门禁、AuthSessionProvider；`0c0959d8`、`117a2521` |
| S7 | 渲染期间复用已计算的状态和签名；仅页面退出等需要最新值的事件再次取快照。 | `usePersistedSync`；`c9c44fad` |
| S8 | 工作区查询失效监听由应用单一入口持有；多个 authority 消费者不再各自监听、刷新。 | 多消费者监听/刷新次数；`0c0959d8` |

### Web 界面：10 项

| 编号 | 处理内容 | 主要回归覆盖 / 提交 |
| --- | --- | --- |
| U1 | 批量导入捕获提交失败，保留 SQL 和选择以便重试；同名覆盖歧义以明确类型和三语文案展示。 | 导入失败、歧义、重试成功；`552e759b` |
| U2 | 管理端与用户端共用消费为负、赠送/退款为正的金额格式函数。 | 消费 50 显示 `-50`；`90b29fc6`、`b271e289` |
| U3 | 仅成功生成后清空本次提交的输入；失败、取消及请求期间新输入的内容均保留。 | 成功/失败、异步期间继续输入；`b25c97ff` |
| U4 | 外键新增表单收敛为一个可空草稿；引用字段受控，回车、失焦和直接确认均可提交；自动名称遵守方言长度限制。 | 未按回车直接确认、复合外键、Oracle 名称长度和动作限制；`048d94e4` |
| U5 | 分区行使用持久 ID，更新/删除按 ID 定位；旧数据确定性补 ID；数量输入允许暂时清空，合法值即时生效，失焦归一化。 | 删除前一行仍保留焦点与内容、旧数据兼容、分区与 diff E2E；`827399d2`、`f6973eda` |
| U6 | 新增独立“新增”徽标译文；版本字段数直接渲染完整译文，不再截取数字。 | 含其他数字的译文不被篡改；`b552e81a` |
| U7 | 管理操作提示、空态、标签和日期使用统一语言资源与 locale；去掉散落的中文默认值，补齐缺失资源。 | 管理端错误提示、三语键与插值一致性；`b271e289` |
| U8 | AI 权限 Hook 提供无副作用的 accessError；两个面板共用提示组件，DDL 输出保留原有 tooltip 形式并共用判断。 | 权限提示不会自行打开登录框；`b25c97ff` |
| U9 | 用户名编辑独立为以账号、当前姓名和打开状态标识的表单；更新/重开取最新姓名，普通重渲染保留未提交输入。 | 姓名外部更新、未保存编辑、关闭重开；`90b29fc6` |
| U10 | 版本缺失和读取/回滚异常均给出提示；缺失时刷新列表，失败不关闭窗口。 | 缺失与异常两条路径；`552e759b` |

### 共享模型与生成器：12 项

| 编号 | 处理内容 | 主要回归覆盖 / 提交 |
| --- | --- | --- |
| C1 | Oracle 系 MODIFY 按差异生成类型、NULL/NOT NULL、DEFAULT，避免重复 NOT NULL 或漏掉改为可空。 | Oracle/OceanBase Oracle/DM ALTER；`35d18a19` |
| C2 | SQL 字符串按方言统一转义单引号及反斜杠，覆盖注释与默认值。 | 尾反斜杠、路径、单引号；`35d18a19` |
| C3 | MySQL 系特殊类型常量默认值使用括号表达式。 | TEXT/BLOB/JSON 等默认值；`35d18a19` |
| C4 | 采用 MySQL 8.0 完整保留字基表，家族变体复用；Oracle 家族同样共享基础表。 | 关键保留字标识符和方言输出；`35d18a19` |
| C5 | Oracle 建表不再隐式创建公共同义词；显式同义词工具正确处理限定目标与引号。 | 不自动追加同义词、限定名；`35d18a19` |
| C6 | TIMESTAMP 保留小数秒参数；类型映射规则使用互斥联合类型。 | `timestamp(6)`；`35d18a19` |
| C7 | 限定名称解析下沉共享包，workspace 解码与 DDL 使用同一实现。 | 引号内点号、schema 与表名；`35d18a19` |
| C8 | 索引以四种 kind 为唯一类型来源；旧布尔字段只在输入边界兼容；覆盖快照、保存表、版本、SQL 导入和 WebMCP。 | 旧主键/唯一约束恢复、生成器和 UI；`72c1d46a`、`3bbe0a6f`、`a7101ae5`、`2ba1d9e6` |
| C9 | SQL Server 表注释 ALTER 输出实际 add/update/drop extended property 语句。 | 新增、修改、删除注释；`35d18a19` |
| C10 | Hive 分区、分桶列使用统一标识符格式化。 | 保留字列名；`35d18a19` |
| C11 | ORM 字符串按目标语言转义；GORM 不安全注释移出标签；Prisma 时间默认值改用数据库表达式。 | 五类生成器回归，Go vet 与 Python 语法编译；`3d48a61b` |
| C12 | 字段类型按解析后的基础类型、参数和 unsigned 比较，忽略大小写及无语义格式差异。 | 类型大小写、参数/unsigned 真变更；`35d18a19` |

## 验证记录

| 检查 | 结果 |
| --- | --- |
| `pnpm format` | 通过 |
| `pnpm lint` | 通过，无 lint 警告或错误 |
| `pnpm typecheck` | 通过 |
| `pnpm test` | 3,128 项通过：Web 1,581、Worker 420、DDL 962、workspace-core 165 |
| `pnpm test:scripts` | 26 项通过 |
| `pnpm run test:e2e` | 112 项全部通过：浏览器 110、真实 Worker/D1 运行时 2 |
| `pnpm docs:build` | 三语文档构建通过 |
| Go / Python 生成结果 | `go vet`、`python3 -m py_compile` 通过 |

关键故障先增加诊断输出、观察实际运行结果，再修改实现；临时诊断输出已移除，回归测试保留。首次 E2E 发现分区数量延迟提交导致 DDL 和差异入口没有立即更新，已据此调整合法值的提交时机，不通过放宽断言掩盖行为问题。该轮另有一次页面导航超时；三项失败用例随后单独复跑全部通过。第二轮的另一项导航超时在操作之前发生，单独重复 6 次均通过。故障注入进一步确认，外部字体 CSS 和统计脚本不响应会阻塞 load 事件；E2E 配置现移除这些外部资源，并新增对应回归测试。生产页面不变，也没有放宽功能断言或增加重试次数。最终完整命令运行成功，110 项浏览器测试及 2 项真实 Worker/D1 运行时测试全部通过。

## 方案取舍与兼容性

- 没有为了 Oracle 同义词增加新的持久设置和 UI 开关。建表本身不应隐式要求创建公共对象的权限；有需要时单独创建同义词。
- 没有引入通用表单 Hook、通用 toast 包装器或统一账本表格。复用金额与权限规则，保留各操作实际不同的后续行为，避免无必要的抽象。
- 使用项目现有 Oxlint 和测试，没有新增 ESLint 工具链。管理端的散落默认译文已删除，三语资源一致性由测试验证。
- `IndexDefinition.kind` 替代旧布尔字段；新代码可读旧保存数据。旧客户端不能假定能正确读取新格式，多设备使用时应同时刷新到新版本。
- 旧分区没有 ID 时在读取边界确定性补齐，避免每次解码改变身份；新分区在创建时分配 ID。
- MySQL 特殊类型常量默认值要求 MySQL 8.0.13+；兼容数据库仍需按部署版本验证。[MySQL 默认值文档](https://dev.mysql.com/doc/refman/8.0/en/data-type-defaults.html)
- MySQL 系字符串转义按默认反斜杠语义生成；启用 `NO_BACKSLASH_ESCAPES` 的环境需另行核对。[MySQL 字符串文档](https://dev.mysql.com/doc/refman/8.0/en/string-literals.html)
- 账号退出会清理当前范围及该账号已登记的历史工作区范围。升级前遗留且无法归属账号的独立 IndexedDB 库不会被盲删，避免误删其他账号数据。
- 旧 AI 计费中间状态仍由回收路径处理，不要求重置历史账本；保留请求返回后的 `waitUntil` 生命周期约束。

## 验证边界与附录观察

本次未连接生产服务，也未在所有目标数据库中实际执行生成 SQL；SQL 结论来自方言回归测试和官方语法核对。Go/Python 已做语法工具验证，Java、Prisma 等仍需在实际业务项目中验收依赖、版本和模型约束。

原审查文档的“包边界观察”明确不单列为 bug。本次没有扩展为十余张 Drizzle schema 的全量建模或跨包类型整理；相关建议不计入 40 项编号问题，也不宣称已经完成。这样避免把修复任务扩大为额外数据库建模工程。

## 提交清单

以下为修复、测试与使用说明提交；本报告另有独立提交。

```text
4a28d846 auth: Guard endpoints and repair password reset
9b75f0d8 credits: Make AI accounting atomic and recoverable
ddfa4d7f auth: Centralize session access and revocation
c68fd830 workspace: Batch persistence and preserve failures
1619dbd4 auth: Isolate revocation route coverage
35d18a19 ddl: Preserve dialect syntax and identifiers
3d48a61b orm: Escape generated language literals
72c1d46a schema: Introduce compatible index kinds
3bbe0a6f schema: Use one authoritative index kind
c9c44fad workspace: Preserve refresh and remote edits
b5604044 workspace: Isolate document subscriptions
0cfd7e96 workspace: Derive drafts from their document
0c0959d8 workspace: Own snapshot loading and retries
03186a68 workspace: Bound caches and remove stale history
a7101ae5 workspace: Decode legacy stored index definitions
117a2521 workspace: Retry failed account cleanup
552e759b ui: Report import and version rollback failures
b25c97ff ai: Preserve prompts and unify access notices
90b29fc6 account: Correct ledger amounts and name drafts
b271e289 admin: Localize notices and show credit debits
048d94e4 foreign-keys: Preserve pending reference fields
827399d2 partitions: Preserve row identity while editing
b552e81a ui: Keep translated labels intact
5cafdaf1 auth: Open the reset form from admin emails
7630498a tests: Await AI dialog completion
9cbc535f docs: Explain dialect and index compatibility
f6973eda partitions: Apply valid counts while typing
2ba1d9e6 orm: Simplify Prisma index filtering
b638bc82 e2e: Isolate pages from external asset services
```
