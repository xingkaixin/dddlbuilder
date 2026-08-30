# WebMCP Agent Workflow

This guide details how to leverage the **WebMCP (Web Model Context Protocol)** to allow browser-based AI agents to interact directly and structurally with DDLBuilder for automated audits, schema imports, and verified patches.

## Overview

Use browser agents (such as Gemini Nano or Chrome extension AI assistants) to read active table definitions, inspect DDL outputs, execute Schema Lint rules, and propose transactional modifications without fragile DOM parsing or screen scraping.

---

## Tool Capabilities and Directory

DDLBuilder exposes core domain operations as strongly-typed, callable tools:

| Tool Name | Scope and Behavior |
|---|---|
| `inspect_active_schema` | Paginates through the active table's metadata, columns, indexes, foreign keys, and storage options |
| `lint_active_schema` | Executes deterministic Schema Lint rules against the active schema and returns structured diagnostic reports |
| `read_generated_output` | Streams generated DDL, DCL, ORM models, ALTER migrations, or rollback scripts |
| `preview_schema_patch` | Accepts proposed column/index diffs from the agent and renders a preview diff without writing to state |
| `import_sql_preview` | Parses an input SQL string under a specified dialect and presents an import preview |
| `apply_schema_patch` | Applies a validated patch atomically after user confirmation (guarded by signature concurrency checks) |
| `get_auth_status` | Checks sign-in state and enabled capabilities (preserves privacy by omitting email and token data) |
| `start_sign_in` | Triggers the sign-in modal, ensuring credentials and bot verification are handled securely by the user |

---

## Safe Patch Application Workflow

To prevent unwanted AI hallucinations or race conditions, WebMCP enforces an optimistic concurrency model based on **`baseSignature`**:

```mermaid
sequenceDiagram
    participant Agent as Browser AI Agent
    participant WebMCP as WebMCP Tool Layer
    participant User as User Review UI
    participant Workspace as DDLBuilder Workspace

    Agent->>WebMCP: inspect_active_schema()
    WebMCP-->>Agent: Returns active schema + baseSignature
    Agent->>WebMCP: preview_schema_patch(baseSignature, patch)
    WebMCP->>User: Displays diff modal and Lint validation
    Agent->>WebMCP: apply_schema_patch(baseSignature, patchId)
    User->>Workspace: User explicitly clicks "Apply Changes"
    alt Signature Matches
        Workspace-->>Agent: Changes applied; workspace updated
    else Concurrently Modified (CONFLICT)
        Workspace-->>Agent: Rejected; agent must re-read latest signature
    end
```

---

## Verification Checklist

- [ ] Browser environment exposes `document.modelContext` with DDLBuilder tools registered.
- [ ] The agent can retrieve schema details and diagnostic reports without errors.
- [ ] Applying schema patches requires an explicit click in the review dialog.
- [ ] Read-only share links allow inspection while blocking all modification attempts.

## Tips and Constraints

::: warning Human-in-the-Loop Safeguard
Agents cannot bypass the UI confirmation gate. Every modification proposed via `apply_schema_patch` requires explicit review and approval by the user.
:::

- **Browser Compatibility**: WebMCP is an evolving standard. Check the [Chrome WebMCP Documentation](https://developer.chrome.com/docs/ai/webmcp) for experimental flag requirements and Origin Trial status.
- **Session Lifecycle**: WebMCP operates within the context of the active browser tab. Closing or refreshing the page terminates the active tool session.
- **Headless / Server Scenarios**: For CI/CD pipelines, CLI automation, or cloud-hosted agents lacking an active browser tab, use standard backend MCP endpoints rather than WebMCP.
