# Errors and Failure Handling

This page collects common errors, failure symptoms, and actionable troubleshooting steps encountered when using DDLBuilder.

---

## 1. Share Link Unavailable or Expired

### Symptoms
Opening a shared link displays an alert stating "Share link does not exist or has expired" and redirects to the home page.

### Troubleshooting Steps
1. **Verify Link Integrity**: Ensure the URL was not truncated or modified by messaging apps (e.g., Slack, Teams, WeChat). Copy and paste the full URL directly into the address bar.
2. **Check Time-to-Live**: Share links are time-limited (typically valid for 7 days). If expired, ask the sender to generate a fresh link.
3. **Regenerate Link**: As the sender, reopen the table and click **Share Link** again to produce an active URL.

---

## 2. SQL Import Failure or Incomplete Parsing

### Symptoms
- Validation step reports "SQL Parse Failed" or a syntax error.
- Certain columns, indexes, or privilege grants are missing after import.

### Troubleshooting Steps
1. **Verify Source Dialect**: Confirm that the "Source Database" selected in the import modal matches the SQL script's dialect (e.g., avoid parsing Oracle DDL with the MySQL engine).
2. **Isolate Core DDL**: Import the foundational `CREATE TABLE` statements first to establish core table definitions.
3. **Batch Complex Statements**: For long scripts containing triggers, procedures, or complex alter scripts, import in smaller sections to isolate faulty syntax.
4. **Remove Session Directives**: Strip non-standard client environment commands (e.g., `USE database;`, `SET NAMES utf8mb4;`) before importing.

---

## 3. AI Request Failures (Workshop, Modify, Review, Explain)

### Symptoms
- Master Workshop reports generation timeout or failure.
- Master Review or "Explain Selected" does not respond or displays an error banner.

### Troubleshooting Steps
1. **Transient Network Hiccup**: Refresh the browser and retry the operation.
2. **Decompose Prompts**: Avoid requesting dozens of complex tables in a single prompt. Use incremental turns (core columns → indexes → constraints).
3. **Check Credit Balance**: Navigate to "Settings > Credit Center" and confirm you have sufficient AI credits. Recharge or top up if the balance is exhausted.

---

## 4. Authentication & Sync Issues

### Symptoms
- Sign-in displays "Email not verified" or "Too many requests".
- Workspace reports "Sync Failed" or presents conflict alerts.

### Troubleshooting Steps
1. **Email Verification**: Check your inbox (including spam folders) for the activation link and click it to activate your account.
2. **Rate Limiting Guard**: If prompted with "Too many requests", wait 1–2 minutes before retrying to clear temporary security rate limits.
3. **Trigger Manual Sync**: Go to "Settings > Workspace Sync", click "Sync Now", and review conflict details if multi-device edits diverged.

---

## 5. Clipboard Copy Failures

### Symptoms
Clicking "Copy DDL" or "Copy DCL" triggers a "Copy failed, please retry" alert.

### Troubleshooting Steps
1. **Browser Permissions**: Verify that your browser has not blocked clipboard write permissions for the current domain.
2. **Manual Keyboard Fallback**: In restricted corporate or remote desktop environments, select the SQL text in the output editor and press `Ctrl+C` (or `Cmd+C`) to copy manually.
