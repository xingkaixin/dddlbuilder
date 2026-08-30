# View and Routine Configuration

This guide details how to define database **Views (`CREATE VIEW`)** and generate structured skeleton code for **Stored Procedures**, **Functions**, and **Triggers**.

## Overview

Manage view abstractions alongside physical table definitions, and standardize backend procedural logic with scaffolded routine templates.

---

## Operations Walkthrough

### 1. View Definition and DDL Generation
1. Locate the **View Definition** panel in the configuration area.
2. Provide a **View Name** (e.g., `v_user_order_summary`) and a standard **SELECT Query Statement**.
3. Use explicit `AS` aliases in the SELECT query to define clear outward column names.
4. Switch to the **View/Routine** tab in the right-hand output panel to review the dialect-specific `CREATE VIEW ... AS SELECT ...` DDL.
5. Click **Copy View DDL** to copy the statement to your clipboard.

### 2. Routine Template Scaffolding (Procedures / Functions / Triggers)
1. Select the **Routine Templates** tool in the Misc settings or dedicated panel.
2. Choose your target routine object:
   - **Stored Procedure**: Generates boilerplate with parameter lists (`IN` / `OUT`) and transaction blocks.
   - **Function**: Scaffolds deterministic or scalar return signatures and body blocks.
   - **Trigger**: Configures execution timing (`BEFORE` / `AFTER`) and events (`INSERT` / `UPDATE` / `DELETE`), producing compliant trigger headers.
3. Switch to the **Routine** tab in the output panel, click **Copy Routine**, and populate your core business calculations in your database IDE.

---

## Verification Checklist

- [ ] View DDL complies with your target database dialect syntax.
- [ ] Referenced tables and columns in the view query exist in the target schema.
- [ ] Routine skeleton code compiles without syntax errors in the database client.

## Tips and Common Traps

::: tip Populating Routine Logic
Routine generators output structural skeletons and signature envelopes; procedural branches and transactional statements should be tailored to your application logic.
:::

- **View Dependency Order**: Ensure underlying physical tables are created before applying view DDL scripts in deployment pipelines.
- **Dialect Discrepancies**: Procedural languages vary significantly across Oracle (PL/SQL), PostgreSQL (PL/pgSQL), and SQL Server (T-SQL). Always review syntax when switching dialects.
