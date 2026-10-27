# Feature entry and visibility

This page explains where some tabs, buttons, and entry points are, and when they appear.

---

## 1. Why don't I see the "Partitioning" or "Sharding" tabs?

- **Partitioning** appears only when the database type is a MySQL-family database: MySQL, MariaDB, TiDB, OceanBase (MySQL), GBase, or PolarDB. It does not appear for PostgreSQL, Oracle, or other types.
- **Sharding** appears only when the database type is **PostgreSQL (Citus)**. Use it to set up reference tables and distributed tables. Standard PostgreSQL does not show it.
- Both are in the **Advanced** menu of the configuration area, not in the main tab bar.

---

## 2. Why don't I see "Foreign Keys" or the "ER Diagram"?

- The **Foreign Keys** tab is in the table configuration area. It does not appear when the database type is Hive or the object type is View. If the current table has no columns yet, the panel shows "Please add fields first".
- **ER Diagram** is in the **More** menu of the table configuration area. The diagram shows saved tables only, so save the tables you want to connect first.

---

## 3. Why can't I find the "ORM" or "Routines" tabs in the generated output?

- The tab bar at the top of the generated output contains **DDL**, **DCL**, **ORM**, and **Routines**. If you don't see the tab bar, check whether the output panel is collapsed.
- When the database type is SQLite / D1, **DCL** and **Routines** are hidden.
- View DDL appears in the **DDL** tab. There is no separate view tab.

---

## 4. Why don't I see "View schema changes"?

**View schema changes** is in the **More** menu of the table configuration area. It appears only when both of these are true:

1. The active tab has a **saved table** loaded, not a new blank draft.
2. You made an **actual structural change** to that table, such as adding or removing columns, changing types, or editing indexes.

Unchanged tables and drafts that were never saved have no version to compare against, so the item does not appear.

---

## 5. Why is "AI Review" disabled or why can't I start AI features?

- **AI Review** is disabled while the **DDL** tab shows only a placeholder such as "-- Please fill in table information on the left". It is also disabled when the database type is SQLite / D1.
- AI Table Workshop, AI Edit, AI Index Advisor, and AI Review call a language model service. You must be signed in and have a credit balance above 0.

---

## 6. Where is the "Trash"?

- **Trash** is at the bottom of the **Workspace** sidebar on the left. If the sidebar is collapsed, expand it first.
- Tables moved to the trash stay there. You can **Restore** or **Delete permanently** each one, or use **Empty Trash**.
