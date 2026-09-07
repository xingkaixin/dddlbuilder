# Field Standards and Business Dictionary

A field standard defines a business concept and its field properties. For example, define “Order amount” as `amount decimal(18,2)`, document its currency unit and meaning, and check whether tables follow that definition.

## Create a standard

1. Open a table and select **Field standards** in the field toolbar.
2. Select **New standard**, or select a current table field and choose **Create standard from this field**.
3. Enter its business name, definition, and unit.
4. Edit the field name, type, comment, nullability, default, update strategy, and enumerations.
5. Select **Save standard**. Each standard defines one field. Business definitions and units are documentation; they do not convert data or add DDL clauses.

## Reference and update

Select a standard and a current table field to compare their values. Differences are highlighted.

- **Link without changing field** preserves existing properties and records the reference.
- **Apply and link standard** overwrites the selected field with the displayed standard properties while preserving field identity.
- **Add standard field** adds a referencing field. Adding a duplicate field name is blocked.
- **Unlink** removes the reference and preserves field contents.

Editing a standard does not update referencing fields automatically. The current table's reference list displays differences. Select **Review differences** before applying an update. Table saving and database migrations remain separate operations.

## Check saved tables

Select **Check saved tables** to inspect references and differences in the current workspace. Unlinked fields with matching names are also included. Unsaved drafts are excluded. Results are a snapshot; check again after changing tables. To fix a field, open its table and review and apply the standard there.

## Storage and sharing

The library is stored in the current browser, independently of account workspaces. Export JSON for backup or sharing. Import previews names and the number of matching IDs to replace before merging. Files are limited to 2 MiB and 1000 standards.

Field references persist, share, and sync with tables. Other devices or collaborators must import the same library to resolve the standard IDs. Deleting a standard preserves fields and their reference IDs and shows “Missing standard”. Importing that ID again restores the reference.
