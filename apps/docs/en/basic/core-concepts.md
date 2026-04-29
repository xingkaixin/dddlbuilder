# Core Concepts

## Who this is for

For users who can already click through the UI but are not fully clear about "Draft box", "Saved Tables", "Shared copy", "DDL/DCL", and the new multi-tab workspace.

## What this solves

After understanding these concepts, you can tell where current changes are stored, whether others can edit shared content, which SQL block should be copied, and how the multi-tab workspace operates.

## Steps

1. Confirm the "workspace" concept first: your full current configuration is in one workspace, which supports multiple tabs; each tab independently manages one table. Result: you know all current inputs within a tab belong to that tab's table design, and switching tabs does not affect each other.
2. Understand "Draft box": if no specific saved table is loaded, you are in Draft box; the draft box supports multiple named drafts managed through the left workspace sidebar. Result: temporary designs go to Draft box by default and do not overwrite saved tables; multiple drafts can coexist and be switched as needed.
3. Understand "Saved Tables": after manual save, you get a named snapshot that can be loaded repeatedly; saved tables support soft deletion, moving to trash after deletion, with options to restore or permanently empty. Result: you can manage stable versions and temporary drafts separately, with a recovery window for accidental deletions.
4. Understand "Shared copy (read-only)": pages opened by share links are not directly editable by default. Result: you know you must click "Save as copy and edit" before making changes.
5. Understand "DDL / DCL": DDL is table creation SQL, and DCL is privilege SQL. Result: you can copy the correct output by scenario and avoid mixing them.
6. Understand "ORM / View / Routine": ORM is model code generated for the target framework; View is the CREATE VIEW statement; Routine is skeleton code for stored procedures, functions, and triggers. Result: you can select the output type based on delivery target.
7. Understand "User account and cloud sync": after signing in, data is bound to your account. You can manually upload or download workspace snapshots via Settings to recover across devices. Result: you know to sign in first when switching devices, then run a sync or wait for the migration prompt.
8. Understand "AI credits": AI table generation, DDL review, SQL explanation, and AI comment generation consume credits based on actual token usage. Result: you know you need sufficient credits to continue using AI features, and anonymous users must sign in first to use AI.
9. Understand "Trash": deleted saved tables do not disappear immediately but enter the trash for a retention period. Result: accidentally deleted tables can be recovered from trash; bulk emptying trash should be confirmed first.

## Done when

- You can clearly tell whether you are in Draft box or a saved table.
- You know tables in multi-tab mode are independent, and switching tabs won't lose unsaved content (but closing tabs will prompt).
- You know shared pages cannot be edited directly and must be converted to a copy first.
- You know structure changes are in DDL, privilege grants are in DCL, and business models look at ORM.
- You know you can sync your workspace to the cloud via Settings after signing in.
- You know AI features require credits and are unavailable without signing in.
- You know deleted saved tables can be recovered from trash.

## Common pitfalls

- Mistaking "Draft box auto-save" for "Saved Tables" can make named versions appear missing later.
- Editing directly in a shared page has no effect because the shared view is read-only.
- Looking only at DDL and not DCL can cause missed privilege grants.
- AI features prompt you to sign in when anonymous, and are restricted when credits are insufficient after signing in.
- Without signing in, clearing browser data will erase local drafts and saved tables. Important data should be synced to the cloud after signing in.
- Closing a tab with unsaved changes without saving will lose those changes (draft auto-save only applies to the currently active tab).
