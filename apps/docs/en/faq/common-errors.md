# Errors and failure handling

This page lists common errors and failures in DDLBuilder and the steps to troubleshoot them.

---

## 1. Share link unavailable or expired

### Symptoms
After you open a share link someone sent you, the page shows "Share link not found or expired. Redirected to home." and returns to the home page.

### Troubleshooting steps
1. Check whether a chat app (such as Slack, Teams, or WeChat) cut off the link or added extra characters. Copy the full URL into the browser address bar.
2. Share links are valid for 7 days. If the link has expired, ask the sender to create a new one.
3. The sender opens the original table, clicks **Share** at the top, and sends the new URL.

---

## 2. SQL import fails or parses incompletely

### Symptoms
- The validation step shows "SQL parse failed" or a syntax error.
- Some columns, indexes, or grants are missing after import.

### Troubleshooting steps
1. Make sure **Source Database** in the import dialog matches the SQL dialect. For example, choose Oracle when you import an Oracle script.
2. Import only the `CREATE TABLE` statements first, and check that the table structure is recognized.
3. For long scripts or scripts with triggers or stored procedures, import them in parts to find the failing statement.
4. Remove client environment commands such as `USE database;` and `SET NAMES utf8mb4;`.

---

## 3. AI request failures (workshop, edit, review, explain)

### Symptoms
- **AI Table Workshop** reports that generation stopped or the request failed.
- **AI Review** or **Explain selection** does not respond or shows an error.

### Troubleshooting steps
1. If the network dropped briefly, refresh the page and try once more.
2. Do not ask for dozens of tables in one prompt. Generate the core columns of one table first, then add indexes, then adjust constraints, over several turns.
3. Click your avatar in the top right and open **Settings > Credits** to check your balance. When the balance is 0, AI features are unavailable and the app shows "You do not have enough credits to use AI right now".

---

## 4. Sign-in and workspace sync issues

### Symptoms
- Sign-in shows "Email not verified" or "Too many requests".
- The workspace sync status shows "Sync failed", "Network issue", or "Sync service unavailable".
- Signing out shows "Sign out was cancelled because cloud sync is not confirmed."

### Troubleshooting steps
1. If your email is not verified, enter the six-digit code from the email. You are signed in once verification succeeds. The code is valid for 10 minutes. If the email does not arrive, check your spam folder, or resend after the countdown ends. After you resend, use the latest code.
2. "Too many requests" means more than 10 sign-in attempts from the same IP within 15 minutes. Wait up to 15 minutes, then try again.
3. Check your network, then click the refresh icon next to the sync status at the top, or click **Retry sync** in **Settings > Workspace Sync**.
4. Sign-out is cancelled so that unsynced changes are not lost. Your local data is kept. Restore sync as in the previous step, wait until the status shows "Synced to cloud", then sign out again.

---

## 5. Clipboard copy fails

### Symptoms
Clicking **Copy DDL** or **Copy DCL** shows "Copy failed, please try again".

### Troubleshooting steps
1. Check the site permissions next to the address bar or in browser settings, and make sure clipboard writes are not blocked for this site.
2. In a remote desktop or a restricted company browser, select the SQL code in the generated output with the mouse and press `Ctrl+C` (or `Cmd+C`) to copy it.
