# Saved Tables and Draft box

## Who this is for

For users who maintain multiple tables long term, switch plans repeatedly, and organize schemas by project.

## What this solves

You can manage temporary designs and formally saved versions separately, reduce accidental operation risks through folders and trash, and explore different schemes in parallel via multiple drafts.

## Steps

1. In the Table Config area, click save and enter a name. Result: the current table is added to "Saved Tables" and can be loaded repeatedly; if the table uses `Schema Name`, it is saved together with the rest of the table config.
2. Click `Saved Tables` to open the side drawer, then search by name or database type. Result: you can locate target tables quickly.
3. Select a saved table and load it into the workspace. Result: the current editing area switches to that table and shows loaded status; `Schema Name`, table name, fields, and indexes are restored together.
4. For renaming, run `Rename` from the list. Result: naming becomes cleaner.
5. For cleanup, run `Delete` from the list. Result: the table moves to trash instead of disappearing immediately; if deleted by mistake, click `Restore` from trash.
6. For thorough cleanup, enter trash and execute `Empty Trash`. Result: tables in trash are permanently deleted and cannot be recovered; please confirm before proceeding.
7. Use `Create folder`, drag table items, and drag folders to organize structure. Result: tables in the same business domain can be grouped and the list becomes clearer.
8. To return to temporary work, switch to `Draft box` or a draft in the left workspace sidebar. Result: you can continue unnamed drafts without affecting saved tables; draft `Schema Name` is also preserved with the workspace. Multiple drafts can coexist and be quickly switched via the sidebar.
9. After signing in, folder structure, trash state, and drafts sync incrementally with saved tables. Result: when you sign in on another device, saved tables, folder groupings, trash, and drafts are restored automatically.
10. When you need to check sync status, click your profile in the header, open `Settings`, go to the `Workspace Sync` tab, and click `Sync now`. Result: the system pulls cloud changes, pushes local pending changes, and refreshes local sync state; if conflicts appear, Settings shows the pending count and conflict details.
11. When you need to manually back up or restore, use `Upload to cloud` or `Download from cloud` in the `Workspace Sync` tab. Result: you can upload the full workspace (saved tables, drafts, folders, and trash) from this device to the cloud, or download from the cloud to overwrite the current device; both actions require confirmation to avoid accidental overwrite.
12. When signing in for the first time, if anonymous local data exists in the browser, a migration prompt appears. Result: after starting the migration, saved tables, drafts, and folders from the anonymous workspace are bound to your account; if there are naming conflicts, the system automatically saves copies without overwriting existing cloud content.

## Local copies and cloud sync

After opening an account workspace in the same browser, refreshing restores its local copy first. Authentication checks and cloud sync run in the background, so you can continue without waiting for cloud content.

- Local content remains readable and editable when the network or authentication endpoint is temporarily unavailable. If your session has expired, sign back into the original account to resume cloud sync. Switching accounts does not transfer the previous account's content.
- A new device that has not downloaded cloud content shows “Initial sync is not complete.” This does not mean the cloud workspace is empty. Stay signed in and connected; you can also create content locally and let it merge later.
- Signing out pauses editing on the current page while waiting for cloud confirmation. If confirmation fails, sign-out is cancelled and local data is retained. Restore sync and try again. Successful sign-out removes the account's local copy.
- “Local copy opened” does not mean “Cloud synced.” Do not clear browser data before synchronization completes.

These behaviors require the page to load and browser storage to be available. Reopening or refreshing the entire site without a network connection is not currently guaranteed.

## Done when

- Frequently used tables are saved with names and can be loaded from the list reliably.
- Folder hierarchy is organized by project or business domain.
- After switching between Draft box and saved tables, workspace state matches expectation.
- If the table uses a schema, the combination of `Schema Name` and table name remains consistent after reload.
- After signing in, folders, drafts, and saved tables stay consistent across devices; `Sync now` in Settings refreshes sync state.
- Deleted tables can be found in trash and restored as needed.

## Common pitfalls

- For a loaded but unmodified table, the save button may be disabled. This prevents meaningless overwrite.
- If older data used `schema.table` inside the table name itself, the system will split it into `Schema Name` and bare table name when loading. Spot-check once after load.
- Deleted tables default to trash, not permanent deletion; only emptying trash makes them unrecoverable.
- If you mistake a draft for a saved table, the named record may look missing after refresh. Manually save at key milestones.
- Without signing in, folders, drafts, and saved tables are kept only in the current browser's local storage. They cannot be recovered after switching devices or clearing browser data. Sign in first if you want cross-device access.
- In multi-tab mode, loading a new table while the current tab has unsaved changes will prompt to save, preventing accidental loss.
- Manual `Upload to cloud` and `Download from cloud` overwrite the full workspace in the selected direction, so confirm which version is the target before running them.
