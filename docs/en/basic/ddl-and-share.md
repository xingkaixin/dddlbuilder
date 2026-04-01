# DDL Output and Sharing

## Who this is for

For users who have finished schema configuration and are preparing external review, collaboration confirmation, or SQL delivery.

## What this solves

You can make clear what to copy and what others can do after sharing, avoiding wrong handoff content or the assumption that shared pages are directly editable.

## Steps

1. In the output area on the right, check `Table DDL` first. Result: you can confirm whether `CREATE TABLE` matches your expected structure; if `Schema Name` is filled, the output uses the schema-qualified table name.
2. Switch to `Privilege DCL` and check grant statements. Result: you can deliver table creation and privileges separately and reduce execution omissions; if a schema exists, grant targets follow the same qualified table name.
3. Click `Copy DDL` or `Copy DCL` as needed. Result: SQL is copied to clipboard and can be pasted directly into review docs or execution systems.
4. Click `Share` in the top bar. Result: the system generates an accessible read-only link and copies it automatically, with a default validity window; shared content preserves the current `Schema Name` and table structure.
5. If the recipient needs to continue editing after opening the link, click `Save as copy and edit` in the page prompt. Result: the system returns to home and loads an editable copy without changing the original shared view.
6. During collaboration, use top entries such as `Docs`, `Language`, and `Theme`. Result: collaborators can quickly check guidance, open locale-matched docs, and adjust reading preferences.

## Done when

- Required DDL or DCL has been copied and sent correctly.
- The share link has been verified as accessible and the recipient can view complete read-only content.
- If the current table uses a schema, both copied SQL and the shared page still show the qualified table name.
- When further edits are required, it has been successfully converted into an editable copy.

## Common pitfalls

- Shared pages are read-only by default and cannot be used directly as online editors.
- If schema is part of your environment boundary, verify that DDL / DCL already carries the expected qualified table name before copying.
- Copying only DDL but not DCL may lead to table creation without synchronized privilege grants.
- Share links expire. Regenerate links again for critical review windows.
