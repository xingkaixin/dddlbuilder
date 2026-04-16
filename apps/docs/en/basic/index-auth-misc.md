# Indexes, Privileges, and Misc

## Who this is for

For users who have finished field input and now want to complete query performance, access privileges, and table-level options.

## What this solves

You can move from "table can be created" to "closer to production-ready", avoiding schemas with fields only but missing indexes and privileges.

## Steps

1. Open "Indexes", enter field names, and select from suggestions. Result: you can quickly assemble index field combinations.
2. Choose `Add Index`, `Add Unique Index`, or `Add Primary Key` based on your goal. Result: corresponding index definitions are immediately added to DDL.
3. If index naming needs adjustment, edit the index name directly. Result: output SQL uses your confirmed naming.
4. Open "Privileges", enter grantees, and add them. Result: matching grant statements are generated automatically in "Privilege DCL".
5. Open "Misc", enable the switch first, then configure engine, charset, collation, or tablespace. Result: supported databases include these table-level options in DDL.

## Done when

- Key query fields have indexes configured, and the primary key strategy is clear.
- Objects that need privilege grants appear in the grantee list.
- After enabling Misc settings, corresponding options are visible in DDL on the right.

## Common pitfalls

- Usually only one primary key is allowed. If one already exists, do not add another.
- If Misc is not enabled, selected options will not be written into DDL.
- If grantee is empty, an empty DCL is normal and not a system issue.
