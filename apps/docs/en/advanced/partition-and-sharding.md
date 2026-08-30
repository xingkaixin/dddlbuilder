# Partitioning and Sharding Configuration

This guide details how to configure table-level **Partitioning Strategies** and **Distributed Sharding** for high-volume and horizontally scalable data architectures.

## Overview

Optimize large-scale tables (e.g., audit logs, historical orders, IoT time-series data) for lifecycle retention and query pruning, or leverage PostgreSQL Citus for scale-out distributed processing.

---

## Configuration Walkthrough

### 1. MySQL / MariaDB / TiDB Table Partitioning
When the target dialect is set to **MySQL**, **MariaDB**, or **TiDB**, the "Partitioning" tab becomes active:
1. Toggle the **Enable Partitioning** switch.
2. **Select Partitioning Strategy**:
   - **RANGE / RANGE COLUMNS**: Ideal for numeric ranges or continuous date intervals (e.g., partitioning orders by year). Use the "By Year", "By Month", or "By Day" quick-generate helpers for rapid setup.
   - **LIST / LIST COLUMNS**: Ideal for discrete enum value sets (e.g., partitioning by region or tenant tier).
   - **HASH / KEY**: Distributes data uniformly across a specified partition count; requires a target column and partition count.
3. **Define Partition Expression**: Enter column expressions (e.g., `YEAR(created_at)`) and specify bound values for each partition.
4. The output panel immediately generates the complete `PARTITION BY ...` clause.

### 2. PostgreSQL Citus Distributed Sharding
When the target dialect is set to **PostgreSQL (Citus)**, the "Sharding" tab becomes available:
1. **Choose Table Distribution Mode**:
   - **Reference Table**: Replicates smaller dictionary/lookup tables across all worker nodes for efficient local joins.
   - **Distributed Table**: Shards high-volume tables across the cluster; requires designating a primary **Distribution Column** (e.g., `tenant_id` or `user_id`).
2. The output panel automatically appends standard Citus management statements: `SELECT create_reference_table('table_name');` or `SELECT create_distributed_table('table_name', 'shard_key');`.

---

## Verification Checklist

- [ ] Dialect-specific partitioning or sharding controls are properly configured.
- [ ] Partition/sharding keys align directly with the most frequent query filters to maximize pruning efficiency.
- [ ] The generated DDL script includes all necessary partitioning definitions and distribution commands.

## Tips and Common Traps

::: warning Primary and Unique Key Constraint Requirements
In partitioned tables (e.g., MySQL, PostgreSQL), every primary key and unique constraint **must include the partition key columns**, otherwise table creation will fail at execution time.
:::

- **Tab Visibility**: If partitioning or sharding tabs do not appear, verify that your active database dialect is set to a supported engine.
- **Avoid Over-Partitioning**: Partitioning introduces metadata overhead. For modest datasets (under millions of rows), start with standard indexed tables.
