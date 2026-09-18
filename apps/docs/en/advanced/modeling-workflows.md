# Query design, business modules and field impact

Open **Database tools** in the header to design related queries, create a group of business tables or inspect field dependencies. These tools work with schemas and do not connect to or execute user databases.

## Visual query design

Select ordinary tables from one MySQL or PostgreSQL dialect. Sources include saved tables, schema snapshot JSON and strictly parsed SQL. SQL input goes to the existing parsing service; query filter values stay in the browser.

1. Open **Query design**, select tables and choose a root table.
2. Add a physical or logical relationship and choose INNER or LEFT. Composite relationships retain every ON condition; explicitly choose among alternative relationships.
3. Add output columns, optional COUNT, SUM, AVG, MIN or MAX, or COUNT(*), and aliases.
4. Add AND filters, GROUP BY, output-column ordering and LIMIT (1–10000). Non-aggregate outputs in an aggregate query must be grouped.
5. Copy or download SQL and download the parameter JSON. MySQL uses `?`; PostgreSQL uses `$1`, `$2`. Parameters remain strings in positional order.

For example, join users to orders, output usernames and SUM of order amounts, then group by username. LIKE handles text patterns. IS NULL and IS NOT NULL do not consume parameters.

SQL is not executed. Bind parameters using your project's database driver and convert types as required. Self joins, cyclic joins, subqueries, UNION and arbitrary SQL expressions are outside this version. Changing sources clears the design. Reconfigure after closing the dialog, changing tools or changing accounts.

## Multi-table business modules

**Business modules** offers three editable starting points:

| Module | Tables | Assumptions |
| --- | --- | --- |
| Users and permissions | users, roles, permissions, user_roles, role_permissions | Basic RBAC; application-enforced permissions, without tenants, role inheritance or password management |
| Resource booking | resources, slots, bookings | One booking record per slot; reuse that record after cancellation. The application handles overlapping slots and concurrency |
| Inventory | products, warehouses, stock, stock_movements | Unique product/warehouse pairs; update balances and movements in one application transaction. Non-negative stock is not enforced |

1. Choose a module, MySQL/PostgreSQL, table prefix and ID strategy.
2. Leave the prefix empty or use up to 20 lowercase letters, digits and underscores, beginning with a letter. Table names, indexes and references receive the prefix together.
3. Integer IDs use auto-increment; varchar(36) IDs must be supplied by the application.
4. Expand tables to inspect fields and relationships, then download SQL or a schema snapshot.
5. Save the entire group to the workspace. Open and edit its tables through the normal editor.

A conflicting name prevents the entire save. Existing tables are not overwritten and individual tables are not skipped. Change the prefix and retry. Persistence and synchronization follow the current workspace. To create test data, save the group and select it in **Relational test data**, then configure the relevant business rules.

## SQLite / Cloudflare D1

Choose **SQLite / D1** in the main editor, configure fields, keys, indexes and foreign keys, then save. D1 uses the SQLite dialect. DDLBuilder does not need your Cloudflare token.

- Common integers and booleans map to INTEGER; dates, JSON and strings to TEXT; floating point to REAL; binary values to BLOB; decimals to NUMERIC. SQLite affinity does not enforce length, exact decimal precision or JSON validity. Handle these requirements in the application.
- Auto-increment requires one ascending INTEGER primary key. Composite or non-integer keys cannot auto-increment.
- Primary, unique and physical foreign-key constraints are inside CREATE TABLE. Ordinary and unique indexes are separate statements. Logical relationships do not become constraints.
- Defaults support constants and CURRENT_TIMESTAMP. Arbitrary default expressions, database UUID defaults, ON UPDATE, cross-schema references, partitioning and sharding are unsupported.
- Descriptions become SQL comments. Logical enums do not become CHECK constraints.

### Export a complete initialization project

1. Open **Database tools → SQLite / D1 export**.
2. Choose SQLite or Cloudflare D1 as the export target, then select saved SQLite tables or upload a schema snapshot. Include every referenced parent table. Missing references or duplicate table/index names block export.
3. Download `0001_init.sql`, `schema.ts` and the instructions.
4. Execute SQL in an empty SQLite database with `PRAGMA foreign_keys = ON` enabled for the connection.

D1 export enforces 100 columns per table and 100,000 bytes per SQL statement. Exceeding either limit blocks export. Standalone SQLite does not use these D1 checks. See the full [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

For D1, put the SQL in your project's migrations directory and verify locally first:

```sh
wrangler d1 migrations apply <database-name> --local
```

The Drizzle file uses `drizzle-orm/sqlite-core` and preserves columns, primary/unique keys, indexes and foreign keys. Install `drizzle-orm` in your project. TypeScript properties are escaped while SQL names remain in column definitions. DESC ordering on primary/unique constraints is unsupported in this version; use a unique index for descending uniqueness.

SQL and Drizzle describe the same initial structure. Choose one migration source to avoid duplicate creation. The main editor also provides single-table Drizzle output; use the group export for cross-table foreign keys.

SQLite SQL import, automatic ALTER/rollback, grants, routines and storage estimation are unavailable. Initialization exports exclude views; the main editor only generates CREATE VIEW. Existing databases need a separately designed migration. See [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [SQLite CREATE TABLE](https://www.sqlite.org/lang_createtable.html) and [Drizzle constraints](https://orm.drizzle.team/docs/indexes-constraints).

## Field impact analysis

1. Open **Field impact** and select tables from one dialect. Save edits before reading saved tables.
2. Choose the target table and field you plan to change.
3. Inspect primary keys/indexes, incoming and outgoing physical foreign keys, business relationships, MySQL partitions, Citus distribution columns, Hive partition columns and clustering columns.
4. Download the Markdown report. Composite keys and relationships remain grouped.

The report lists checked tables, excluded views and relationships outside the selection. It checks only direct dependencies in current models. It does not parse view SQL, scan application code or discover missing objects. No findings does not imply a safe change. Select the full scope and check external consumers. Changing the selection clears the report. The tool never renames, deletes or adjusts constraints automatically.
