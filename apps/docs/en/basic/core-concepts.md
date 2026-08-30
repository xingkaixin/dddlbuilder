# Core Concepts

A thorough understanding of DDLBuilder's foundational architecture helps you navigate complex data modeling, team collaboration, and cross-device workflows with confidence.

## Conceptual Architecture

```mermaid
graph TD
    Workspace[Workspace] --> Tabs[Multi-tab Management]
    Workspace --> Drafts[Named Drafts]
    Workspace --> SavedTables[Saved Tables]
    SavedTables --> Folders[Folder Categories]
    SavedTables --> Trash[Trash Bin]
    
    Tabs --> Output[Artifact Outputs]
    Output --> DDL[DDL Table / Index / Partitioning]
    Output --> DCL[DCL Privilege Control]
    Output --> ORM[ORM Models]
    Output --> Routine[Views & Routine Skeletons]
    
    Workspace -. Real-time Sync Y.Doc .-> Account[User Account & Cloud Storage]
    Tabs -. Generate Share Link .-> Share[Read-only Share Link]
    Share -. Fork as Copy .-> Workspace
```

---

## Detailed Concepts

### 1. Workspace & Multi-Tab Editing
- **Workspace**: The top-level container for your active session, holding all active table designs, drafts, and configuration state.
- **Multiple Tabs**: Work on several independent tables concurrently within the same workspace. Switching tabs maintains local state without cross-table interference.
- Closing a tab with uncommitted changes triggers a confirmation prompt to prevent accidental data loss.

### 2. Drafts
- Unsaved temporary table designs live in the **Drafts** section by default.
- The workspace sidebar lets you create and manage **multiple named drafts**, enabling you to experiment with alternate schema designs without mutating your established tables.

### 3. Saved Tables, Folders, and Trash
- **Saved Tables**: Named, versioned snapshots that can be searched and loaded from the sidebar drawer at any time.
- **Folders**: Organize tables by domain, business module, or project using intuitive drag-and-drop management.
- **Soft Deletes & Trash**: Deleted tables are moved to the Trash bin and retained for a recovery period, allowing single-click restoration before permanent deletion.

### 4. Read-Only Sharing & Forking Copies
- URLs generated via the **Share Link** button are **strictly read-only**, protecting your original schema from external modification.
- Recipients can click **Save as Copy and Start Editing** in the banner to branch the shared schema into their personal workspace as an editable copy.

### 5. Multi-Paradigm Artifact Outputs (DDL / DCL / ORM / Routine)
- **DDL (Data Definition Language)**: Generates complete `CREATE TABLE` scripts with columns, constraints, indexes, and partitioning clauses.
- **DCL (Data Control Language)**: Generates corresponding `GRANT` statements so privilege provisioning never lags behind schema rollout.
- **ORM Models**: Maps table schemas into typed models for Prisma, TypeORM, SQLAlchemy, GORM, and JPA.
- **Views and Routines**: Provides DDL for `CREATE VIEW` and structural code skeletons for stored procedures, functions, and triggers.

### 6. User Accounts & Real-Time CRDT Cloud Sync
- Signing in binds your workspace to your account using **CRDT (Yjs Y.Doc)** for state synchronization.
- Drafts, saved tables, folder hierarchies, and trash entries sync **incrementally and automatically in the background** across devices.
- The Settings page provides manual tools ("Sync Now", "Sync to Cloud", "Download from Cloud") along with detailed conflict inspection if concurrent multi-device edits diverge.

### 7. AI Credits & Intelligent Capabilities
- DDLBuilder incorporates a complete AI suite: Master Workshop, AI Modify, AI Index Advisor, DDL Reviewer, SQL Explanations, and Smart Comments.
- AI operations consume credits proportional to actual Token consumption. Check your balance and ledger anytime in your user profile or the Settings panel.

---

## Quick Reference Summary

| Question / Scenario | Key Takeaway |
|---|---|
| **Where are changes saved?** | Temporary edits remain in Drafts; click the Save icon to create a named Saved Table. |
| **Can viewers edit a shared link?** | No. Shared links are read-only. Viewers must fork a copy to make edits. |
| **How does multi-device sync work?** | Sign into your account for automatic incremental background sync, or use the Settings page for manual backups. |
| **Will data be lost if I switch machines?** | Guest data is stored locally in the browser. Sign in to guarantee secure cloud persistence. |
| **Can deleted tables be recovered?** | Yes. Deleted tables move to the Trash bin and can be restored before clearing the trash. |
