---
title: "SQL schema diff and data dictionary export"
description: "Compare two MySQL or PostgreSQL SQL schemas online and export migration SQL. Generate Markdown or offline HTML data dictionaries and related test data without a database connection."
---

# SQL schema diff and data dictionary export

Use **Database tools** in the header to document an existing database, compare two environments, or prepare related test rows. The entry is also available in an empty workspace. Signing in or creating a table first is not required.

## Prepare inputs

The dictionary and test-data tools accept three sources:

- **Saved tables**: use saved versions from the current workspace. Save edits first, then click **Reload tables** and select the tables.
- **Schema snapshot JSON**: load a file exported by the dictionary, including field identities and standard summaries.
- **SQL**: choose a database, paste SQL or upload a `.sql` / `.txt` file, then click **Parse SQL**. Each input accepts up to 50,000 characters.

The tools send SQL to the existing parsing service. Parsed tables are used only by the tools and are not written to the workspace. Closing the tools or changing accounts clears temporary input. Keep your downloaded files separately.

These tools use strict parsing. They accept supported `CREATE TABLE`, ordinary `CREATE INDEX`, and `ALTER TABLE ... ADD` statements for primary, unique, and foreign-key constraints. Supply schema snapshots rather than full backups containing `INSERT`, `SET`, `DROP`, or privilege statements.

Processing stops at syntax the tools cannot preserve, including CHECK, generated columns, expression or prefix indexes, and inline REFERENCES. Foreign keys and unique constraints need their actual database names, such as `CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES users(id)`. Do not remove real constraints to bypass errors. Use an equivalent supported table-level form or a separate workflow for unsupported structures.

## Data dictionary

1. Open **Data dictionary**, then parse SQL or select saved tables.
2. Enter a document title and search by table, field, or business description.
3. Click **Export Markdown** or **Export offline HTML**. Search does not narrow the export.

The dictionary includes types, nullability, primary keys, defaults, update policies, comments, logical enums, indexes, physical foreign keys, and logical relationships. Linked field standards include the name, description, and unit from this browser's library. Unavailable standards are marked as missing.

HTML includes a table directory, relationship links, and local search. Open it directly in a browser without network access. Relationships whose target table is not selected are marked **Outside selection**. Relationships use lists and links. Markdown is suitable for repositories and further editing.

## Compare two SQL snapshots

The first version supports MySQL or PostgreSQL snapshots in the same dialect. It does not convert between databases.

1. Open **Schema comparison** and choose the database.
2. Fill in **Current schema** and **Target schema**. An empty side represents an empty database.
3. Click **Compare schemas** and inspect added, removed, modified, and unchanged tables.
4. If a removed field and an added field are actually one rename, match them in **Confirm column renames**. Unmatched fields remain deletions and additions.
5. Export the Markdown report or migration SQL. Editing input clears the previous result.

Tables match by schema and name. The migration removes affected foreign keys, applies table and column changes, then restores foreign keys. Changes requiring manual migration block SQL downloads while keeping the report available.

The SQL covers only the supplied snapshots. Check external dependencies, permissions, existing data, and database versions before execution. Drops delete data. The tools do not connect to databases, execute scripts, or restore database contents.

## Relational test data

The first version supports a group of MySQL or PostgreSQL tables.

1. Open **Relational test data** and select child tables together with their referenced parents.
2. Set row counts and a fixed seed. To generate rows that follow business relationships, select **Also generate logical relationships**.
3. Click **Generate test data** and inspect the first five rows of each table.
4. Download complete INSERT SQL or JSON grouped by table.

The generator creates parent tables first, then picks foreign key values from the values it generated for the parents. It copies composite foreign keys as a whole and checks primary and unique keys as column groups. One-to-one relationships also restrict child counts. Identical schemas, counts, and seeds produce identical data.

Scope and limits:

- 1 to 1,000 rows per table, up to 10,000 rows and 250,000 field values in total.
- Common integers, exact decimals, floating-point numbers, strings, booleans, date/time values, UUID, and JSON are supported. Logical enums participate in generation. Unsupported types produce errors.
- JSON stores bigint and exact decimals as strings to preserve precision. SQL still uses numeric literals.
- Cycles, self-references, missing parents, incompatible reference types, overlapping foreign keys, and exhausted unique values block generation. Adjust the selection, counts, or model and retry.
- Use an empty test database with a matching schema. Existing data is not checked, and PostgreSQL sequences are not advanced. MySQL strings assume the default backslash escape mode.

For single-table generation, see [Mock Data and Logical Enums](/en/advanced/mock-data-and-enum). To compare the current table with its saved version, see [Change Diff and Rollback](/en/advanced/diff-and-rollback).

## Publish project documentation

After signing in, go to **Publish and manage** below the dictionary, enter a publication title and access scope, and click **Create publication**. **Only me** is the default. With **Anyone with the link**, other people can read without signing in. The reader includes a revision, update time, search and relationship navigation. Referenced standard names, descriptions and units are stored with the publication.

To update, select the latest table structures, choose the original document in **Existing publication**, and click **Republish current schema**. The URL stays the same and the revision increases. To change only the title or access scope, click **Save title and access**. If another device changed the same revision, DDLBuilder rejects the overwrite. Click **Reload tables** beside the error, review the changes, then retry.

