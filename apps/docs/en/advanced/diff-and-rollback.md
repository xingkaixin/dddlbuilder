# Change Diff and Rollback

This guide explains how to use DDLBuilder's **Visual Schema Diffing**, **Forward ALTER Generation**, **Atomic Rollback DDL**, and **Version Timeline Replay** to manage safe database migrations.

## Overview

Safely iterate on established production tables by reviewing visual schema diffs, generating forward migration scripts, and preparing rollback contingency plans before deployment.

---

## Operations Walkthrough

### 1. Triggering and Inspecting Schema Diffs
1. Load an existing table from the "Saved Tables" drawer.
2. Apply changes in the workspace (add/remove columns, modify data types, or reconfigure indexes).
3. The table header will automatically display the **View Schema Changes** button.
4. Click the button to inspect structured diffs across **Table Options**, **Columns** (with rename detection and attribute diffs), and **Indexes**.

### 2. Exporting ALTER Scripts and Rollback DDL
- **Forward Migration**: Click **Copy ALTER Script** in the diff modal to export DDL for production change tickets.
- **Contingency Rollback**: Expand the rollback section and click **Copy Rollback Script** to obtain reverse DDL that safely undoes all applied changes.

### 3. Version History and Rollback
- Open the "Saved Tables" drawer and click **Version History** from a table card's menu.
- Browse all recorded historical snapshots, timestamps, and modification summaries.
- Select any past version and click **Rollback to This Version** to restore the workspace instantly.

### 4. Schema Evolution Timeline Replay
- In the Version History modal, click **Timeline Replay**.
- The interactive player animates the sequential evolution of the schema from its initial version to the latest snapshot, perfect for architecture demos and team reviews.

---

## Verification Checklist

- [ ] The visual diff accurately reflects all intended changes, including detected renames.
- [ ] The exported ALTER script matches your production database version syntax.
- [ ] A matching rollback script is archived for change management safety.
- [ ] Past versions can be audited and restored from the history drawer.

## Tips and Common Traps

::: warning Production Data Compatibility
Generated ALTER and rollback scripts operate on structural DDL. If your changes introduce non-null columns without defaults or truncate data types, evaluate existing row data compatibility before execution.
:::

- **Diff Button Visibility**: The diff button only appears when an established Saved Table is modified. Scratchpad drafts have no baseline and will not trigger diffing.
- **Snapshot Retention**: Saving updates appends a new snapshot to the history ledger. Create named tables at major feature milestones to preserve clear audit trails.
