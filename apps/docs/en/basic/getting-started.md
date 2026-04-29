# Quick Start

## Who this is for

For first-time DDLBuilder users who want to quickly finish one table creation statement and copy it for use.

## What this solves

You do not need to handwrite SQL from scratch. With page-based configuration, you can get usable table DDL, privilege DCL, ORM model code, and view/routine skeletons in minutes.

## Steps

1. In the Table Config area, select the database type and fill in `Schema Name` when needed, together with table name and table comment. Result: the system locks the target database syntax and initializes the current table object; if `Schema Name` is filled, subsequent SQL uses the qualified `schema.table` name.
2. In "Fields", fill in field name, field type, nullable, and default kind. Result: "Table DDL" on the right starts generating readable SQL in real time.
3. Switch to "Indexes", "Privileges", "Foreign Keys", and "Misc" as needed to complete additional settings. Result: DDL, DCL, and foreign key statements update automatically with your configuration.
4. When you need a quick start, click "Table Blueprint" at the top to select a common business template (e.g., user, order, log), apply it, then adjust as needed. Result: From blank to usable structure takes only seconds.
5. When importing existing structures, click "Import SQL" or "Import Data" at the top, supporting SQL, CSV, Excel, and JSON Schema sources. Result: The system automatically parses fields and types and fills them into the workspace.
6. In the output area on the right, click "Copy DDL" or "Copy DCL"; you can also switch to "ORM" to generate Prisma, TypeORM, and other model codes, or switch to "View/Routine" to generate corresponding skeletons. Result: The required code is copied to clipboard, ready for review or execution.
7. If you need long-term retention, click the save button next to the table name and provide a name. Result: the table is added to "Saved Tables" and can be loaded anytime later; the same workspace can have multiple tabs, each managing an independent table.

## Done when

- A complete `CREATE TABLE` statement appears in the right output area.
- If `Schema Name` is filled, DDL / DCL already uses the schema-qualified table name.
- You see the "Copied" feedback after clicking copy.
- You can see the newly saved table in "Saved Tables".
- If a blueprint template was used, the template fields have been successfully applied and can be further adjusted.

## Common pitfalls

- If the database type is wrong, generated statements will not match your target database. Fix the database type before continuing.
- `Schema Name` is optional. Keep the table input for the bare table name only, and do not paste `schema.table` into the table name field.
- If you configure fields but no grantees, "Privilege DCL" may be empty. This is expected.
- If you close a tab without saving, drafts are still auto-preserved, but it is recommended to manually save a named table at key points.
- For cross-device use or to protect against data loss, sign up and sign in via the top-right account menu. After signing in, you can sync your workspace to the cloud from Settings.
- In multi-tab mode, switching tabs with unsaved changes will prompt you to save, preventing accidental loss.
