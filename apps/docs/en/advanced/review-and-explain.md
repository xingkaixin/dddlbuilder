# Review and Explain SQL

This guide covers how to execute expert-grade schema quality audits using **Master Review** and decode complex dialect-specific clauses using the **SQL Explanation** tool.

## Overview

Perform pre-flight architecture reviews before submitting DDL to DBA approval boards, identify hidden performance bottlenecks, and rapidly understand legacy or unfamiliar database syntax.

---

## Operations Walkthrough

### 1. Master Review (Architect-Level Quality Audit)
1. Ensure the active table has valid columns configured and renders valid DDL in the output panel.
2. Click **Master Review** in the DDL header.
3. **Inspect Multidimensional Quality Scoring**:
   - The engine audits schemas across key pillars: **Naming Conventions**, **Data Type Choices**, **Index Efficiency**, **Integrity Constraints**, **Extensibility**, and **Performance Risks**, delivering a composite score (1–10).
   - Issues are prioritized into high-risk bugs, optimization recommendations, and best-practice notices with detailed reasoning.
4. **One-Click Remediation**: For structural recommendations (such as missing composite indexes or sub-optimal numeric types), click **Apply** on the suggestion card to write the fix directly back to your columns or index configuration.
5. **Audit History**: Click the history icon to inspect previous review snapshots and track score improvements over time.

### 2. Explain Selected SQL
1. In the DDL output code editor, highlight any SQL snippet or complex clause (such as custom partitioning expressions, dialect-specific storage clauses, or index options).
2. An **Explain Selected** tooltip will appear adjacent to your selection.
3. Click "Explain Selected" to prompt the AI for an immediate breakdown of the clause's **execution semantics**, **engine behavior**, and **business context**.

---

## Verification Checklist

- [ ] The schema has completed a Master Review cycle with all high-risk items resolved.
- [ ] Accepted recommendations are accurately applied to the configuration table.
- [ ] Complex SQL clauses have verified explanations ready for architecture reviews.

## Tips and Best Practices

::: tip Reviewing Suggestions in Domain Context
Master Review suggestions are rooted in general database best practices. Always evaluate suggestions (such as normalizing a denormalized caching column) against your specific business requirements before applying.
:::

- **Valid DDL Requirement**: A schema must have a table name and at least one valid column to generate DDL before triggering a review.
- **Accurate Selection**: When using "Explain Selected", highlight complete syntactic blocks for the most context-aware explanations.
