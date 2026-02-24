# Feature Entry and Visibility

## Why the "Partitioning" tab is not visible

### Symptoms

On the editor page, you only see "Fields, Indexes, Privileges, Misc", but not "Partitioning".

### Quick checks

Whether current database type is MySQL, MariaDB, or TiDB.

### Steps

1. Check current database type in Table Config. Result: current dialect is confirmed.
2. Switch database type to MySQL, MariaDB, or TiDB. Result: the "Partitioning" tab appears.

### If still unresolved

Refresh the page, switch database type again, and recheck.

## Why the "Sharding" tab is not visible

### Symptoms

The page does not show the "Sharding" tab.

### Quick checks

Whether current database type is PostgreSQL (Citus).

### Steps

1. Open database type selector and switch to PostgreSQL (Citus). Result: the "Sharding" tab appears.
2. Complete fields in "Fields" first, then open sharding configuration. Result: available distribution columns can be selected.

### If still unresolved

Confirm you selected PostgreSQL (Citus), not regular PostgreSQL.

## Why "View schema changes" does not appear

### Symptoms

You already edited fields, but the "View schema changes" button is missing.

### Quick checks

- Whether a `Saved Table` is currently loaded.
- Whether there is an actual difference from the loaded version.

### Steps

1. Load a saved table from `Saved Tables` first. Result: the system has a comparison baseline.
2. Make observable changes (such as adding fields, changing field types, or modifying indexes). Result: structural differences are created.
3. Return to the table configuration area and check the button. Result: "View schema changes" appears when conditions are met.

### If still unresolved

Confirm you are not creating a brand-new draft in Draft box. New drafts have no historical baseline for diff.

## Why the "AI Review" button is disabled

### Symptoms

The "AI Review" button is not clickable.

### Quick checks

Whether valid SQL has been generated in "Table DDL" on the right, rather than placeholder text.

### Steps

1. Complete table name and at least one valid field first. Result: real DDL is generated on the right.
2. Click "AI Review" again. Result: the button becomes available and starts the review flow.

### If still unresolved

Check whether a review task is already running. The button is temporarily disabled during processing.

## Why review history is empty

### Symptoms

After opening review history, you see "No review history".

### Quick checks

Whether the current table has completed at least one successful review.

### Steps

1. Run one full `AI Review` on the current table first. Result: one review record is generated and saved.
2. Open history after review completes. Result: the related record becomes visible.

### If still unresolved

Confirm you are viewing history for the same table, not another table that was never reviewed.
