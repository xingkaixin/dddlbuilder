# Field standards and business dictionary

A field standard defines a business concept and its field properties. For example, define "Order amount" as `amount decimal(18,2)`, document its currency unit and meaning, and check whether tables follow that definition.

## Create a standard

1. Open a table and select **Field standards** in the field toolbar.
2. Select **New standard**, or select a current table field and choose **Create standard from this field**.
3. Enter its business name, definition, and unit.
4. Edit the field name, type, comment, nullability, default, update strategy, and enumerations.
5. Select **Save standard**. Each standard defines one field. Business definitions and units are documentation; they do not convert data or add DDL clauses.

## Reference and update

Select a standard and a current table field. The panel shows the current and standard values side by side and highlights differences.

- **Link without changing field** preserves existing properties and records the reference.
- **Apply and link standard** overwrites the selected field with the displayed standard properties while preserving field identity.
- **Add standard field** adds a field that references the standard. You cannot add it if the table already has a field with that name.
- **Unlink** removes the reference and preserves field contents.

Editing a standard does not update referencing fields automatically. **Standards referenced by this table** shows the number of differences. Select **Review differences** and check them before applying an update. Table saving and database migrations remain separate operations.

## Check saved tables

Select **Check saved tables** to inspect references and differences in the current workspace. The results also list unlinked fields with matching names. The check skips unsaved drafts. Results are a snapshot; check again after changing tables. To fix a field, open its table and review and apply the standard there.

## Storage and sharing

DDLBuilder stores the library in the current browser, separate from account workspaces. Export JSON for backup or sharing. Import previews names and the number of matching IDs to replace before merging. An import file can hold up to 2 MiB and 1000 standards.

Field references are part of the table, so saving, sharing and account sync include them. Other devices or collaborators must import the same library to resolve the standard IDs. Deleting a standard preserves fields and their reference IDs and shows "Missing standard". Importing that ID again restores the reference.
