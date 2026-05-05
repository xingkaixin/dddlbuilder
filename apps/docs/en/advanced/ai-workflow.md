# AI-Assisted Table Design Workflow

## Who this is for

For users who need to quickly generate table schema drafts and progressively refine them through conversational input or small-step table edits.

## What this solves

You can turn business requirements into executable field and index drafts, or ask AI to generate a reviewable change list from the current table, then manually review key constraints.

## Prerequisites

- You have defined the business entity, key primary key, and core query scenarios.
- `AI Table Workshop` or `AI Modify` can be opened normally on the current page.

## Steps

1. Click `AI Table Workshop` in the table configuration area. Result: the AI conversation panel opens.
2. Enter your first requirement with clear object, key fields, constraints, and index preferences. Result: AI returns the first schema draft, with design decision explanations (such as why a certain type was chosen, why an index was set).
3. If current configuration already exists, continue with instructions like "add fields", "adjust types", and "add indexes". Result: AI generates continuously based on existing context without re-describing everything; if the workspace already has `Schema Name`, it is also passed in as table-level context.
4. If you need standard field reuse, select templates before generating. Result: AI prioritizes template fields and improves structural consistency.
5. After confirming the result, click `Apply to table config`. Result: fields and indexes are written into workspace and become editable; if AI returns `schemaName` or a schema-qualified table name, the system splits and fills `Schema Name` and `Table Name` automatically.
6. Return to the main interface and manually review key items. Result: types, nullable, default values, index naming, and business constraints are finally confirmed.
7. When an existing table needs a local adjustment, click `AI Modify` in the header and describe the target change, such as "add a deleted_at soft-delete field and change the phone unique index to phone plus tenant ID". Result: AI generates table-level, field, and index change details based on the current table.
8. In the `AI Modify` panel, accept or reject each change, then click `Apply selected changes`. Result: accepted changes are written into the current table configuration, while unaccepted changes remain unapplied.
9. When you need to supplement comments for tables and fields, request AI to generate Chinese business comments. Result: AI infers semantics based on field names and types, generates concise Chinese comments, and fills them into `Table Chinese Name` and `Field Chinese Name`.

## Done when

- AI results have been successfully applied to the current table configuration.
- When using AI Modify, target changes have been reviewed item by item and written into the workspace.
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
- AI Modify works best for small-step schema edits. For changes involving business meaning, compatibility, or index strategy, inspect each change detail before applying.
