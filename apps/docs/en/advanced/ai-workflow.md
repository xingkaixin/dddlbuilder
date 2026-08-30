# AI-Assisted Table Design Workflow

This guide explains how to leverage DDLBuilder's AI suite (Master Workshop, AI Modify, AI Index Advisor, and Smart Comments) for intelligent schema modeling and refactoring.

## Overview

Transform ambiguous product requirements into production-ready schemas, or safely refactor established legacy tables using conversational guidance, structured patch reviews, and domain-aware recommendations.

---

## Core AI Workflows

### 1. Master Table Workshop (Conversational Green-Field Design)
1. Click **Master Workshop** in the table header to open the AI panel.
2. **Describe Your Business Domain**: Input entities, constraints, and query patterns (e.g., *"Design a multi-tenant e-commerce order table with tenant ID, order code, status, price, discount amounts, optimized for date-range queries"*).
3. **Template Integration**: Check template bundles to instruct the AI to incorporate standard audit columns (e.g., `created_at`, `updated_by`).
4. **Review Architecture Decisions**: The AI generates a complete schema accompanied by rationale notes explaining data type choices and indexing strategies.
5. **Iterate Across Turns**: Refine the design naturally (e.g., *"Add a soft-delete column"*, *"Change price columns to high-precision decimals"*).
6. Click **Apply to Table** to populate your workspace with columns, indexes, and schema settings.

### 2. AI Modify Current Table (Structured Patch Review)
When iterating on existing schemas without overwriting prior work:
1. Click **AI Modify** in the top navigation bar.
2. Specify the desired changes (e.g., *"Add openid column, and change phone unique index to a composite unique index on (tenant_id, phone)"*).
3. **Inspect the Generated Diff**: The AI computes fine-grained diff items categorized into table, column, and index mutations.
4. **Approve or Reject Items**: Individually accept or reject each proposed modification to maintain full manual control.
5. Click **Apply Selected Changes** to update the table atomically.

### 3. Smart Business Comment Generation
- Click **Generate AI Comments** on any active or imported table.
- The AI infers semantics from naming patterns (e.g., `is_deleted`, `pay_channel`) and data types, automatically populating descriptive labels to streamline data dictionary documentation.

---

## Verification Checklist

- [ ] AI-generated columns, data types, and indexes accurately populate the workspace.
- [ ] In AI Modify mode, all targeted changes are individually reviewed and applied.
- [ ] Critical constraints (nullability, uniqueness, precision) are manually verified.
- [ ] Generated comments and labels reflect clear domain terminology.

## Tips and Best Practices

::: tip Prompt Quality and Precision
Detailed prompts specifying query filters, workload characteristics, and key constraints yield significantly higher-quality indexing and type recommendations.
:::

- **Draft Verification**: AI output represents a high-quality initial draft; always review constraints before deploying DDL to production databases.
- **Account & Credits**: AI features consume account credits based on token usage. Guest users will be prompted to sign in before initiating requests.
- **Resetting Context**: If a multi-turn conversation drifts off topic, click "Start Over" to clear the session context and restart with a clean prompt.
