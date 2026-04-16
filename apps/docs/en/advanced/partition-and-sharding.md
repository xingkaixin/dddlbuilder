# Partitioning and Sharding Configuration

## Who this is for

For users who have completed regular field modeling and now need structural optimization for large-table performance or distributed scenarios.

## What this solves

You can configure partitioning or sharding at table-design time and move performance and scalability constraints forward into schema design.

## Prerequisites

- You have completed base table and field configuration.
- You have selected the correct target database type.

## Steps

1. First confirm whether the `Partitioning` or `Sharding` tab appears. Result: you can determine whether the current database supports this advanced capability.  
MySQL, MariaDB, and TiDB show `Partitioning`; PostgreSQL Citus shows `Sharding`.
2. When configuring partitioning, enable `Enable partitioning` first, then choose partition type. Result: the system exposes parameters by type.  
`RANGE` / `LIST` fit range or enum scenarios, while `HASH` / `KEY` fit even-distribution scenarios.
3. Configure partition expression or fields, then complete partition count or partition definitions. Result: complete partition statements appear in DDL on the right.
4. When configuring sharding, choose `Reference Table` or `Distributed Table` mode first. Result: the system generates corresponding Citus semantics.  
After selecting `Distributed Table`, you must specify a distribution column.
5. Recheck configuration against business query patterns. Result: partition keys or sharding keys align with high-frequency filters and join paths.

## Done when

- Corresponding advanced configuration appears and is completed under the target database.
- DDL includes partitioning or sharding related statements.
- Key selection aligns with business access paths.

## Common pitfalls and failure handling

- Wrong database type causes tabs not to appear. Confirm database type first.
- Do not mix partition expressions and partition fields without a clear strategy.
- Sharding configuration is incomplete if no distribution column is set for distributed tables.
- Configuring partitioning/sharding only for "having advanced features" may increase maintenance cost. Confirm real business value first.
