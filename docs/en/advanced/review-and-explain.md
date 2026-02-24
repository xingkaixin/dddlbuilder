# Review and Explain SQL

## Who this is for

For users who have generated SQL and now need quality evaluation, risk inspection, and team communication support.

## What this solves

You can use `AI Review` to identify structural risk first, then use `Explain selection` to quickly clarify key statement intent and reduce review communication cost.

## Prerequisites

- Valid DDL output already exists on the right side.
- You want quality review or segment explanation for current SQL.

## Steps

1. In the `Table DDL` area, click `AI Review`. Result: the system analyzes current DDL and generates scores and suggestions.
2. Inspect issue descriptions and suggestions in the review result. Result: you can quickly identify high-risk points and improvements.
3. Click `Apply` on executable suggestions. Result: suggestions are written back into field or index configuration and become ready for further verification.
4. Click the history icon in the review area. Result: you can view historical review records for the same table and revisit suggestions.
5. Select one SQL snippet in the code area. Result: the `Explain selection` entry appears.
6. Click `Explain selection` to view AI explanation. Result: you can quickly understand snippet intent and use it in review communication.

## Done when

- Current DDL has completed at least one review round with readable conclusions.
- Key suggestions are either applied as needed or explicitly marked as not adopted.
- Team members can understand key SQL snippets through explanations.

## Common pitfalls and failure handling

- No valid DDL means review cannot run: complete table structure and generate DDL first.
- "Applicable" does not mean "must apply": suggestions involving business rules require manual confirmation.
- No response from `Explain selection`: confirm the selected content is actually SQL text.
- Empty review history: usually this table has not completed a successful review yet.
