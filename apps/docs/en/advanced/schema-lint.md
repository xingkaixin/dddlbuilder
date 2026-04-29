# Schema Lint

## Who this is for

For users who want to discover naming non-compliance, improper type choices, and other potential issues during the design phase.

## What this solves

You can turn "whether it meets team standards" from manual checking into automatic checking, reducing rework during the review phase.

## Prerequisites

- The current table has at least one field or one index.
- Basic team naming conventions are already understood (built-in rules cover common scenarios).

## Steps

1. Click `Schema Lint` or `Lint` in the table configuration area. Result: the lint panel opens, listing all detected issues.
2. Review each issue's description, risk level (info/warning/error), and suggested fix. Result: you can quickly locate non-compliant items.
3. For high-priority items (error level), return to field or index configuration to modify. Result: after modification, re-click lint and the issue list refreshes.
4. For acceptable low-priority items, choose to ignore or mark as acknowledged. Result: the lint panel retains history for later review.

## Built-in check rules (examples)

- **Naming conventions**: whether field names use lowercase + underscore (snake_case); whether index names contain table name prefix; whether foreign key names are standardized.
- **Type rules**: whether large text fields use appropriate types; whether monetary fields avoid `FLOAT` / `DOUBLE`; whether auto-increment field types match target database conventions.
- **Redundancy detection**: whether duplicate indexes exist; whether empty indexes with no fields exist.
- **Risk alerts**: data compatibility risks when changing field types (linked with field-level risk prompts).

## Done when

- No error-level issues in the lint panel.
- Warning and info-level issues are either confirmed or fixed.
- Generated DDL has passed team standard review.

## Common pitfalls

- Schema lint is based on built-in rules and may not cover all special team conventions; manual review is recommended for critical projects.
- Some rules have different judgment criteria across database types (e.g., Oracle's `NUMBER` vs MySQL's `DECIMAL`); recheck after switching databases.
- Ignored issues do not disappear automatically; periodic review of ignored items is recommended.
