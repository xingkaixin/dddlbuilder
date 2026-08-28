# WebMCP Agent Workflow

## Who this is for

For users with a WebMCP-capable browser agent who want the agent to inspect schemas, import SQL, run checks, or propose reviewable changes in the active DDLBuilder page.

## What this solves

WebMCP exposes DDLBuilder domain operations as structured tools. The agent can work with the active document without guessing button behavior from screenshots or the DOM.

## Prerequisites

- Use a browser that implements `document.modelContext`. WebMCP remains experimental; see the [Chrome WebMCP documentation](https://developer.chrome.com/docs/ai/webmcp) for current Origin Trial and local flag requirements.
- Keep the DDLBuilder page open. Its tools disappear when the page closes.
- A user must confirm every write in the page. The agent cannot bypass the confirmation dialog.

## Available tools

- `get_auth_status`: reports authentication status and capability groups without returning account identity or credits.
- `start_sign_in`: opens the sign-in dialog; the user completes password and verification steps privately.
- `inspect_active_schema`: reads paginated overview, field, index, relation, and option sections.
- `lint_active_schema`: runs deterministic schema checks.
- `read_generated_output`: reads bounded chunks of DDL, DCL, ORM, ALTER, or rollback output.
- `preview_schema_patch`: stages table, field, and index changes without writing them.
- `import_sql_preview`: parses SQL for a selected database dialect and stages an import preview.
- `apply_schema_patch`: waits for visible user confirmation and rejects stale changes.

## Authentication and anonymous workspaces

1. While signed out, the agent can still edit an anonymous local draft, import SQL, run checks, and read output. Result: local design is not blocked by authentication.
2. When a task needs cloud sync, account data, or paid AI, the agent calls `start_sign_in`. Result: the page opens its sign-in dialog.
3. The user or password manager fills credentials and completes verification. Result: passwords never enter tool arguments or outputs.
4. After sign-in, the page refreshes its tools and workspace state. Result: the agent can resume the task and the page can offer anonymous workspace migration.

## Schema change flow

1. The agent calls `inspect_active_schema` and receives a `baseSignature`.
2. The agent passes that signature to `preview_schema_patch` or `import_sql_preview`.
3. The agent calls `apply_schema_patch`, which waits for a user decision in the page.
4. DDLBuilder verifies the document signature again and applies only an unchanged proposal.

## Common failures

- Unsupported browser: DDLBuilder remains usable manually, but no WebMCP tools are visible.
- `CONFLICT`: inspect the active schema again and create a new preview.
- Read-only share: inspection and linting work, while schema writes are rejected.
- Headless or cloud agent: use an authorized backend MCP because WebMCP requires the live browser tab.

Index data uses `kind`: `index`, `unique_index`, `unique_constraint`, or `primary`. Tool output and new writes use `kind`. Legacy saved data containing `unique`, `isPrimary`, and `isUniqueConstraint` is converted when read.
