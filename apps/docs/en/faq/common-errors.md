# Errors and Failure Handling

## Share link unavailable

### Symptoms

After opening a share link, you see "Share link not found or expired" and are redirected to home.

### Quick checks

- Whether the link is older than 7 days.
- Whether the link is truncated or contains extra characters.

### Steps

1. Copy the full original link and open it again. Result: this rules out link truncation by chat tools.
2. If it still fails, go back to the current table and click `Share` again. Result: the system generates a valid link and copies it to clipboard.
3. Send the new link to collaborators and ask them to retry. Result: most expiration or invalidation issues are resolved.

### If still unresolved

First open the new link yourself under the same network environment. If it also fails locally, contact product support with time and page message details.

## SQL import failed or abnormal result

### Symptoms

- "SQL parse failed" appears during validation.
- After import, fields, indexes, or grantees are incomplete.

### Quick checks

- Whether SQL is empty or too long.
- Whether `Source Database` matches the SQL dialect.

### Steps

1. In the import dialog, confirm `Source Database` is correct. Result: the system re-parses with the target dialect.
2. Import the core `CREATE TABLE` statement first. Result: the main structure is recognized first.
3. Then append `CREATE INDEX`, `ALTER TABLE`, and `GRANT` step by step. Result: you can quickly locate which segment triggers the issue.
4. If SQL is very long, split it and import in batches. Result: this avoids validation failures from oversized text.

### If still unresolved

Keep a minimal reproducible SQL segment and selected database type, then submit to product support.

## AI request failed (generate, review, explain)

### Symptoms

- AI Table Workshop generation fails.
- AI Review fails.
- Explain selection fails.

### Quick checks

- Whether this is short-term network jitter.
- Whether AI requests are triggered too frequently in a short period.

### Steps

1. Refresh the page and retry the same action once. Result: this rules out temporary session anomalies.
2. Split one long request into multiple short requests. Result: success rate is usually higher.
3. Retry outside peak hours. Result: this reduces failures caused by service congestion.

### If still unresolved

Record failed action name (generate/review/explain) and trigger time, then contact product support.

## Sign-in or sync failed

### Symptoms

- Sign-in shows "Email not verified", "Invalid email or password", or "Too many requests".
- Workspace sync shows "Sync failed".
- AI features show "Insufficient credits".

### Quick checks

- Whether the email and password are correct.
- Whether the current network is stable.
- Whether sign-in or sync was attempted too many times in a short period.

### Steps

1. Double-check the email and password, then retry. Result: this rules out input errors.
2. If "Email not verified" appears, check your inbox (including spam) and click the verification link. Result: you can sign in normally after verification.
3. If "Too many requests" appears, wait 1–2 minutes and retry. Result: this bypasses rate-limiting protection.
4. When sync fails, refresh the page to confirm you are still signed in, then retry upload or download. Result: this rules out expired sessions.
5. If AI features report insufficient credits, open Settings and check the Credit tab for usage history. Result: you can confirm the balance and breakdown; recharge when the channel opens.

### If still unresolved

Record the exact error message, operation time, and network environment, then contact product support.

## Copy failed

### Symptoms

After clicking `Copy DDL` or `Copy DCL`, you see "Copy failed, please try again".

### Quick checks

- Whether clipboard permission is blocked in current browser.
- Whether you are in a restricted environment (remote desktop or managed browser policy).

### Steps

1. Retry the copy button once. Result: this rules out occasional failure.
2. If it still fails, manually select SQL text on the right and use system copy shortcuts. Result: delivery continues without blocking the process.
3. If necessary, switch to a commonly used browser and copy again. Result: this avoids policy restrictions in the current browser.

### If still unresolved

Confirm whether your work environment restricts clipboard access, and contact local IT administration if needed.
