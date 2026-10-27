# 分区与分片配置

本页介绍如何为 MySQL 系数据库配置表分区，以及如何为 PostgreSQL (Citus) 配置分布式分片。

## 适用场景

日志、历史订单、时序数据等千万行级别的大表，可以按范围分区，便于按分区归档旧数据，并缩小查询扫描的分区范围。使用 PostgreSQL Citus 做水平扩展时，可以把大表配置为分片表。

---

## 核心配置指引

### 1. MySQL 系数据库的表分区
数据库类型为 MySQL、MariaDB、TiDB、OceanBase (MySQL)、GBase 或 PolarDB 时，配置区的“高级设置”菜单中会出现“分区配置”：
1. 打开**启用分区**开关。
2. 选择**分区类型**：
   - **RANGE / RANGE COLUMNS**：按数值范围或日期区间分区，如按年份划分订单表。可点击“按年”“按月”“按日”快捷生成分区定义。
   - **LIST / LIST COLUMNS**：按离散值列表分区，如按地区或业务类型划分。
   - **HASH / KEY**：按哈希值把数据分散到指定数量的分区中，需要指定分区字段和分区数量。
3. 在**分区键**中输入字段名或表达式（如 `YEAR(created_at)`），再填写各分区的边界值。
4. DDL 中会生成对应的 `PARTITION BY ...` 子句。

### 2. PostgreSQL Citus 分布式分片
数据库类型为 **PostgreSQL (Citus)** 时，配置区的“高级设置”菜单中会出现“分片配置”：
1. 选择**表模式**：
   - **副本表**（Reference Table）：在所有节点上保存完整副本，适合字典表、配置表等小表，与大表关联查询时可在本节点完成。
   - **分片表**（Distributed Table）：按分片字段水平切分的大表，必须选择**分片字段**（Distribution Column），如 `tenant_id` 或 `user_id`。
2. DDL 末尾会追加 `SELECT create_reference_table('table_name');` 或 `SELECT create_distributed_table('table_name', 'shard_key');`。

---

## 校验与完成标志

- [ ] 当前数据库类型下能看到“分区配置”或“分片配置”。
- [ ] 分区键或分片字段与最常用的过滤条件、JOIN 条件一致，避免跨分区或跨分片扫描。
- [ ] DDL 中包含 `PARTITION BY` 子句或 Citus 的 `create_*_table` 语句。

## 常见注意事项

::: warning 主键与唯一索引约束
在 MySQL / PostgreSQL 分区表中，所有主键和唯一索引的字段集合**必须包含分区键**，否则建表时数据库会报错。
:::

- 看不到“分区配置”或“分片配置”时，检查顶部数据库类型是否为上面列出的类型。
- 分区会增加元数据管理开销。数据量在百万行以下时，先用普通表。
