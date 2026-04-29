# Table Blueprint Templates

## Who this is for

For users who don't want to configure fields from scratch and prefer to quickly generate table structures based on common business scenarios.

## What this solves

You can reduce the initialization cost of "user tables, order tables, log tables" and other common structures to a few seconds, then fine-tune as needed.

## Prerequisites

- The current workspace is in an editable state (draft box or saved table both work).
- The target business scenario is already identified.

## Steps

1. Click the `Table Blueprint` button in the top action area. Result: the blueprint template selection dialog opens.
2. Browse the template list and select a template matching the target scenario (such as `User Table`, `Order Table`, `Operation Log Table`). Result: the dialog shows a preview of that template's structure (field list, indexes, primary keys).
3. After confirming the preview meets expectations, click `Apply`. Result: template fields and indexes are written into the current workspace; if the current tab already has content, the system prompts whether to overwrite.
4. Return to the field configuration table and add, remove, or adjust fields and indexes as needed. Result: the template-generated structure is personalized for business requirements.
5. Save as a named table. Result: the table enters the saved tables list for repeated loading later.

## Built-in template examples

| Template | Typical Fields | Typical Indexes |
|---|---|---|
| User Table | user_id, username, email, password_hash, created_at | Primary key, username unique index, email unique index |
| Order Table | order_id, user_id, amount, status, created_at | Primary key, user_id index, status index |
| Operation Log Table | log_id, operator, action, target, created_at | Primary key, operator index, created_at index |

## Done when

- The template has been successfully applied to the current workspace.
- Fields, indexes, and primary keys have been adjusted according to actual business needs.
- DDL output on the right meets expectations and can enter review directly.

## Common pitfalls

- Blueprint templates are generic designs; after applying, be sure to adjust field length, nullable, default values, and other details according to actual business requirements.
- When applying a blueprint to a tab with existing content, unsaved current changes may be lost; save or confirm before applying.
- Field Chinese names in blueprints are generic descriptions; replace them with accurate naming within your business domain.
