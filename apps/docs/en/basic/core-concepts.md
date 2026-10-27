# Core concepts

This page explains the workspace, draft box, saved tables, read-only sharing, output types, account sync, and AI credits in DDLBuilder.

## How the concepts relate

```mermaid
graph TD
    Workspace[Workspace] --> Tabs[Tabs]
    Workspace --> Drafts[Drafts]
    Workspace --> SavedTables[Saved Tables]
    SavedTables --> Folders[Folders]
    SavedTables --> Trash[Trash]
    
    Tabs --> Output[Outputs]
    Output --> DDL[DDL Table / Index / Partitioning]
    Output --> DCL[DCL Privileges]
    Output --> ORM[ORM Models]
    Output --> Routine[Views & Routines]
    
    Workspace -. Cloud sync Y.Doc .-> Account[User Account & Cloud Storage]
    Tabs -. Generate Share Link .-> Share[Read-only Share Link]
    Share -. Save as copy .-> Workspace
```

---

## Concepts

### 1. Workspace and tabs
- The workspace holds your drafts, saved tables, and folders.
- You can open different tables in separate tabs of the same workspace. Switching tabs keeps each tab's edits.
- Closing a tab does not ask for confirmation. Current edits are saved as a draft automatically and do not overwrite the saved table.

### 2. Draft box
- Any design that you have not saved as a saved table is in the draft box.
- Click **Create draft** in the tab bar to create more drafts. They are listed in the **Drafts** group of the left **Workspace** sidebar. Use drafts to try different designs without changing your saved tables.

### 3. Saved tables, folders, and trash
- After you click save and enter a name, the table becomes a saved table. It appears under **Projects** in the left **Workspace** sidebar, where you can search for it and open it.
- Folders can be nested. Drag tables or folders to reorganize them.
- A deleted table goes to **Trash** first and stays there until you restore it or delete it permanently.

### 4. Read-only sharing and saving a copy
- The link created by **Share** at the top is read-only. People who open it cannot change your design.
- The recipient can click **Save as copy and edit** in the banner to save the table structure into their own workspace and edit it there.

### 5. Output types (DDL / DCL / ORM / routines)
- **DDL (Data Definition Language)**: generates a `CREATE TABLE` statement with the primary key, field constraints, comments, indexes, and partitioning.
- **DCL (Data Control Language)**: generates a `GRANT SELECT` statement for each grantee.
- **ORM models**: converts the table structure into Prisma, TypeORM, SQLAlchemy, GORM, or JPA models.
- **Views and routines**: outputs `CREATE VIEW` statements and skeleton code for stored procedures, functions, and triggers.

### 6. User accounts and cloud sync
- After you sign in, the workspace is bound to your account and syncs through CRDT (Yjs Y.Doc).
- Drafts, saved tables, folders, and trash sync incrementally in the background. Sign in to the same account on another device to keep editing.
- Sync needs no manual action. Edits are saved to a local copy first. You can keep editing offline, and changes sync automatically when the network returns.
- **Settings > Workspace Sync** shows the current sync status. If sync fails, click **Retry sync**.

### 7. AI features and credits
- AI features include **AI Table Workshop**, **AI Edit**, **AI Index Advisor**, **AI Review**, **AI SQL Explainer**, and **AI Comments**.
- AI features deduct credits based on actual token usage. After you sign in, click your avatar in the upper-right corner, choose **Settings**, and open **Credits** to see your balance and usage history.

---

## Quick answers

| Question | Answer |
|---|---|
| Where are my changes saved? | Unsaved changes are in the draft box. After you click the save icon, the table becomes a saved table. |
| Can other people edit a shared link? | No. The recipient must click **Save as copy and edit** first, and then edits their own copy. |
| How does multi-device sync work? | Sign in to the same account. Changes sync automatically, with no manual upload or download. |
| Will I lose data if I switch computers? | Without an account, data is stored only in the current browser and is lost if you clear browser data. After you sign in, data syncs to the cloud, and you see it when you sign in on the new computer. |
| Can I recover a deleted table? | Yes. Deleted tables are in **Trash**. You can **Restore** them until they are deleted permanently. |
