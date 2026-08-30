# Feature Entry and Visibility

This page addresses common questions regarding dialect-specific tabs, advanced panel visibility, and prerequisite conditions for unlocking features.

---

## 1. Why don't I see the "Partitioning" or "Sharding" tabs?

- **Partitioning Tab**: Engine-specific; visible only when the database dialect is set to **MySQL**, **MariaDB**, or **TiDB**. It is hidden automatically under PostgreSQL, Oracle, or SQL Server.
- **Sharding Tab**: Exclusively visible when the database dialect is set to **PostgreSQL (Citus)** for configuring reference and distributed tables. Standard PostgreSQL does not display this tab.

---

## 2. Why don't I see "Foreign Keys" or the "ER Diagram"?

- **Foreign Key Tab**: Available for all relational databases. Ensure your table has at least one column configured to activate the panel.
- **ER Diagram**: Located in the top header toolbar. Ensure relevant source and target tables are saved in "Saved Tables" before drawing relationship edges.

---

## 3. Why are "ORM" or "View/Routine" tabs missing in the output panel?

- **ORM Models**: Located in the top tab strip of the right-hand output panel (alongside "Table DDL" and "Privilege DCL"). Ensure the output panel is not collapsed.
- **View / Routine**: These tabs activate automatically once a view query is defined in the View panel or routine templates are enabled in Misc options.

---

## 4. Why is the "View Schema Changes (Diff)" button missing?

- **Prerequisites**:
  1. The active tab must have an established **Saved Table** loaded (not a blank new draft).
  2. You must make an **observable structural change** (e.g., adding/modifying columns or altering indexes).
- The button only renders when differences exist against the saved snapshot baseline.

---

## 5. Why is "Master Review" disabled or AI features blocked?

- **Master Review Grayed Out**: The right-hand DDL panel must contain a syntactically valid `CREATE TABLE` statement (table name and at least one column). The button is disabled when DDL is empty.
- **AI Prompts for Login / Credits**: Master Workshop, AI Modify, AI Index Advisor, and Master Review require an authenticated account with a positive credit balance.

---

## 6. Where is the "Trash Bin" located?

- **Location**: Open the "Saved Tables" drawer via the top navigation bar. The **Trash** tab is located in the drawer's header tabs or bottom footer.
- Soft-deleted tables remain stored here and can be restored with a single click before permanent purging.
