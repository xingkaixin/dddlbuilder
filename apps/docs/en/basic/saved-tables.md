# Saved Tables and Drafts

This guide covers managing saved table snapshots, folder structures, the soft-delete trash bin, multiple named drafts, and cross-device real-time cloud synchronization.

## Overview

Manage multi-project schemas over long lifecycles, organize domain tables into structured folders, and switch between design variations across multiple workstations without risk of data loss.

---

## Operations Walkthrough

### 1. Saving and Loading Named Tables
- **Save Table**: Click the Save icon next to the table name and assign a title to record a named snapshot in "Saved Tables".
- **Search and Filter**: Open the "Saved Tables" drawer to filter tables by name, display label, or database dialect.
- **Load to Workspace**: Click any table card to load its columns, indexes, comments, and schema names into your active tab.
- **Rename and Update**: Rename tables via the card menu. Editing a loaded table enables the Save button to update the existing record.

### 2. Folder Hierarchy Management
- **Create Folders**: Click "New Folder" in the drawer to establish domain directories (e.g., `Auth Module`, `Billing Engine`).
- **Drag-and-Drop Organization**: Drag tables into folders or reorder folder hierarchies to maintain a clean workspace layout.

### 3. Soft-Delete and Trash Recovery
- **Safe Removal**: Selecting "Delete" moves a table to the **Trash bin** rather than destroying it immediately.
- **Restore**: Navigate to the Trash tab and click "Restore" to reinstate any accidentally removed table.
- **Purge**: Click "Empty Trash" to permanently remove all discarded schemas.

### 4. Multiple Parallel Drafts
- Temporary, unsaved tables remain safely inside **Drafts**.
- Use the workspace sidebar to create and toggle between **multiple named drafts**, letting you iterate on alternate models without polluting formal table repositories.

### 5. Account Sign-In & Real-Time Cloud Synchronization
- **Automatic Incremental Sync**: Signing in binds your workspace to your account, continuously synchronizing drafts, saved tables, folders, and trash state in the background via Y.Doc.
- **Local-First & Offline Use**: On a signed-in device, the page opens from the local copy first. You can keep editing offline; changes are saved locally and sync automatically when the network returns.
- **Sync Status**: The header and "Settings > Workspace Sync" both show the current sync status. If sync fails, click "Retry sync". No manual upload or download is needed.
- **Moving Guest Data into Your Account**: After you sign in, if your account workspace is empty and this browser still has data created while signed out, a "Migrate local workspace" prompt appears. Migration never overwrites account content: if the account already has the same item with different content, the local item is saved as a copy with an "(Imported)" suffix; identical items are skipped. You can also choose "Later". The guest data stays in this browser after migration.
- **Signing Out**: Before signing out, DDLBuilder waits for the cloud to confirm your local changes are saved. If it cannot confirm, sign-out is cancelled and local data is kept; restore sync and try again. After a successful sign-out, the account's local workspace copy is removed from this device.

---

## Verification Checklist

- [ ] Core schemas are named, saved, and easily retrievable from the drawer.
- [ ] Related tables are categorized into logical domain folders.
- [ ] Logging into another machine or browser faithfully restores all folders, drafts, and tables.
- [ ] Deleted tables can be promptly located and restored from the Trash bin.

## Tips and Common Traps

- **Drafts vs. Saved Tables**: Drafts are scratchpads. Always save milestones explicitly as named tables.
- **Guest Data Storage**: Guest sessions store data strictly within browser local storage. Clearing browser cache will wipe guest data; sign in to safeguard work in the cloud.
