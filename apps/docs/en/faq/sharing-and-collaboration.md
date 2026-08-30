# Sharing and Collaboration

This page covers common questions regarding read-only share links, branching editable copies, team collaboration workflows, and schema persistence.

---

## 1. Why is a shared schema page read-only?

- **Read-Only Protection**: Shared links render **immutable snapshots** to prevent collaborators from inadvertently modifying or corrupting the author's active design.
- **Branching an Editable Copy**:
  1. Collaborators can click **Save as Copy and Start Editing** in the banner at the top of the shared page.
  2. The system clones the schema directly into the recipient's personal workspace.
  3. The recipient now has a completely independent replica that can be modified, saved, and reviewed without affecting the original share URL.

---

## 2. Why does opening a share link redirect to the home page?

- **Expired Link**: Share links are valid for 7 days by default. Expired links are decommissioned automatically.
- **Truncated URL**: Chat tools may truncate long URLs or line-wrap parameters. Ensure the full URL is copied into the browser address bar.
- **Remediation**: Request the author to reopen the table and click **Share Link** to issue an active URL.

---

## 3. Why does clicking "Share Link" multiple times return the exact same URL?

- **Content Hashing & Idempotency**: DDLBuilder computes content hashes based on table metadata, columns, constraints, and indexes. When sharing an unchanged schema, the system reuses the existing active link to avoid duplicating identical cloud snapshots.
- **Generating a New Link**: Apply an observable change (e.g., add a column or update a comment) and click Share Link again to generate a new URL.

---

## 4. How do Drafts differ from Saved Tables in team workflows?

| Aspect | Drafts | Saved Tables |
|---|---|---|
| **Role** | Scratchpads for rapid, informal prototyping | Named, formalized architectural assets |
| **History & Diff** | Maintains latest transient state only | Records version snapshots with rollback and timeline replay |
| **Organization** | Listed in the workspace sidebar | Grouped into hierarchical domain folders |
| **Sharing** | Best converted to a saved table before sharing | Instantly shareable as immutable read-only URLs |
