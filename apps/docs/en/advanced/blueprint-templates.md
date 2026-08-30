# Table Blueprint Templates

This guide explains how to use DDLBuilder's built-in **Table Blueprint Templates** to bootstrap domain schemas rapidly using industry-standard architectures.

## Overview

Eliminate repetitive manual entry when modeling common business entities (such as user profiles, order headers, RBAC permissions, and audit logs) by starting from hardened baseline blueprints.

---

## Standard Built-in Blueprints

| Blueprint Domain | Typical Column Definitions | Standard Indexes & Keys |
|---|---|---|
| **User Account** (`user_account`) | `user_id`, `username`, `email`, `phone`, `password_hash`, `status`, `created_at` | Primary Key, `username` unique, `email` unique, `status` filter index |
| **Order Master** (`order_master`) | `order_id`, `order_no`, `user_id`, `total_amount`, `pay_amount`, `status`, `paid_at`, `created_at` | Primary Key, `order_no` unique, `user_id` query index, `created_at` date-range index |
| **Audit Log** (`sys_audit_log`) | `log_id`, `trace_id`, `operator_id`, `action`, `method`, `ip`, `status`, `duration_ms`, `created_at` | Primary Key, `trace_id` tracing index, `operator_id` index, `created_at` range/partition index |

---

## Operations Walkthrough

1. Click the **Table Blueprint** button in the top navigation bar.
2. **Browse and Preview Templates**:
   - Explore standard templates across domain categories.
   - Click any template card to preview its columns, data types, nullability, primary keys, and index configurations.
3. **Apply Blueprint**:
   - Once satisfied with the preview, click **Apply Blueprint**.
   - The system expands the schema into a **brand-new workspace tab**, keeping your existing tabs untouched.
4. **Customize for Domain Needs**:
   - Add/remove columns, modify string lengths, or change default constraints to fit your domain.
   - Click the Save icon to persist the tailored schema as a named Saved Table.

---

## Verification Checklist

- [ ] The blueprint schema loads cleanly into a new workspace tab.
- [ ] Column lengths, precisions, and defaults reflect specific business rules.
- [ ] The generated DDL complies with your target dialect standards.

## Tips and Common Traps

::: tip Customizing General Defaults
Blueprint templates provide general domain baselines. Always tailor nullability, field lengths, and compliance policies (such as encrypted PII fields) to your specific production requirements.
:::

- **Foreign Key Reconnection**: Blueprints are self-contained single-table definitions. Configure cross-table relations in the Foreign Keys tab or ER Diagram canvas after applying.
- **Terminology Alignment**: Update generic display labels and comments to align with your organization's internal data dictionary.
