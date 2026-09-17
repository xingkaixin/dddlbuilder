# Business data import

For real order records, customer lists or similar CSV / Excel data, open **Database Tools → Business data import**. Generate a new table and INSERT SQL, or validate records against an existing table and generate INSERT SQL. No account is required.

Records stay in browser background processing. They are not uploaded, written to the workspace or synchronized with an account. Closing the tool or switching accounts clears the current input and results. Structure SQL still uses the existing parsing service; do not paste INSERT statements containing records into the structure source.

## 1. Read data

Choose a `.csv`, `.tsv`, `.txt` or `.xlsx` file, or paste text. CSV / text must be UTF-8. Select comma, Tab or semicolon and click **Read data**. For Excel, select a worksheet from the list; an empty first worksheet does not prevent selecting another.

The first record contains nonempty, unique headers. CSV supports quoted delimiters, line breaks and doubled quotes. Every record must match the header width. Fully empty records are skipped. Error positions preserve physical source rows, including headers and quoted line breaks.

```csv
order_code,amount,created_at
00123,19.90,2026-09-01
00124,29.50,2026-09-02
```

`00123` is inferred as text to preserve its leading zeros. Amounts use exact decimal values.

| Limit | Maximum |
| --- | --- |
| CSV / text | 2 MiB |
| Compressed xlsx | 5 MiB, with additional decompression checks |
| Data rows / columns / total cells | 5,000 / 100 / 100,000 |
| Cell content | 10,000 characters |
| Total decoded content | 2 Mi characters |

Oversized input is rejected, never silently truncated. Encrypted workbooks, merged cells, formulas and error cells are unsupported. Verify formulas and convert them to values in the source file. Numbers beyond safe precision must be provided as text preserving the original digits; digits already rounded by Excel cannot be recovered. Date cells become ISO text; textual dates use your explicit format setting.

## 2. Confirm target and mappings

### Create a new table

Select MySQL or PostgreSQL, a table name and an optional schema / database name. All records are scanned to infer integer, exact decimal, boolean, date or text columns. Mixed values use text. Edit names, types and nullability, or ignore fields. Primary keys, unique keys and business relationships are not inferred.

After changing format options, use **Infer fields again with current options (replace edits)** to regenerate definitions. This replaces edited fields. Review types again after changing the database.

### Use an existing table

Select one ordinary MySQL / PostgreSQL table from saved tables, a structure snapshot JSON or structure SQL. This uses the selected version, without connecting to the database. Map each target field to one source column; matching names are preselected and unused source columns are listed.

**Omit (use default)** excludes the field from INSERT. A required field without a default cannot be omitted. An explicitly mapped empty value does not silently use the default. Types and constraints come from the selected structure and cannot be edited in the mapping panel.

### Value handling

- Empty cells become NULL by default; disable this to preserve empty strings. Literal text `NULL` is not automatically converted.
- Whitespace is preserved unless trimming is enabled.
- Text dates accept ISO, DD/MM/YYYY or MM/DD/YYYY. Invalid dates are rejected. Times use `HH:mm:ss` and up to six fractional digits, subject to field precision.
- Common integers, decimal/numeric, character types, booleans, dates / timestamps without time zones, JSON, PostgreSQL UUID and MySQL ENUM are supported. Unsupported types block output. Floating-point fields use approximate semantics; use decimal for money.

## 3. Validate and download

Click **Validate all data and generate SQL** to check required fields, types, integer bounds, decimal precision, text length, dates, enumerations and duplicate primary / unique keys within the file.

Any issue blocks the entire SQL export. The first 50 issues show source rows; download all errors and original values as JSON. Correct the file or mapping and validate again. Changing input, target, mappings or formats immediately clears old results.

New-table output contains CREATE TABLE and INSERT; existing-table output contains INSERT only, in batches of up to 100 rows. Previews show five rows and 12,000 SQL characters, while downloads are complete. MySQL text uses UTF-8 hexadecimal literals and PostgreSQL uses E strings to avoid dependence on ordinary string escaping modes. Scripts are not executed automatically. The target schema / database must already exist.

Offline checks do not inspect existing records, referenced rows, triggers, unmodeled CHECK constraints or database collation. Omitted default fields do not participate in file uniqueness checks. Review PostgreSQL sequence positions after inserting explicit generated IDs. Passing file checks does not guarantee execution in every database version or configuration.

## Reuse settings

Expand **Reuse import settings** to name and save a profile or import / export JSON. Profiles contain targets, mappings and formats, without records, error values or generated SQL. They remain in this browser without account synchronization. Save up to 50 profiles; imported files are limited to 256 KiB. Duplicate names are rejected; use a new name or delete the old profile explicitly.

Read the current data before loading. Existing-table profiles also require selecting the matching table. Mappings use column names, not positions. Missing source columns, wrong targets and removed fields prevent application. Existing fields use the current selected types and must be validated again; review mappings for newly added fields. A loaded delimiter applies to subsequent file reads.

Field-definition lists containing field names, SQL types and comments still use [Import and Parse SQL](/en/advanced/import-and-parse).