**Publications** lists existing documents and proposals with open, copy link, access and delete actions. After you switch back to **Only me**, later reads by other people are rejected. Already opened or downloaded copies cannot be recalled. Deleting a proposal also deletes its comments.

Each account can have up to 100 publications. Each publication can hold up to 512 KiB, 200 tables and 10,000 fields. If content exceeds a limit, narrow the selection. Nothing is saved partially. Publications are independent of workspace edits and change only when explicitly published.

## Portable snapshots and refresh

Use **Export schema snapshot** in the dictionary to download JSON. Select **Schema snapshot JSON** as an input to reuse field identities, descriptions, relationships and standard summaries. Files are limited to 2 MiB. Unknown versions, duplicate tables and definitions that would lose supplied properties are rejected.

Refresh supports one MySQL or PostgreSQL dialect at a time:

1. Upload the baseline snapshot in **Refresh schema**.
2. In **Current database schema**, choose saved tables, SQL or another snapshot. **Select the complete refresh scope.** Old tables you do not select count as removals.
3. Review table, field, index and relationship changes. Name changes are removals and additions; renames are not inferred.
4. Download the comparison report and refreshed snapshot, or republish an existing project document.

Matched fields keep their identities, business descriptions, logical enums and standard references. Types, defaults, nullability and physical constraints come from the new structure. Existing logical relationships are retained only while both ends exist; omitted relationships are reported. Refresh does not write to the workspace. Keep the output file as the next baseline.

### Extract a structure locally

Install a client matching the source database. Run either command locally after replacing the address, user and database. Use the password prompt or a local credential file. DDLBuilder does not receive database connection credentials.

```sh
mysqldump --host=127.0.0.1 --user=reader --password \
  --no-data --skip-add-drop-table --no-tablespaces \
  --set-gtid-purged=OFF app_database > mysql-structure.sql
```

```sh
pg_dump --host=127.0.0.1 --username=reader --dbname=app_database \
  --schema-only --no-owner --no-privileges --format=plain \
  --file=postgres-structure.sql
```

These produce raw schema dumps, **not files guaranteed to import directly into DDLBuilder**. Check client errors and keep the original. Prepare the tables, indexes and named constraints within the supported input scope above before using strict parsing. Session settings, grants, sequences and triggers need separate handling. Do not remove unsupported constraints and present the result as complete. After every statement parses successfully, export a DDLBuilder snapshot as the baseline.

Include required parent tables when selecting a subset and check dependencies across schemas. See the [mysqldump reference](https://dev.mysql.com/doc/refman/8.4/en/mysqldump.html) and [pg_dump reference](https://www.postgresql.org/docs/current/app-pgdump.html) for client options.

## Fixed change proposals

After you compare structures and confirm column renames in **Schema comparison**, fill in **Reason for change**, sign in, and create a publication. A proposal freezes its before/after structures and rename mapping. Structural revisions require a new proposal; only its title and visibility can change.

Link readers can browse anonymously. Signed-in readers can enter an object location such as `orders.amount` and comment. Each proposal allows up to 200 comments, each up to 4,000 characters. The author can click **Resolve** or **Reopen**. Comments render as text and refer to the fixed proposal version. Resolution does not authorize executing SQL.

Readers can download the report. Generator blockers disable SQL downloads. Revoking link access prevents external reading and commenting.

## Save business test scenarios

Expand **Business test scenarios** under **Relational test data** and select a table, field and rule:

| Rule | Inputs and limits |
| --- | --- |
| NULL percentage | 0 to 100, the probability of NULL in each row; a small sample may differ. Primary keys and NOT NULL fields require 0 |
| Weighted values | One `value=weight` per line, such as `PAID=80` and `PENDING=20`; positive weights, approximate sample proportions |
| Numeric range | Inclusive integer or exact decimal bounds; values must fit the field precision, with a span of at most MAX_SAFE_INTEGER smallest units |
| Date range | Inclusive YYYY-MM-DD bounds, generated in whole days |
| Date offset | Another date field in the same table plus integer days; circular dependencies are rejected |

Click **Add or replace field rule**, then generate. Physical foreign keys and enabled logical relationship fields derive values from parents and cannot be overridden. Insufficient unique values, incompatible types or missing fields prevent export.

Enter a scenario name and save it in the current browser, up to 50 scenarios. Overwriting a name requires confirmation. **Load saved scenarios** restores rules, seed, row counts and the logical relationship option; select the corresponding tables yourself. JSON import/export transfers scenarios between browsers, with a 512 KiB import limit. Configuration changes require regeneration. Arbitrary code and SQL formulas are not supported.

## MySQL to PostgreSQL compatibility report

Open **Migration assessment** and select MySQL tables. Each item shows the original definition, target candidate and next step, classified as **Mapped**, **Manual review** or **Out of scope**. Export the result as Markdown.

Checks cover unsigned ranges, identity columns, decimals, text comparisons, dates/time zones, JSON, enums, defaults, ON UPDATE, indexes, foreign keys and storage options. View queries and unknown types are marked separately. This report does not inspect actual data, application queries or runtime behavior, and does not generate executable cross-database migration scripts.

[Query Design and Modeling](/en/advanced/modeling-workflows)
