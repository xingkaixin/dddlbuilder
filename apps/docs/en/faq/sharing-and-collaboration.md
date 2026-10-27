# Sharing and collaboration

This page answers common questions about share links, editable copies, and drafts.

---

## 1. Why is a shared schema page read-only?

- A share link opens a read-only snapshot. Recipients cannot edit it directly, and the sender's original table does not change.
- To make changes:
  1. Click **Save as copy and edit** in the banner at the top of the shared page.
  2. DDLBuilder saves the table structure as a copy in your workspace, returns to the home page, and loads the copy.
  3. The copy is independent of the original share link. Editing it, saving it, or generating new DDL from it does not affect the original link.

---

## 2. Why does opening a share link redirect to the home page?

- Share links are valid for 7 days and expire automatically after that.
- Chat apps can wrap or cut off long URLs. If the share ID at the end of the link is incomplete, the page reports that the link does not exist and returns to the home page.
- Ask the sender to reopen the original table, click **Share** to create a new URL, and copy the full URL.

---

## 3. Why does clicking "Share" several times return the same URL?

- The browser remembers the most recent share link and the signature of the table structure at that time. When you click **Share** again, if the structure signature is the same and the link has not expired, DDLBuilder copies that link again and says it reused an existing link. It does not create a new share.
- To get a new link, change the table structure first (for example, add a column or update a comment), then click **Share** again.

---

## 4. How do Drafts differ from Saved Tables in team workflows?

| Aspect | Drafts | Saved Tables |
|---|---|---|
| **Purpose** | Auto-saved working designs that are still changing | Tables you named and saved yourself |
| **History** | Only the latest state, no version comparison | Each save creates a snapshot, with version history and timeline replay |
| **Organization** | Listed in the drafts list in the sidebar | You can create folders in the sidebar and drag tables into them |
| **Sharing** | Save as a named table before sharing | Create a read-only share link at any time for team review |
