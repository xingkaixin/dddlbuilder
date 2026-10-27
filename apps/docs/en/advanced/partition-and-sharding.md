# Partitioning and sharding configuration

This page explains how to configure table partitioning for MySQL-family databases and distributed sharding for PostgreSQL (Citus).

## When to use

For large tables with tens of millions of rows, such as logs, historical orders, or time-series data, range partitioning lets you archive old data by partition and limits the partitions a query scans. If you scale out with PostgreSQL Citus, you can configure large tables as distributed tables.

---

## Steps

### 1. Table partitioning for MySQL-family databases
When the database type is MySQL, MariaDB, TiDB, OceanBase (MySQL), GBase, or PolarDB, the **Advanced** menu in the configuration area includes **Partitioning**:
1. Turn on the **Enable partitioning** switch.
2. Choose a **Partition Type**:
   - **RANGE / RANGE COLUMNS** partitions by numeric ranges or date intervals, for example orders by year. Click **By Year**, **By Month**, or **By Day** to generate partition definitions.
   - **LIST / LIST COLUMNS** partitions by lists of discrete values, for example by region or business type.
   - **HASH / KEY** spreads rows across a fixed number of partitions by hash value. It requires a partition column and a partition count.
3. In **Partition Key**, enter a column name or an expression such as `YEAR(created_at)`, then enter the bound values for each partition.
4. The DDL includes the matching `PARTITION BY ...` clause.

### 2. PostgreSQL Citus distributed sharding
When the database type is **PostgreSQL (Citus)**, the **Advanced** menu in the configuration area includes **Sharding**:
1. Choose a **Table Mode**:
   - A **Reference Table** keeps a full copy on every node. Use it for small tables such as dictionaries or settings, so joins with large tables can run on the local node.
   - A **Distributed Table** is a large table split by its distribution column. You must choose a **Distribution Column**, such as `tenant_id` or `user_id`.
2. The DDL ends with `SELECT create_reference_table('table_name');` or `SELECT create_distributed_table('table_name', 'shard_key');`.

---

## Verification checklist

- [ ] **Partitioning** or **Sharding** appears for the current database type.
- [ ] The partition key or distribution column matches your most frequent filter and JOIN conditions, so queries do not scan across partitions or shards.
- [ ] The DDL contains a `PARTITION BY` clause or a Citus `create_*_table` statement.

## Notes

::: warning Primary key and unique index requirements
In MySQL and PostgreSQL partitioned tables, every primary key and unique index **must include the partition key columns**. Otherwise the database returns an error when it creates the table.
:::

- If **Partitioning** or **Sharding** does not appear, check that the database type at the top is one of the types listed above.
- Partitioning adds metadata overhead. For tables under a million rows, start with a regular table.
