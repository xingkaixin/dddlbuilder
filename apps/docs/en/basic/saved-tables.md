# Saved Tables and Draft box

## Who this is for

For users who maintain multiple tables long term, switch plans repeatedly, and organize schemas by project.

## What this solves

You can manage temporary designs and formally saved versions separately, and organize many tables quickly with folders.

## Steps

1. In the Table Config area, click save and enter a name. Result: the current table is added to "Saved Tables" and can be loaded repeatedly; if the table uses `Schema Name`, it is saved together with the rest of the table config.
2. Click `Saved Tables` to open the side drawer, then search by name or database type. Result: you can locate target tables quickly.
3. Select a saved table and load it into the workspace. Result: the current editing area switches to that table and shows loaded status; `Schema Name`, table name, fields, and indexes are restored together.
4. For cleanup or naming consistency, run `Rename` or `Delete` from the list. Result: naming becomes cleaner and redundant history can be reduced in time.
5. Use `Create folder`, drag table items, and drag folders to organize structure. Result: tables in the same business domain can be grouped and the list becomes clearer.
6. To return to temporary work, switch to `Draft box`. Result: you can continue unnamed drafts without affecting saved tables; draft `Schema Name` is also preserved with the workspace.
7. After signing in, folder structure syncs automatically along with saved tables. Result: when you sign in on another device, your saved tables and folder groupings are restored automatically without manual rebuilding.
8. When you need to manually back up or restore, click your profile in the header and open `Settings`, then go to the `Workspace Sync` tab. Result: you can upload the full workspace from this device to the cloud, or download from the cloud to overwrite the current device; both actions require confirmation to avoid accidental overwrite.
9. When signing in for the first time, if anonymous local data exists in the browser, a migration prompt appears. Result: after starting the migration, saved tables, drafts, and folders from the anonymous workspace are bound to your account; if there are naming conflicts, the system automatically saves copies without overwriting existing cloud content.

## Done when

- Frequently used tables are saved with names and can be loaded from the list reliably.
- Folder hierarchy is organized by project or business domain.
- After switching between Draft box and saved tables, workspace state matches expectation.
- If the table uses a schema, the combination of `Schema Name` and table name remains consistent after reload.
- After signing in, folders and saved tables stay consistent across devices.

## Common pitfalls

- For a loaded but unmodified table, the save button may be disabled. This prevents meaningless overwrite.
- If older data used `schema.table` inside the table name itself, the system will split it into `Schema Name` and bare table name when loading. Spot-check once after load.
- Deleting a table cannot be undone. Confirm replacement versions first.
- If you mistake a draft for a saved table, the named record may look missing after refresh. Manually save at key milestones.
- Without signing in, folders and saved tables are kept only in the current browser's local storage. They cannot be recovered after switching devices or clearing browser data. Sign in first if you want cross-device access.
