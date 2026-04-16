# Core Concepts

## Who this is for

For users who can already click through the UI but are not fully clear about "Draft box", "Saved Tables", "Shared copy", and "DDL/DCL".

## What this solves

After understanding these concepts, you can tell where current changes are stored, whether others can edit shared content, and which SQL block should be copied.

## Steps

1. Confirm the "workspace" concept first: your full current configuration is in one workspace. Result: you know all current inputs belong to the same table being designed.
2. Understand "Draft box": if no specific saved table is loaded, you are in Draft box. Result: temporary designs go to Draft box by default and do not overwrite saved tables.
3. Understand "Saved Tables": after manual save, you get a named snapshot that can be loaded repeatedly. Result: you can manage stable versions and temporary drafts separately.
4. Understand "Shared copy (read-only)": pages opened by share links are not directly editable by default. Result: you know you must click "Save as copy and edit" before making changes.
5. Understand "DDL / DCL": DDL is table creation SQL, and DCL is privilege SQL. Result: you can copy the correct output by scenario and avoid mixing them.

## Done when

- You can clearly tell whether you are in Draft box or a saved table.
- You know shared pages cannot be edited directly and must be converted to a copy first.
- You know structure changes are in DDL, while privilege grants are in DCL.

## Common pitfalls

- Mistaking "Draft box auto-save" for "Saved Tables" can make named versions appear missing later.
- Editing directly in a shared page has no effect because the shared view is read-only.
- Looking only at DDL and not DCL can cause missed privilege grants.
