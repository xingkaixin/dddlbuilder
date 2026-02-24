# Quick Start

## Who this is for

For first-time DDLBuilder users who want to quickly finish one table creation statement and copy it for use.

## What this solves

You do not need to handwrite SQL from scratch. With page-based configuration, you can get usable table DDL and privilege DCL in minutes.

## Steps

1. In the Table Config area, select the database type and fill in the table name and table comment. Result: the system locks the target database syntax and initializes the current table object.
2. In "Fields", fill in field name, field type, nullable, and default kind. Result: "Table DDL" on the right starts generating readable SQL in real time.
3. Switch to "Indexes", "Privileges", and "Misc" as needed to complete additional settings. Result: DDL and DCL update automatically with your configuration.
4. In the output area on the right, click "Copy DDL" or "Copy DCL". Result: statements are copied to your clipboard and can be sent directly for review or execution.
5. If you need long-term retention, click the save button next to the table name and provide a name. Result: the table is added to "Saved Tables" and can be loaded anytime later.

## Done when

- A complete `CREATE TABLE` statement appears in "Table DDL" on the right.
- You see the "Copied" feedback after clicking copy.
- You can see the newly saved table in "Saved Tables".

## Common pitfalls

- If the database type is wrong, generated statements will not match your target database. Fix the database type before continuing.
- If you configure fields but no grantees, "Privilege DCL" may be empty. This is expected.
- If you close the page without saving, drafts are still auto-preserved, but it is recommended to manually save a named table at key points.
