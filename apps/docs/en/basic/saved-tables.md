# Saved tables and drafts

This page covers saved tables, folders, trash, drafts, and cloud sync.

## Overview

Use this page when you maintain tables for several projects at once, group tables by business module, or continue editing on more than one device.

---

## Operations walkthrough

### 1. Save and open saved tables
- Click the save icon (tooltip **Save current table**) in the table configuration area and enter a name. The table then appears under **Projects** in the left **Workspace** sidebar.
- Type a name or database type into the sidebar search box to filter the list.
- Click a table in the list to open its fields, indexes, and schema name in a new tab. If the table is already open, DDLBuilder switches to that tab.
- Choose **Rename** in the table's **More actions** menu. If you change an open table and save it again, the saved record is overwritten.

### 2. Folder management
- Click **Create folder** (+) next to the sidebar search box to create folders by business area, such as `Auth` or `Billing`.
- Drag tables into folders, or drag folders to change the hierarchy.

### 3. Trash
- In a table's menu, click **Delete** and confirm **Move to trash**. The table moves to the trash.
- Click **Trash** at the bottom of the sidebar, then choose **Restore** in an item's menu to move the table back to **Projects**.
- Choose **Delete permanently** to remove a single item, or click **Empty Trash** to clear the trash. This cannot be undone.

### 4. Multiple drafts
- Any design that you have not saved as a saved table is kept in the draft box.
- Click **Create draft** in the tab bar to add a draft. The **Drafts** group of the left **Workspace** sidebar lists all drafts. Click one to switch to it. Drafts do not change your saved tables.

### 5. Account sign-in and cloud sync
- **Automatic incremental sync**: after you sign in, drafts, saved tables, folders, and trash sync to the cloud incrementally through Y.Doc.
- **Local-first and offline use**: on a signed-in device, the page opens from the local copy first. You can keep editing offline. Changes are saved locally and sync automatically when the network returns.
- **Sync status**: the header and **Settings > Workspace Sync** both show the current sync status. If sync fails, click **Retry sync**. No manual upload or download is needed.
- **Moving guest data into your account**: after you sign in, if your account workspace is empty and this browser still has data created while signed out, a **Migrate local workspace** prompt appears. Migration never overwrites account content. If the account already has the same item with different content, the local item is saved as a copy with an "(Imported)" suffix. Identical items are skipped. You can also choose **Later**. The guest data stays in this browser after migration.
- **Signing out**: before signing out, DDLBuilder waits for the cloud to confirm your local changes are saved. If it cannot confirm, sign-out is cancelled and local data is kept; restore sync and try again. After a successful sign-out, the account's local workspace copy is removed from this device.

---

## Verification checklist

- [ ] Frequently used tables are saved with names and can be found and opened from the **Workspace** sidebar.
- [ ] Tables are grouped into folders by business area.
- [ ] After you sign in from another browser or device, the same folders and tables appear.
- [ ] A table deleted by mistake can be restored from **Trash**.

## Common issues

- Drafts are for trying things out. Save any version you want to keep as a saved table.
- Without an account, data is stored only in the current browser and is lost if you clear the browser's site data. After you sign in, data syncs to the cloud.
