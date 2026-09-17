# Data dictionaries, schema comparison, and relational test data

Use **Database tools** in the header to document an existing database, compare two environments, or prepare related test rows. The entry is also available in an empty workspace. Signing in or creating a table first is not required.

## Prepare inputs

The dictionary and test-data tools accept two sources:

- **Saved tables**: use saved versions from the current workspace. Save edits first, then reload and select the tables.
- **SQL**: choose a database, paste SQL or upload a `.sql` / `.txt` file, then parse it. Each input accepts up to 50000 characters.

SQL is sent to the existing parsing service. Parsed tables are temporary and do not modify the workspace. Closing the tools or changing accounts clears temporary input. Keep your downloaded files separately.

These tools use strict parsing. They accept supported `CREATE TABLE`, ordinary `CREATE INDEX`, and `ALTER TABLE ... ADD` statements for primary, unique, and foreign-key constraints. Supply schema snapshots rather than full backups containing `INSERT`, `SET`, `DROP`, or privilege statements.

Processing stops for syntax the model cannot preserve, including CHECK, generated columns, expression or prefix indexes, and inline REFERENCES. Foreign keys and unique constraints need their actual database names, such as `CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES users(id)`. Do not remove real constraints to bypass errors. Use an equivalent supported table-level form or a separate workflow for unsupported structures.

## Data dictionary

1. Open **Data dictionary**, then parse SQL or select saved tables.
2. Enter a document title and search by table, field, or business description.
3. Export Markdown or offline HTML. Search does not change the export selection.

The dictionary includes types, nullability, primary keys, defaults, update policies, comments, logical enums, indexes, physical foreign keys, and logical relationships. Linked field standards include the name, description, and unit from this browser's library. Unavailable standards are marked as missing.

HTML includes a table directory, relationship links, and local search. Open it directly in a browser without network access. References to unselected tables are marked as external to the selection. Relationships use lists and links. Markdown is suitable for repositories and further editing.

## Compare two SQL snapshots

The first version supports **MySQL** or **PostgreSQL** snapshots in the same dialect. It does not convert between databases.

1. Open **Schema comparison** and choose the database.
2. Fill in the current and target schemas. An empty side represents an empty database.
3. Compare the schemas and inspect added, removed, modified, and unchanged tables.
4. Explicitly match removed and added fields that represent a rename. Unmatched fields remain deletions and additions.
5. Export the Markdown report or migration SQL. Editing input clears the previous result.

Tables match by schema and name. The migration removes affected foreign keys, applies table and column changes, then restores foreign keys. Changes requiring manual migration block SQL downloads while keeping the report available.

The SQL covers only the supplied snapshots. Check external dependencies, permissions, existing data, and database versions before execution. Drops delete data. The tools do not connect to databases, execute scripts, or restore database contents.

## Relational test data

The first version supports a group of **MySQL** or **PostgreSQL** tables.

1. Open **Relational test data** and select child tables together with their referenced parents.
2. Set row counts and a fixed seed. Enable logical relationships when you want business relationships included.
3. Generate data and inspect the first five rows of each table.
4. Download complete INSERT SQL or JSON grouped by table.

Parents are generated first. Foreign keys reuse actual generated parent values, and composite references are copied together. Primary and unique keys are checked as column groups. One-to-one relationships also restrict child counts. Identical schemas, counts, and seeds produce identical data.

Scope and limits:

- 1–1000 rows per table, up to 10000 rows and 250000 field values in total.
- Common integers, exact decimals, floating-point numbers, strings, booleans, date/time values, UUID, and JSON are supported. Logical enums participate in generation. Unsupported types produce errors.
- JSON stores bigint and exact decimals as strings to preserve precision. SQL still uses numeric literals.
- Cycles, self-references, missing parents, incompatible reference types, overlapping foreign keys, and exhausted unique values block generation. Adjust the selection, counts, or model and retry.
- Use an empty test database with a matching schema. Existing data is not checked, and PostgreSQL sequences are not advanced. MySQL strings assume the default backslash escape mode.

For single-table generation, see [Mock Data and Logical Enums](/en/advanced/mock-data-and-enum). To compare the current table with its saved version, see [Change Diff and Rollback](/en/advanced/diff-and-rollback).
