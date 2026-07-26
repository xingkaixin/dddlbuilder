# Workspace core owns shared behavior

Canonical Workspace content hashing and Workspace Document snapshot encoding live in
`@ddlbuilder/workspace-core`, with Web and Worker depending on that module. Shared types remain
data-only, while runtime-specific persistence and UI mutations stay in their owning applications;
this prevents protocol drift without turning the shared boundary into a broad service layer.
