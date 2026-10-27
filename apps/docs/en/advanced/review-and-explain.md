# Review and explain SQL

This page explains how to use **AI Review** to check the current table's DDL, and how to use **Explain selection** to have AI explain a piece of SQL.

## When to use

Check a table yourself before handing it to a DBA or releasing it. When you read unfamiliar SQL, look at what each clause does, one part at a time.

---

## Steps

### 1. AI Review
1. Make sure the current table has columns and DDL has been generated.
2. In the **DDL** tab of the generated output, click **AI Review**.
3. Read the score and suggestions:
   - AI reviews six areas: naming conventions, data type choices, index design, integrity constraints, extensibility, and performance. It returns a score from 1 to 10 and a short summary.
   - Suggestions are listed one by one. Performance issues are marked **Severe** or **Warning**.
4. Suggestions that add, change, or remove a column, or add or remove an index, have an **Apply** button. Clicking it writes the change to the column or index configuration. Performance notes and general suggestions are for reference only and cannot be applied automatically.
5. Click the history icon next to **AI Review** to open **Review History**, which shows earlier scores and suggestions.

### 2. Explain selected SQL
1. In a SQL code area of the generated output, select a statement or clause with the mouse, such as an index option, a partition definition, or a storage parameter.
2. An **Explain selection** button appears next to the selection. When you are signed out, it reads **Sign in to explain**.
3. Click **Explain selection**. AI explains what the snippet does and its key points.

---

## Verification checklist

- [ ] The current table has an AI Review, and every issue marked **Severe** is fixed or confirmed.
- [ ] Applied suggestions appear in the table configuration, and the DDL is updated.
- [ ] Complex SQL snippets that you need to discuss in a review have explanations.

## Notes

::: tip Check business rules before applying
AI Review gives general database design advice. For changes that touch specific business rules, such as a denormalized column you kept on purpose, decide based on your actual requirements.
:::

- **AI Review** is disabled when no DDL has been generated. It is also disabled when the database type is SQLite / D1.
- When you use **Explain selection**, select a complete statement or clause.
