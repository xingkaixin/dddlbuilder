# 查询设计、业务模块与字段影响

需要编写关联查询、搭建一组业务表或检查字段依赖时，打开顶栏「数据库工具」。这些工具使用现有表结构，不连接或执行用户数据库。

## 可视化查询设计

支持同一方言的 MySQL 或 PostgreSQL 普通表。输入可以是已保存表、结构快照 JSON 或严格解析的 SQL；SQL 输入会发送到现有解析服务，查询条件在浏览器内处理。

1. 进入「查询设计」，选择需要的表和根表。
2. 在「添加连接关系」选择物理外键或逻辑关系，再选择 INNER 或 LEFT。复合关系会完整生成 ON 条件；有多条关系时由你明确选择。
3. 添加输出字段。可选择 COUNT、SUM、AVG、MIN、MAX，或 COUNT(*)，并设置别名。
4. 添加 AND 过滤条件、GROUP BY、输出列排序与 LIMIT（1–10000）。聚合查询中的非聚合输出字段必须分组。
5. 复制或下载 SQL，再下载参数 JSON。MySQL 用 `?`，PostgreSQL 用 `$1`、`$2`；参数按顺序保留为字符串。

例如，选择用户与订单关系后，可以输出用户名和订单金额 SUM，并按用户名分组。文本比较用 LIKE；NULL 使用 IS NULL / IS NOT NULL，不占参数位置。

SQL 不会执行。将参数交给自己项目的数据库驱动绑定，按应用需要转换参数类型。首版不支持自连接、循环连接、子查询、UNION 或任意 SQL 表达式。修改来源会清空设计；关闭弹窗、切换工具或账号后需重新配置。

## 多表业务模块

「业务模块」提供三个可继续编辑的起点：

| 模块 | 表集合 | 设计假设 |
| --- | --- | --- |
| 用户与权限 | users、roles、permissions、user_roles、role_permissions | 基础 RBAC；权限检查由应用执行，不含租户隔离、角色继承或密码管理 |
| 资源预约 | resources、slots、bookings | 一个时段最多一条预约记录；取消后重新预约需更新该记录。时段重叠和并发规则由应用处理 |
| 库存管理 | products、warehouses、stock、stock_movements | 商品与仓库组合唯一；余额与流水需要应用在同一事务中更新，不自动保证库存非负 |

1. 选择模块、MySQL/PostgreSQL、表名前缀和主键方案。
2. 前缀可留空，或使用以小写字母开头的最多 20 个小写字母、数字、下划线。它会同时应用于表、索引和外键引用。
3. 整数方案使用自增主键；字符串方案使用 varchar(36)，值由应用提供。
4. 展开表检查字段与关系，下载建表 SQL 或结构快照。
5. 点击「保存整组到工作区」，成功后可按正常方式打开、编辑和保存各表。

已有同名表时整组保存失败，不跳过单表、不覆盖原表。调整前缀后重试。保存内容沿用当前工作区的持久化与同步方式。创建测试数据可在保存后进入「关联测试数据」选择整组表，另行配置业务规则。

## SQLite / Cloudflare D1

在主编辑器的数据库选择器选择 **SQLite / D1**，设置字段、主键、索引和外键并保存。D1 使用 SQLite 方言；不需要向 DDLBuilder 提供 Cloudflare token。

- 常用整数和布尔映射为 INTEGER，日期、JSON 和字符映射为 TEXT，浮点映射为 REAL，二进制为 BLOB，精确小数为 NUMERIC。SQLite 类型亲和性不保证长度、小数精度或 JSON 合法性，应用应处理这些要求。
- 自增要求一个升序 INTEGER 主键；复合主键和非整数主键不能自增。
- 主键、唯一约束与物理外键写入 CREATE TABLE；普通索引和唯一索引单独创建。逻辑关系不成为数据库约束。
- 默认值支持常量和 CURRENT_TIMESTAMP。不支持任意默认表达式、数据库 UUID 默认函数、ON UPDATE、跨 Schema、分区和分片。
- 表和字段说明输出为 SQL 注释，逻辑枚举不会自动成为 CHECK 约束。

### 导出完整初始化项目

1. 打开「数据库工具」→「SQLite / D1 导出」。
2. 选择导出目标 SQLite 或 Cloudflare D1，再选择保存的 SQLite 表或上传结构快照。选中外键引用的全部父表；缺失引用或重复的表/索引名会阻止导出。
3. 下载 `0001_init.sql`、`schema.ts` 和使用说明。
4. 在空 SQLite 数据库执行 SQL，连接需启用 `PRAGMA foreign_keys = ON`。

D1 导出会检查每表最多 100 列、单条 SQL 最多 100,000 字节；超限时停止导出。独立 SQLite 不使用这层 D1 限制。完整的平台限制见 [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)。

D1 用户将 SQL 放入自己项目的 migrations 目录，先在本地验证：

```sh
wrangler d1 migrations apply <数据库名> --local
```

Drizzle 文件使用 `drizzle-orm/sqlite-core`，保留列、主键、唯一键、索引与外键。安装 `drizzle-orm` 后放入自己的项目。TypeScript 属性名经过转义，SQL 名称保留在列定义中。首版不支持主键/唯一约束的 DESC 排序；需要降序唯一性时使用唯一索引。

SQL 与 Drizzle 表达同一初始结构，选择一种迁移来源，避免重复创建。主编辑器也提供单表 Drizzle 输出；含跨表外键时使用整组导出。

当前不支持 SQLite SQL 导入、自动 ALTER / 回滚、授权脚本、存储过程与存储估算。初始化导出不包含视图；主编辑器仅生成 CREATE VIEW。已有数据库需要另行设计迁移。参考 [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)、[SQLite 建表语法](https://www.sqlite.org/lang_createtable.html) 与 [Drizzle 约束](https://orm.drizzle.team/docs/indexes-constraints)。

## 字段影响分析

1. 进入「影响分析」，选择同一方言的表集合。先保存编辑，再读取已保存表。
2. 选择目标表与准备修改的字段。
3. 检查主键/索引、入向与出向数据库外键、业务逻辑关系、MySQL 分区、Citus 分布字段、Hive 分区列和聚簇列。
4. 下载 Markdown 报告供后续修改使用。复合键和关系按完整字段组显示。

报告展示检查表数、排除的视图与范围外关系。它只检查当前模型中的直接依赖，不解析视图 SQL、不扫描应用代码，也无法发现未导入的对象。未发现依赖不代表修改安全；选择完整范围并核对外部使用方。修改选择后旧报告立即失效。工具不自动改名、删除或调整约束。
