# Workspace core owns shared behavior

The Workspace Document model, its encoding and validation, sync frames, snapshot merging, decoding
of historical persisted data and canonical content hashing live in `@ddlbuilder/workspace-core`,
with Web and Worker depending on that module. `@ddlbuilder/shared-types` owns value types, API
contract schemas and context-free value normalization. Runtime-specific persistence and UI
interactions stay in their owning applications; this prevents protocol drift without turning the
shared boundary into a broad service layer.
