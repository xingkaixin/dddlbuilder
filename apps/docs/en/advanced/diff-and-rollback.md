# Change diff and rollback

This guide explains how to compare table schema changes in DDLBuilder, generate ALTER and rollback scripts, and view or replay version history.

## When to use

Use these tools when you change columns, types or indexes on an existing table and want the release script and rollback script ready before deployment.

---

## Steps

### 1. View schema differences
1. Load a saved table from **Workspace**.
2. Add or remove columns, change types or adjust indexes in the editor.
3. In the table config area, click **More** and select **View schema changes**.
4. The **Table Structure Diff** dialog lists changes to table config, columns (added, removed, renamed and modified) and indexes.

### 2. Copy the ALTER and rollback scripts
- In the **Change Script** section, click **Copy** to get the ALTER statements for the release.
- Expand **Rollback Script** and click **Copy Rollback**. The rollback script contains the reverse ALTER statements that undo the changes above.

### 3. Version history and rollback
- With a saved table loaded, click **Version history** in the table config area.
- Review each saved version with its save time and change summary.
- Select a version and click **Rollback to this version**. The editor reverts to that version.

### 4. Replay schema changes
- In the **Version History** dialog, click **Play timeline**.
- The player steps through the versions frame by frame, from the initial version to the latest.

---

## Verification checklist

- [ ] The diff includes every change you made, and renamed columns appear as renames.
- [ ] The ALTER script syntax matches your target database version.
- [ ] You have kept the matching rollback script as the fallback plan for the release.
- [ ] You can find past versions in the version history and roll back to them.

## Notes

::: warning Production data compatibility
ALTER and rollback scripts change only the schema definition. If a change shortens a column, casts a type, or adds a NOT NULL column without a default, check how existing rows will migrate before you run it.
:::

- **View schema changes** appears only after you load a saved table and change it. A draft that was never saved has no baseline version, so the entry does not appear.
- Each save over an existing table adds a new version to the history.
