# View and routine configuration

This page explains how to define a view (`CREATE VIEW`) in DDLBuilder, and how to generate code templates for stored procedures, functions, and triggers.

## When to use

Use it when you need to manage views alongside regular tables, or need starting code for stored procedures, functions, or triggers.

---

## Steps

### 1. Define a view and generate its DDL
1. In the table configuration area, click **Properties** and set **Object Type** to **View**.
2. Enter a **View Name**, for example `v_user_order_summary`.
3. On the **View SQL** tab, enter a SELECT statement in **Query SQL**. To set the column names the view exposes, use `AS` aliases in the SELECT.
4. **CREATE OR REPLACE** is selected by default and generates `CREATE OR REPLACE VIEW` (`CREATE OR ALTER VIEW` on SQL Server). Clear it to generate `CREATE VIEW`. SQLite / D1 always gets `CREATE VIEW`.
5. The **DDL** tab of the generated output shows the `CREATE VIEW ... AS SELECT ...` statement. Click **Copy DDL** to copy it.

### 2. Routine templates (procedures, functions, triggers)
1. Click the **Routines** tab in the generated output. SQLite / D1 does not have this tab.
2. In **Template**, choose what to generate:
   - **Auto Updated Timestamp Trigger** sets the chosen timestamp column to the current time when a row is updated.
   - **Audit Log Trigger** writes a row to the audit table after data changes.
   - **Procedure** takes parameters (such as `IN p_user_id INT`) and a body.
   - **Function** takes parameters, a return type, and a body.
   - **Custom Trigger** takes a trigger table and a body, and generates a `BEFORE INSERT` trigger (`AFTER INSERT` on SQL Server).
3. Click **Copy Routine** to copy the code, then finish the business logic in your database client.

---

## Verification checklist

- [ ] The view DDL follows your target database's syntax.
- [ ] The tables and columns referenced in the view query are correct.
- [ ] The routine code compiles in your database.

## Notes

::: tip Write the business logic yourself
Routine templates generate the statement structure only. You write the body of procedures, functions, and custom triggers for your own business rules.
:::

- If the view query references a table or column that does not exist, running the view DDL fails. Create the tables the view depends on first.
- Stored procedure and trigger syntax differs a lot between Oracle (PL/SQL), PostgreSQL (PL/pgSQL), and SQL Server (T-SQL). Templates follow the current database type, but the body you enter is not converted. Recheck it after you switch the database type.
