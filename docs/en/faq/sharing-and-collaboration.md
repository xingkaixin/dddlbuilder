# Sharing and Collaboration

## Why shared pages cannot be edited directly

### Symptoms

After opening a share link, the page shows a read-only prompt and field configuration cannot be edited directly.

### Quick checks

Whether the top page shows the "share link is read-only" banner.

### Steps

1. Click `Save as copy and edit` in the banner. Result: the system saves a copy and returns to home.
2. Continue editing the copied table on home. Result: you are now in editable state without changing the original shared view.

### If still unresolved

Confirm you clicked `Save as copy and edit` inside the shared page, not browser back navigation.

## How to enter editable state from a shared page

### Symptoms

You need to continue design based on shared content, but the current page is read-only.

### Quick checks

Whether the page shows the status "Current: Shared copy (read-only)".

### Steps

1. On the shared page, click `Save as copy and edit`. Result: the system creates an editable copy.
2. Wait for automatic redirection to home. Result: workspace loads the copy and you can continue editing and saving.

### If still unresolved

If auto-redirect does not happen, refresh home and find the newly created copy in `Saved Tables`.

## Why opening a share link redirects to home

### Symptoms

After opening a share link, it redirects to home and shows "Share link not found or expired" or "Load failed".

### Quick checks

- Whether the link is beyond the 7-day validity period.
- Whether the link was truncated or manually modified.

### Steps

1. Ask the sender to regenerate and resend a new link. Result: this avoids old-link expiration.
2. Copy the full link into browser address bar and open it. Result: this avoids parameter truncation by chat tools.

### If still unresolved

Ask the sender to verify the new link in their own environment first, then forward it to collaborators.

## Why repeated sharing returns the same link

### Symptoms

When clicking `Share` multiple times without content changes, the generated link is identical.

### Quick checks

Whether current table configuration is exactly the same as the last shared state.

### Steps

1. Confirm whether current configuration has actually changed. Result: if unchanged, link reuse is expected behavior.
2. If a new link is required, make one valid change first, then share again. Result: the system generates a link for the new state.

### If still unresolved

Confirm whether current link is still within the 7-day validity period. If expired, reshare.

## What is the difference between Draft box and Saved Tables

### Symptoms

You believe the table was already "saved", but cannot find a named table in the list.

### Quick checks

- Whether you are currently in Draft box.
- Whether "Save current table" was executed with a name.

### Steps

1. Check workspace status tag and confirm whether it is `Draft box` or a loaded table. Result: current data ownership is clear.
2. Click save at key milestones and provide a name. Result: the table enters `Saved Tables` for reliable collaborative loading.

### If still unresolved

Search by table name in `Saved Tables` and confirm this is not caused by naming mismatch.
