# Mock Data and Logical Enums

This guide covers how to generate realistic **Mock Datasets** and configure color-badged **Logical Enums** to document valid domain values.

## Overview

Accelerate development, test query behaviors, and eliminate ambiguity around status codes and dictionary columns by standardizing domain metadata visually.

---

## Operations Walkthrough

### 1. Generating and Exporting Mock Test Data
1. Ensure the active table has defined columns and types.
2. Click the **Mock Data** button in the toolbar to open the generator modal.
3. **Configure Generation Parameters**:
   - Set the row count (1–100 rows).
   - Inspect the generated preview. The generator populates type-accurate random data for integers, decimals, UUIDs, timestamps, emails, booleans, and more.
4. **Export Dataset**:
   - Choose your format: **SQL INSERT Statements**, **CSV File**, or **JSON Array**.
   - Click export or copy to populate your test database or API mocks immediately.

### 2. Configuring Logical Enums
For discrete columns such as status codes, approval states, or account types:
1. Locate the target field in the Field Configuration table and click to expand the **Inline Enum Editor**.
2. Click "Add Item" and enter the **Value** (e.g., `10`, `PAID`) and **Display Label** (e.g., `Paid`).
3. **Assign Color Badges**: Select distinct color badges (e.g., green for Success, red for Rejected, yellow for Pending) to make status values instantly identifiable in the UI.
4. **Drag to Reorder**: Drag enum rows to arrange values according to business priority.
5. Enum metadata persists with drafts and saved tables to document data dictionaries for the entire team.

---

## Verification Checklist

- [ ] Exported mock datasets import cleanly into local testing environments.
- [ ] Logical enum items cover all domain branches with clear display names and color badges.
- [ ] Enum configurations reload reliably from saved table records.

## Tips and Common Traps

::: tip Synthetic Privacy Safety
The Mock Data generator produces purely synthetic, randomized values. Never use unmasked production data in non-production environments.
:::

- **Cross-Table Constraints**: Generated mock rows are created based on single-table types and do not automatically resolve cross-table foreign key dependencies.
- **Physical vs. Logical Enums**: Logical enums serve as visual and documentation metadata within DDLBuilder. To enforce native database enum constraints, select the dialect's native `ENUM` data type.
