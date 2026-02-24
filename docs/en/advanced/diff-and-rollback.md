# Change Diff and Rollback

## Who this is for

For users who continuously evolve "Saved Tables" and need clear change scope and rollback paths before release.

## What this solves

You can clearly explain "what changed" and "how to roll back" before release, reducing execution risk of schema changes.

## Prerequisites

- A `Saved Table` is loaded in the current workspace.
- You have modified this table, and differences exist from the saved version.

## Steps

1. In the table configuration area, check whether the `View schema changes` button appears. Result: it appears only when a saved table is loaded and modified.
2. Open change diff and inspect table-level changes first, then field and index changes. Result: you can clearly identify change scope and impact.
3. Copy ALTER scripts from the diff dialog. Result: you get scripts for forward execution.
4. Expand and copy rollback scripts as needed. Result: you get scripts for reverting this change.
5. Open the history entry from the target item in `Saved Tables`. Result: enter version history and inspect each snapshot.
6. When restore is needed, choose a target version in history and execute rollback. Result: current workspace returns to the selected version state.

## Done when

- Change items are confirmed one by one, and scripts are clearly split into forward execution and rollback restore.
- Key versions are locatable in history, and stable versions can be restored when needed.
- You have an executable rollback plan before release.

## Common pitfalls and failure handling

- If no saved table is loaded or no diff exists, the diff entry does not appear. This is expected protection behavior.
- Rollback scripts are not always directly executable. Recheck against real database state before running.
- After deleting versions or overwriting saves, historical traceability changes. Keep milestone versions.
- Reviewing only ALTER scripts but not rollback scripts increases recovery cost in failure scenarios.
