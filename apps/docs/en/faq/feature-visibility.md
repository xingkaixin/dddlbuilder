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

## Why the "Foreign Key Configuration" tab is not visible

### Symptoms

The page does not show the "Foreign Key Configuration" tab.

### Quick checks

Foreign key configuration is available for all supported database types, but only meaningful when at least one field exists in field configuration.

### Steps

1. Add at least one field in field configuration first. Result: the Foreign Key Configuration tab appears normally.
2. Check whether tabs are collapsed or hidden. Result: expand all configuration tabs and recheck.

### If still unresolved

Refresh the page and confirm the field list is not empty.

## Why the "View/Routine" output panel is not visible

### Symptoms

The right output area only shows DDL and DCL, no "View" or "Routine" options.

### Quick checks

Whether view definition is filled in table config, or Routine templates are configured in "Misc Settings".

### Steps

1. To generate view DDL, first fill in the SELECT query in the view panel of table config. Result: the "View" option appears in the right output area.
2. To generate Routine, first select stored procedure, function, or trigger template in Misc Settings. Result: the "Routine" option appears in the right output area.

### If still unresolved

Confirm whether current database type supports views or Routine (almost all databases support views; Routine support varies by database).

## Why the "ORM" output panel is not visible

### Symptoms

The right output area does not show the "ORM" option.

### Quick checks

ORM generation exists as an independent tab in the right output area, alongside DDL/DCL.

### Steps

1. Check the tab bar at the top of the right output area. Result: when the field list is not empty, the "ORM" tab appears.
2. Click "ORM" and select the target framework. Result: the system generates corresponding ORM model code.

### If still unresolved

Confirm the right output area is not collapsed; if collapsed, click the expand button to restore.

## Why the "Schema Lint" panel is not visible

### Symptoms

Cannot find "Schema Lint" or "Lint" entry on the page.

### Quick checks

The Schema Lint entry is usually near the table configuration area, as a "Schema Lint" button or panel.

### Steps

1. Look for the "Schema Lint" button in the table configuration area. Result: click to open the lint panel.
2. Ensure the current table has at least one field. Result: empty tables have nothing to check, and the entry may be hidden.

### If still unresolved

Check whether the current page version includes Schema Lint functionality; if using an old version, refresh or upgrade.

## Why the "Mock Data" entry is not visible

### Symptoms

Cannot find the Mock Data generation button.

### Quick checks

The Mock Data entry is usually in the field configuration toolbar or table configuration area.

### Steps

1. Look for the "Mock Data" button in the table configuration area or field configuration toolbar. Result: click to open the generation dialog.
2. Ensure the current table has at least one field. Result: empty tables cannot generate mock data.

### If still unresolved

Confirm whether the current page has loaded the latest version features.

## Why the "Table Blueprint" entry is not visible

### Symptoms

The top action area does not have a "Table Blueprint" button.

### Quick checks

The table blueprint entry is usually in the top action area, near the "Import SQL" button.

### Steps

1. Check whether there is a "Table Blueprint" or "Template" button in the top action area. Result: click to open the blueprint selection dialog.
2. If not visible, check whether you are in draft box or saved table state; blueprints are available in all states.

### If still unresolved

Refresh the page or check whether the current deployment version includes blueprint functionality.

## Why "Trash" is not visible

### Symptoms

Cannot find the recovery entry after deleting a saved table.

### Quick checks

Trash is usually inside the "Saved Tables" drawer, as an independent tab or bottom link.

### Steps

1. Open the "View Saved Tables" drawer. Result: find "Trash" at the bottom or in the tab bar of the drawer.
2. Enter trash to view deleted tables. Result: click "Restore" to return the table to the saved tables list.

### If still unresolved

Confirm whether you are on the latest version; trash functionality may not exist in older versions.

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

## Why AI features are unavailable (generate, review, explain)

### Symptoms

Clicking AI table generation, AI Review, or SQL explanation shows a sign-in prompt or an insufficient-credits message.

### Quick checks

- Whether you are currently signed in.
- Whether your credit balance is greater than 0 after signing in.

### Steps

1. Anonymous users should register or sign in first. Result: AI features become available after signing in.
2. After signing in, check the remaining credits in the header account menu. Result: you can confirm the current balance.
3. If the balance is 0, open Settings > Credits to view usage history. Result: you can understand where credits were spent; recharge when the channel opens.

### If still unresolved

Confirm whether the current environment has the user and credit system enabled; some private deployments may not include these features.

## Why the "Settings" entry is missing

### Symptoms

There is no account avatar or Settings button in the top action area.

### Quick checks

Whether the current deployment has the user system configured (Better Auth + D1).

### Steps

1. Use the official site (ddl.xingkaixin.me), where the user system is fully configured. Result: the Settings entry appears normally.
2. For local development or private deployments, check whether environment variables such as `BETTER_AUTH_URL` and the database are configured correctly. Result: after configuration, refresh the page to see the sign-in and Settings entries.

### If still unresolved

Contact the deployment administrator to confirm whether the user system is enabled.

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
