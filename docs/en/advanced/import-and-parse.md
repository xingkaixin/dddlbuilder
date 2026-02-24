# Import and Parse SQL

## Who this is for

For users who already have existing SQL and want to evolve from current structures instead of starting from blank input.

## What this solves

You can quickly convert external SQL into editable configuration, then continue incremental design and reduce repeated input.

## Prerequisites

- You have identified the correct database type for the source SQL.
- SQL text is accessible and within the system-supported length.

## Steps

1. Click `Import SQL` in the top bar. Result: the import dialog opens and enters the `Validate` step.
2. In `Source Database`, choose the correct database type and paste SQL. Result: the system parses with that dialect.
3. Click `Next` to complete validation. Result: on pass, it enters `Preview`; on failure, it shows error messages and location details.
4. In `Preview`, inspect fields, indexes, and grantees. Adjust field order or remove unnecessary fields if needed. Result: import content is confirmed before final apply.
5. Enter `Confirm` and execute import. Result: parsed results are written into the current workspace, and you can continue editing and generate new SQL.

## Supported statement scope

- `CREATE TABLE`
- `CREATE INDEX`
- `ALTER TABLE`
- `GRANT`

## Done when

- After import, table name, fields, indexes, and grantees appear in the current workspace.
- DDL and DCL outputs on the right are no longer empty and match expected structure.
- You can continue incremental adjustments based on imported results.

## Common pitfalls and failure handling

- Dialect mismatch: the same SQL may parse differently under different database types. Change `Source Database` first and retry.
- SQL too long: it fails directly when beyond limits. Split into core table-creation segments before import.
- Parse failure: keep a minimal reproducible segment first, then add statements back piece by piece to locate the problematic part.
- No valid table structure recognized: usually caused by missing key table statements or incomplete syntax. Check the `CREATE TABLE` body first.

## Troubleshooting

- If SQL dialect differences are large, verify database type selection first.
- For complex expressions, minimize statements first, then import incrementally to locate issues.
