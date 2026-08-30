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
- **Local-First & Offline Resilience**: Signed-in sessions load instant local cache copies on startup, ensuring that network fluctuations never stall your modeling flow.
- **Sync Settings Hub**: Visit "Settings > Workspace Sync" to monitor status, trigger an immediate push/pull ("Sync Now"), or inspect conflict details when concurrent edits occur.
- **Manual Backup and Overwrite**: Use "Sync to Cloud" (push entire local workspace to cloud) or "Download from Cloud" (overwrite local state from cloud) as explicit disaster recovery mechanisms.
- **First-Time Migration**: When logging in on a browser containing guest data, an onboarding prompt assists in promoting local tables to your account without overwriting existing cloud assets.

---

## Verification Checklist

- [ ] Core schemas are named, saved, and easily retrievable from the drawer.
- [ ] Related tables are categorized into logical domain folders.
- [ ] Logging into another machine or browser faithfully restores all folders, drafts, and tables.
- [ ] Deleted tables can be promptly located and restored from the Trash bin.

## Tips and Common Traps

::: warning Manual Full Overwrites
"Sync to Cloud" and "Download from Cloud" perform full workspace overwrites. Verify which side holds the definitive dataset before proceeding. Routine editing is reliably handled by automatic incremental sync.
:::

- **Drafts vs. Saved Tables**: Drafts are scratchpads. Always save milestones explicitly as named tables.
- **Guest Data Storage**: Guest sessions store data strictly within browser local storage. Clearing browser cache will wipe guest data; sign in to safeguard work in the cloud.
