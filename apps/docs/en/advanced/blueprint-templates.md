# Table blueprint templates

A table blueprint stores a table's fields, indexes, database type, and table-level settings. When you apply a blueprint, DDLBuilder opens that structure in a new draft tab. Blueprints are stored in the current browser.

## When to use

Use blueprints when you create several tables with similar structures, such as multiple order tables or log tables. Save one of them as a blueprint, then start the next table from it instead of entering fields and indexes row by row.

---

## What a blueprint contains

| Content | After you apply the blueprint |
|---|---|
| Fields and indexes | Copied into the new draft |
| Database type | The new draft uses the blueprint's database type |
| Table-level settings (such as MySQL partitions and Citus sharding) | Copied into the new draft |
| Table name, table comment, schema name, and grants | Not stored in the blueprint. The new draft keeps the values from the current tab |
| Foreign keys | Not stored in the blueprint. Configure them again after applying |

---

## Steps

1. In the toolbar above the field table, click **Table Blueprint**.
2. Save a blueprint:
   - After you finish editing a table, choose **Save current table as blueprint...**.
   - Enter a blueprint name and an optional description, then click **Save Blueprint**.
3. Find and preview a blueprint:
   - Search the list by blueprint name or field.
   - Click a blueprint to open its preview, which shows the database type, field list, and index list.
4. Apply the blueprint:
   - In the preview, click **Apply Blueprint**.
   - The structure opens in a new draft tab. The original tab does not change.
5. Adjust it for your business:
   - Add or remove fields, change VARCHAR lengths, or change default values.
   - Click the Save icon to store it under a name in Saved Tables.
6. To rename, duplicate, or delete blueprints, choose **Manage blueprints...**.

---

## Verification checklist

- [ ] The blueprint structure opens in a new draft tab.
- [ ] Column lengths, precision, and defaults match your business rules.
- [ ] The generated DDL matches your target dialect.

## Notes

::: tip Adjust after applying
A blueprint copies the structure as it was when you saved it. Before using it for a new table, adjust it for your concurrency, compliance requirements (such as masked or encrypted phone number fields), and dialect.
:::

- Blueprints do not store foreign keys. After applying one, link the new table to other tables in **Foreign Keys** or **ER Diagram**.
- A blueprint keeps the field comments it had when you saved it. When you use it for another business area, update the comments to match that area's terms.
