# View and Routine Configuration

## Who this is for

For users who need to generate view DDL or stored procedure, function, and trigger skeleton code in addition to table creation statements.

## What this solves

You can complete table, view, and routine skeleton design in the same tool, reducing the cost of switching between multiple tools.

## Prerequisites

- The view query or routine type to be created is already identified.
- The current database type supports the corresponding syntax (most databases support views; routine support varies by database).

## Steps

### View Configuration

1. Find the `View Definition` panel in the table configuration area (usually below table config or in an independent tab). Result: the view editor opens.
2. Fill in `View Name` and the `SELECT` query. Result: the system saves the view definition.
3. For field aliases, explicitly use `AS` in the SELECT. Result: aliases appear in the generated `CREATE VIEW` column list.
4. Switch to the `View` tab in the right output area. Result: the system generates the corresponding database's `CREATE VIEW` statement.
5. Click `Copy View DDL`. Result: the statement is copied to clipboard.

### Routine Templates

1. Find `Routine Templates` in the table configuration area or `Misc Settings`. Result: the template selector opens.
2. Select the type: `Stored Procedure`, `Function`, or `Trigger`. Result: the system loads the corresponding skeleton template.
3. Adjust parameter names, return types, or trigger timing in the template as needed. Result: template personalization is complete.
4. Switch to the `Routine` tab in the right output area. Result: the system generates a complete `CREATE PROCEDURE` / `CREATE FUNCTION` / `CREATE TRIGGER` skeleton.
5. Click `Copy Routine`. Result: code is copied to clipboard, ready to continue filling business logic in the database client.

## Done when

- View DDL or Routine code has been successfully copied.
- Syntax matches the target database dialect.
- The view query can execute correctly on the target database (secondary verification in database client is recommended).

## Common pitfalls

- If the SELECT query in a view references non-existent tables or fields, the generated DDL is syntactically correct but will fail on execution.
- Trigger `BEFORE` / `AFTER` combined with `INSERT` / `UPDATE` / `DELETE` must match the target database's supported range.
- Routine templates only generate skeleton code; business logic requires manual supplementation.
- Routine syntax varies greatly across databases (e.g., Oracle PL/SQL vs SQL Server T-SQL); recheck generated results after switching database types.
