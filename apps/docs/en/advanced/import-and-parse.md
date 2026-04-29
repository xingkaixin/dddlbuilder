# Import and Parse SQL

## Who this is for

For users who already have existing SQL or structured data files and want to evolve from current structures instead of starting from blank input.

## What this solves

You can quickly convert external SQL or structured data files into editable configuration, then continue incremental design and reduce repeated input.

## Prerequisites

- You have identified the correct database type for the source data.
- SQL text or files are accessible and within the system-supported length/size.

## Steps

### SQL Import

1. Click `Import SQL` in the top bar. Result: the import dialog opens and enters the `Validate` step.
2. In `Source Database`, choose the correct database type and paste SQL. Result: the system parses with that dialect.
3. Click `Next` to complete validation. Result: on pass, it enters `Preview`; on failure, it shows error messages and location details.
4. In `Preview`, inspect fields, indexes, and grantees. Adjust field order or remove unnecessary fields if needed. Result: import content is confirmed before final apply.
5. Enter `Confirm` and execute import. Result: parsed results are written into the current workspace; if source SQL includes a schema, the system splits it into `Schema Name` and the bare `Table Name`, then you can continue editing and generate new SQL.

### Batch SQL Import

1. In the import dialog, paste multiple SQL statements (such as multiple CREATE TABLE). Result: the system recognizes all table structures.
2. In preview, check parsing results and conflicts for each table. Result: if duplicate table names or field names exist, the system marks conflicts and provides merge strategy options.
3. Select merge strategy (overwrite, skip, rename) and execute import. Result: multiple SQL statements are applied sequentially according to strategy, greatly reducing batch migration cost.

### CSV / Excel / JSON Schema Import

1. Click `Import Data` at the top and select file type (CSV, Excel, or JSON Schema). Result: the corresponding file selector opens.
2. Upload the file and confirm encoding and delimiter (CSV/Excel). Result: the system parses file content and extracts field names and types.
3. In preview, check auto-recognized field types and manually adjust as needed. Result: type mapping better matches target database conventions.
4. Confirm import. Result: field structure is written into the current workspace; you can continue supplementing indexes, privileges, and foreign key configurations.

## Supported statement and file scope

- SQL: `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, `GRANT`
- CSV: first row as field names, subsequent rows as data; system infers types from data content
- Excel: supports `.xlsx` and `.xls`; automatically recognizes first row as headers
- JSON Schema: supports standard JSON Schema format; fields in `properties` are parsed as table fields

## Done when

- After import, table name, fields, indexes, and grantees appear in the current workspace. If a schema exists, `Schema Name` is also filled correctly.
- DDL and DCL outputs on the right are no longer empty and match expected structure.
- You can continue incremental adjustments based on imported results.

## Common pitfalls and failure handling

- Dialect mismatch: the same SQL may parse differently under different database types. Change `Source Database` first and retry.
- If older SQL stores the object name as `schema.table`, the system will try to split it into `Schema Name + Table Name`. Check the split result after import.
- SQL too long: it fails directly when beyond limits. Split into core table-creation segments before import.
- Parse failure: keep a minimal reproducible segment first, then add statements back piece by piece to locate the problematic part.
- No valid table structure recognized: usually caused by missing key table statements or incomplete syntax. Check the `CREATE TABLE` body first.
- CSV/Excel type inference deviation: auto-inference is based on sampled data; dates and amounts are easily misidentified. Check column by column after import.
- JSON Schema nested complexity: deeply nested objects or array types may not directly map to flat table fields. Simplify schema before import.

## Troubleshooting

- If SQL dialect differences are large, verify database type selection first.
- For complex expressions, minimize statements first, then import incrementally to locate issues.
- When file import fails, check whether file encoding is UTF-8 and whether Excel files are password-protected.
