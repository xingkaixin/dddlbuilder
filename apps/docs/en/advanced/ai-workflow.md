# AI-Assisted Table Design Workflow

## Who this is for

For users who need to quickly generate table schema drafts and progressively refine them through conversational input.

## What this solves

You can turn business requirements into executable field and index drafts first, then manually review key constraints to reduce modeling startup cost.

## Prerequisites

- You have defined the business entity, key primary key, and core query scenarios.
- `AI Table Workshop` can be opened normally on the current page.

## Steps

1. Click `AI Table Workshop` in the table configuration area. Result: the AI conversation panel opens.
2. Enter your first requirement with clear object, key fields, constraints, and index preferences. Result: AI returns the first schema draft, with design decision explanations (such as why a certain type was chosen, why an index was set).
3. If current configuration already exists, continue with instructions like "add fields", "adjust types", and "add indexes". Result: AI generates continuously based on existing context without re-describing everything; if the workspace already has `Schema Name`, it is also passed in as table-level context.
4. If you need standard field reuse, select templates before generating. Result: AI prioritizes template fields and improves structural consistency.
5. After confirming the result, click `Apply to table config`. Result: fields and indexes are written into workspace and become editable; if AI returns `schemaName` or a schema-qualified table name, the system splits and fills `Schema Name` and `Table Name` automatically.
6. Return to the main interface and manually review key items. Result: types, nullable, default values, index naming, and business constraints are finally confirmed.
7. When you need to supplement comments for tables and fields, request AI to generate Chinese business comments. Result: AI infers semantics based on field names and types, generates concise Chinese comments, and fills them into `Table Chinese Name` and `Field Chinese Name`.

## Done when

- AI results have been successfully applied to the current table configuration.
- Field and index count, naming, and constraints match the target business scenario.
- If this design requires a schema, `Schema Name` is aligned with the target table after apply.
- If AI comments were used, table and field Chinese names are supplemented and semantically accurate.
- DDL output on the right is ready to enter the review flow.

## Common pitfalls and failure handling

- Input is too short: AI output becomes generic. Add business semantics, field roles, and constraints, then retry.
- If you need a schema-qualified table, state the schema directly in the prompt, or fill `Schema Name` in the workspace before continuing the conversation.
- Generation fails or is interrupted: keep current prompt and retry once directly; if needed, split into smaller requests.
- Direct execution risk: AI output is a draft. Do not skip manual review before execution.
- History drifts from target: use `Restart` to clear context and rebuild requirements with the new goal.
- AI comments are semantic inferences and may have deviations; manual review of key business field comment accuracy is recommended after generation.
