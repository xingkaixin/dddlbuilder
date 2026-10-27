# AI-assisted table design workflow

This guide explains how to use AI Table Workshop, AI Edit, and AI Comments.

## When to use

Use these features in two cases. You can generate a new table from a description of the business requirements. You can also make targeted changes to an existing table. The AI proposes changes, and you accept or reject each one before applying it.

---

## Steps

### 1. AI Table Workshop (conversational design)
1. Click **AI Table Workshop** in the table config area to open the conversation panel.
2. Describe the business requirements, including entities, main business scenarios, frequent query conditions, and special constraints. For example: "Design a multi-tenant e-commerce order table with tenant ID, order number, payment status, amount, and coupon discount. It must support queries by creation time range."
3. You can select field templates. The AI uses fields from those templates first (for example, `created_at` and `updated_by`).
4. The AI returns a complete table structure. **Design notes** explains the type and index choices, such as why it added a composite index.
5. Add further requests in the conversation (for example, "Add a soft-delete column" or "Change the amount to an exact decimal type") and click **Send revision**. The AI adjusts the previous result.
6. Click **Apply to table config**. The generated table name, table comment, schema name, fields, and indexes open in a new draft tab.

### 2. AI Edit current table (accept changes one by one)
When the table already exists and needs targeted changes:
1. In the toolbar above the field table, open **AI tools** and choose **AI Edit**.
2. Describe the change (for example, "Add a WeChat OpenID column, and change the phone unique index to a composite unique index on tenant ID and phone").
3. The AI compares the request with the current table and lists change details grouped into table, field, and index changes.
4. Click **Accept** or **Reject** on each change, or use **Accept all** or **Reject all**.
5. Click **Apply N changes**. DDLBuilder writes the accepted changes to the current table in one step. If a selected index depends on a field you did not select, the apply fails with a message and the table stays unchanged. If the table structure changed after the suggestions were generated, generate them again.

### 3. AI Comments
- In the toolbar above the field table, open **AI tools**, then choose **Fill Missing Comments** under **AI Comments**.
- The AI infers meaning from the table name, table comment, field names, field types, and existing comments (for example, `is_deleted` and `pay_channel`). It fills empty table and field comments in the current interface language and leaves existing comments unchanged.

---

## Verification checklist

- [ ] The generated table structure opens in a new draft tab, and its fields and types match the conversation result.
- [ ] Every AI Edit change is accepted or rejected, and the accepted changes are applied to the current table.
- [ ] You have checked nullability, uniqueness, precision, and primary key strategy by hand.
- [ ] Table and field comments are accurate and use consistent terms.

## Notes

::: tip Writing prompts
State your primary key preference, expected concurrency, and frequent WHERE filter columns in the prompt. The AI uses them to choose types and indexes.
:::

- AI output is a draft. Before running DDL in production, check it against your business logic.
- AI features deduct account credits based on actual token usage. If you are not signed in, a sign-in prompt appears.
- If a multi-turn conversation drifts from what you want, click **Restart** in the panel to clear the conversation, then describe the requirements again.
