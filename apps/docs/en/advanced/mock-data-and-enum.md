# Mock data and logical enums

This guide explains how to generate mock test data in DDLBuilder and how to configure logical enums for a field.

## When to use

Use these tools to fill in test data during development and integration testing, to check SQL queries, and to record the values and meanings of status codes, type codes and similar fields.

---

## Steps

### 1. Generate and export mock data
1. Make sure the table's columns and data types are set.
2. Click **Mock Data** in the field toolbar to open the **Mock Data Generator**.
3. Set the generation options:
   - Set the row count (1 to 100 rows).
   - Check the preview. The generator creates values from each field's type. When a field name or comment contains keywords such as email, phone or address, it generates values in that format.
4. Export the data:
   - Switch between the **INSERT SQL**, **CSV** and **JSON** tabs.
   - Click **Copy** or **Download**, then load the data into your local test database or API testing tool.

### 2. Configure logical enums
Use logical enums for fields with a fixed set of values, such as status codes, review states or user types:
1. Find the field in the field table and click the edit icon in its type cell to open the **Edit Enum Values** dialog.
2. Type a value (for example `10` or `PAID`) and press Enter or click **Add**. Enter its meaning under **Chinese** and **English** (for example `已支付` and `Paid`).
3. Click an enum item's color swatch to pick a color, for example green for success, red for rejected and yellow for pending. The field type cell shows enum values in these colors.
4. Drag an enum item by the handle on its left to reorder it.
5. Click **Confirm**. Drafts and saved tables keep the enum settings.

---

## Verification checklist

- [ ] The exported mock data imports into your test database.
- [ ] The logical enum covers every business value of the field, and each value has comments and a color.
- [ ] The enum settings are still there after you reload the saved table.

## Notes

::: tip Sensitive production data
The mock data generator only produces random values and contains no real business data. Do not use unmasked real user data in test environments.
:::

- The generator works on one table at a time and does not check foreign keys across tables. When inserting into a test database, insert rows into the referenced tables first.
- A logical enum does not change the field type or create a database constraint. When DDLBuilder generates DDL, it appends the enum values and comments to the field comment. If you need a database `ENUM` type, select the target dialect's `ENUM` in the field type.
