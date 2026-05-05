# Indexes, Privileges, and Misc

## Who this is for

For users who have finished field input and now want to complete query performance, access privileges, and table-level options.

## What this solves

You can move from "table can be created" to "closer to production-ready", keeping indexes, privileges, and table-level parameters aligned with real query scenarios.

## Steps

1. Open "Indexes", enter field names, and select from suggestions. Result: you can quickly assemble index field combinations.
2. Choose `Add Index`, `Add Unique Index`, or `Add Primary Key` based on your goal. Result: corresponding index definitions are immediately added to DDL.
3. If index naming needs adjustment, edit the index name directly. Result: output SQL uses your confirmed naming.
4. If you need to derive indexes from queries, click `AI Index Advisor` and paste typical query SQL or slow query snippets. Result: the system recommends missing indexes, redundant indexes, field order optimizations, and query rewrites based on current fields and existing indexes.
5. Click `Add Index` for recommendations that match your scenario. Result: the recommended field combination enters index configuration, and DDL on the right updates immediately.
6. Open "Privileges", enter grantees, and add them. Result: matching grant statements are generated automatically in "Privilege DCL".
7. Open "Misc", enable the switch first, then configure engine, charset, collation, tablespace, fillfactor, or Oracle-specific storage options. Result: supported databases include these table-level options in DDL.
8. If Routine skeletons are needed, select stored procedure, function, or trigger templates in Misc and adjust parameters. Result: the Routine output area generates corresponding skeleton code.

## Done when

- Key query fields have indexes configured, and the primary key strategy is clear.
- If AI Index Advisor was used, recommended indexes have been reviewed against query scenarios and added to index configuration.
- Objects that need privilege grants appear in the grantee list.
- After enabling Misc settings, corresponding options are visible in DDL on the right.

## Common pitfalls

- Usually only one primary key is allowed. If one already exists, do not add another.
- AI Index Advisor needs a table name, fields, and typical query SQL; complete the context before analysis when any part is missing.
- If Misc is not enabled, selected options will not be written into DDL.
- If grantee is empty, an empty DCL is normal and not a system issue.
