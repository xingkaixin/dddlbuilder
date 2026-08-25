# Changelog

## [0.21.0] - 2026-08-25
### Added
- **Japanese product and documentation support**: The application, AI-generated content, help links, and documentation site are now available in Japanese, with locale switching and localized search metadata.

### Improved
- **Safer workspace startup and migration**: Signed-in workspaces now wait for the local Y.Doc to load before editing begins, preventing startup edits from being overwritten. Legacy local data is promoted once per device and can recover safely from interrupted migrations.
- **More reliable workspace operations**: Batch imports, AI-applied schema changes, field removal, and entity updates commit atomically. Stable entity identities and stricter scope handling keep tabs, folders, trash, and the latest editor state consistent across reloads and synchronization.

### Fixed
- **SQL, DDL, and ORM output correctness**: Multi-table SQL parsing keeps fields with their owning tables, schema diffs preserve rename and property-change intent, and generated ORM relationships are valid for Prisma, TypeORM, SQLAlchemy, GORM, and JPA.
- **AI schema editing feedback**: The review panel now shows complete schema differences, validates generated changes before applying them, and avoids partially updating the current table when a change fails.
- **AI credit and budget settlement**: Interrupted requests can no longer leave credits permanently reserved. Settlement, refunds, and daily budget reservations converge to a terminal state without duplicate charges or refunds.

## [0.20.0] - 2026-07-26
### Added
- **ER relationship creation wizard**: Drag from a source field to a target field in the ER diagram, then confirm many-to-one or one-to-one cardinality, required or optional participation, update/delete actions, and index strategy. The system creates the foreign key, updates field nullability, and adds required indexes together.
- **Relationship safety validation**: The wizard references only single-column primary or unique keys on the target table and blocks duplicate relationships, duplicate constraint names, and invalid `SET NULL` configurations. A type mismatch is reported before creation.
- **Human verification for authentication**: When a deployment configures Cloudflare Turnstile, sign-in and sign-up validate a human-verification token to reduce automated registration and account API abuse.

### Improved
- **Full-width collapsed layout**: Collapsing the workspace sidebar or DDL output panel no longer leaves an empty rail. Expand controls move into the content area so table editing can use the full horizontal space.
- **Consistent form and overlay interactions**: Buttons, selects, checkboxes, tabs, dialogs, and menus now share a consistent interaction foundation, including reliable focus and pointer transitions between overlays. Drag handles and application icons also use one visual system.
- **Large-table and workspace performance**: Field editing avoids unrelated row renders, while index filtering and folder cleanup perform fewer repeated scans and writes. Editing remains steadier with many fields, indexes, or folders.
- **Workspace sync convergence**: Entity changes commit atomically, imports can be retried safely, and stale hydration work is cancelled, helping multi-device and weak-network sessions recover to a consistent state.

### Fixed
- **Empty-state and trash recovery**: Fixes cleared fields, indexes, or folders reappearing from stale state and local trash entries being lost during synchronization recovery.
- **Schema diff and change DDL**: Field renames are applied together with their property changes, duplicate or similar fields match deterministically, and dialect-specific constraint names and rollback statements are generated more accurately.
- **Field editing focus**: Fixes a double border around focused field inputs so selection and editing use one clear focus treatment.
- **Atomic AI credit settlement**: AI credit reservation, settlement, and refund operations are atomic, reducing duplicate charges or balance inconsistencies under concurrent requests.

### Deployment and security
- **D1 migration preflight**: Local Worker startup applies pending migrations automatically. Cloudflare deployment records a D1 recovery point, runs remote migrations, and verifies required tables before publishing to prevent missing-table failures after startup.
- **Request and session protection**: Account, admin, sharing, and AI endpoints enforce stronger request-size, rate, and session validation. AI response bodies are no longer written to logs, reducing exposure of sensitive content.

## [0.19.0] - 2026-05-06
### Added
- **Workspace Yjs checkpointing**: Real-time sync now compacts Yjs updates into server-side checkpoints, helping Durable Objects recover from a fuller workspace snapshot after cold starts or reconnects and reducing recovery cost after long editing sessions.
- **Sync status indicator**: The header now shows local saved, syncing, cloud synced, offline local saved, and sync failed states, with a retry action when sync fails.
- **Sync cost and health observability**: Worker structured logs now include D1 reads and writes, checkpoints, Durable Object connections, updates, and compaction metrics for tracking sync cost and health after release.

### Improved
- **Workspace real-time sync reliability**: WebSocket updates now support batching, connection timeout detection, online recovery refresh, and flush before leaving the page, helping weak-network and multi-device editing converge to the latest state.
- **Structured merge semantics**: Workspace Y.Doc now writes tables, fields, indexes, and folders as fine-grained structures. Applying remote snapshots preserves local edits and reduces the risk of field-level changes being overwritten by full-table snapshots.
- **Duplicate save control**: Table state comparison ignores default configuration and meaningless differences, reducing repeated local and cloud saves when state has not changed.
- **Documentation search visibility**: Documentation pages now include canonical and alternate hreflang links, and `llms.txt` uses extensionless documentation paths so search engines and AI tools can identify Chinese and English docs more reliably.

### Fixed
- **Local edit protection**: Fixes an issue where applying a remote Y.Doc snapshot could overwrite local edits that had not been flushed yet. Offline recovery and reconnect now refresh pending sync content proactively.
- **Development WebSocket sync**: The Vite dev server proxy now supports WebSocket, so workspace real-time sync can be verified directly in development and E2E environments.

## [0.18.0] - 2026-05-05
### Added
- **AI modify current table**: Supports adjusting the current table structure with natural language. AI generates reviewable table-level, field, and index changes based on the table name, fields, indexes, and database type; each change can be accepted or rejected before applying selected changes to the workspace.
- **AI index optimization advisor**: Supports pasting typical query SQL or slow query snippets. AI recommends missing indexes, redundant indexes, field order optimizations, and query rewrites based on current fields and existing indexes; recommended indexes can be added directly to index configuration.
- **Real-time workspace sync**: After signing in, drafts, saved tables, folders, and trash stay consistent through the real-time sync channel, making the latest workspace easier to recover after refresh, reopen, or sign-in on another device.
- **Incremental workspace sync and conflict notices**: The Settings page adds "Sync now" and conflict notices, allowing cloud changes to be pulled, local pending changes to be pushed, and version conflicts to be inspected.
- **Feedback entry**: Adds a feedback entry in the header toolbar for submitting issues and suggestions during use.
- **Multilingual sitemap**: Adds a documentation sitemap with hreflang metadata to help search engines identify Chinese and English documentation versions.

### Improved
- **AI schema editing experience**: AI generation is converted into a change list first and written into table configuration only after confirmation, making small-step edits safer on existing structures.
- **Workspace empty state**: When no tab is open, recent items and quick actions are shown for creating, importing, or loading an example table directly.
- **Settings layout**: Account, credits, and workspace sync content now scroll reliably in high-content scenarios, narrow screens, and full-height dialogs.
- **Table editing commit behavior**: Field table cells commit current edits when selection changes, reducing extra confirmation steps after editing.
- **Workspace loading feedback**: Shows a skeleton while tabs are loading to reduce visual jumps during sync or switching.

### Fixed
- **Workspace state sync stability**: Fixes stale synchronization that could occur after tab signatures changed, reducing incorrect state writes during save and switch flows.
- **Workspace snapshot writes**: Avoids repeated snapshot updates when state has not changed, reducing unnecessary local and cloud sync pressure.
- **Persistence cleanup flow**: Waits for persistence resources to be released during sign-out and scope changes, reducing errors caused by leftover connections.

## [0.17.0] - 2026-04-29
### Added
- **Multi-tab workspace**: Supports opening multiple tabs within the same workspace, each managing an independent table and draft state. Tabs support create, close, switch, and dirty-state indicators, with a save confirmation before closing unsaved changes.
- **Foreign key management and ER diagram**: Adds a foreign key configuration panel for visual table relationship setup, including cascade rules and constraint naming. The ER diagram viewer is upgraded to a React Flow-based implementation with draggable nodes, canvas zoom, and relationship line rendering.
- **ORM model generation**: In addition to DDL, adds ORM model generation for Prisma, TypeORM, SQLAlchemy, GORM, and JPA, making it easier to paste directly into business projects.
- **Batch data import**: Supports importing table structures from CSV, Excel, and JSON Schema files with automatic field name and type recognition. SQL batch import adds conflict detection and field merge strategies to reduce manual entry.
- **View DDL generation**: Adds a view configuration panel supporting SELECT query definition, field aliases, and permissions, automatically generating the corresponding CREATE VIEW statement for the target database.
- **Routine template DDL generation**: Adds routine template DDL generation for stored procedures, functions, and triggers.
- **Schema timeline playback**: Adds a visual timeline player to version history, allowing step-by-step playback of schema evolution from old to new states.
- **Schema lint panel**: Adds a built-in Schema Lint panel that automatically detects potential issues in table structure, fields, and index design based on naming conventions and type rules.
- **AI comment generation**: AI table generation and review now automatically generate Chinese business comments for tables and fields, reducing documentation effort.
- **Mock data generator**: Adds a mock data generator that automatically produces test data based on field types and constraints, with batch export support for development and testing.
- **Logical enum editor**: Fields support logical enum values with an inline editor for adding, deleting, reordering, and color-coding enum items. Enum metadata persists with drafts and saved tables.
- **Table blueprint templates**: Adds common business scenario table blueprints (e.g., user, order, log CRUD tables) that generate complete table structures with one click and can be applied directly to the current workspace.
- **Saved table trash**: Saved tables support soft deletion with a trash bin, single-item restore, and batch emptying. Drafts also support dirty-state indicators and trash management to reduce accidental deletion risk.
- **Workspace sidebar and multiple drafts**: Adds a workspace sidebar on the left for creating and managing multiple named drafts. Drafts and saved tables are displayed together in the drawer for clearer organization and retrieval.
- **Field type change risk detection**: When modifying an existing field type, the system warns about data compatibility risks (such as string truncation, precision loss, or implicit conversion failures) to prevent production incidents.
- **Index-aware storage estimation**: The storage capacity estimator now includes index volume in calculations, bringing total capacity estimates closer to actual physical disk usage.
- **Table-level storage options**: Adds fillfactor and Oracle-specific storage parameter configurations to adjust physical storage behavior per database type.
- **Collapsible output panel and compact layout**: The DDL output panel supports collapsing to free up editing space. The field configuration table adds a compact layout mode for higher information density on smaller screens.
- **Version history time filtering**: Adds a time-range filter to the version history dialog for quickly locating changes within a specific period.
- **SEO and sitemap improvements**: Improves page titles, descriptions, and search engine metadata. The documentation site adds automatic VitePress sitemap generation for better search visibility.

### Improved
- **Index panel UX upgrade**: Restructures the index configuration panel with clearer information hierarchy and fully internationalized labels and tooltips.
- **Unsaved change protection**: Prompts to save when loading another table or template while the current table has unsaved changes, preventing accidental loss.
- **Accessibility for index field suggestions**: Index field dropdown suggestions support keyboard up/down navigation and focus management for better keyboard efficiency.
- **Workspace empty state guidance**: Displays an empty state with quick actions when no tabs are open, allowing example tables to be loaded for a quick start.

### Fixed
- **Credit ledger date parsing**: Fixes parsing exceptions caused by invalid date boundaries in the credit ledger.
- **Empty tab sync guard**: Skips persistence sync when no tabs are open to avoid unnecessary writes and potential errors.
- **Duplicate tab initialization**: Prevents duplicate tab initialization during React Strict Mode double mounting to avoid state anomalies.
- **Drag-and-drop row sorting stability**: Persists drag-over state to fix occasional failures in field table row reordering.
- **Freeze columns default off**: Sets freeze columns to off by default to reduce initial interface complexity. Handles trash state correctly during save.

### Engineering
- **D1 migration ledger**: Adds a migration ledger and schema baseline to provide a traceable foundation for future database schema evolution.
- **Credit ledger pagination**: Credit consumption records support paginated loading and date-range filtering for more stable queries under large data volumes.

## [0.16.0] - 2026-04-17
### Added
- **User system**: Supports email-based sign-up and sign-in with email verification, password reset, and branded email templates. Data is bound to your account after signing in; anonymous local workspace remains available without signing in.
- **AI credit center**: AI table generation, DDL review, and SQL explanation now consume credits based on actual token usage. Current balance is shown in the header; the settings page provides a full usage history including reservations, settlement returns, and failure refunds.
- **Workspace cloud sync**: A new "Workspace Sync" tab in Settings supports manually uploading or downloading your local workspace (global draft, saved tables, and saved drafts) to/from the cloud, so you can recover after switching devices.
- **Cross-device folder sync**: Table folders created by signed-in users are included in workspace cloud sync, keeping your folder organization consistent across devices.
- **Anonymous workspace migration**: When signing in for the first time, the system prompts to migrate existing anonymous local data to your account. Name conflicts are automatically saved as copies without overwriting cloud content.
- **Admin console**: Adds an admin dashboard for user management and session overview.

### Engineering
- **Monorepo refactor**: The project is now organized as a pnpm workspace with Turborepo, splitting web, docs, worker, and shared packages for clearer builds and dependency management.

## [0.15.7] - 2026-04-03
### Added
- **SQL output format toggle**: Adds compact and aligned display modes to the DDL output panel. Copied SQL now stays consistent with the current preview, making it easier to paste readable statements into docs, reviews, and tickets.

### Improved
- **Cross-database column alignment**: The `CREATE TABLE` field list can now align column names and type or constraint segments across supported databases. Databases with inline column comments also align the `COMMENT` segment for better vertical readability.
- **Lighter format toggle UI**: Replaces the text switcher with an icon-only toolbar control and adds tooltips, making the format toggle easier to scan while taking less space.

## [0.15.6] - 2026-04-01
### Added
- **Table-level Schema Name configuration**: Adds an optional `Schema Name` input in table configuration. When schema separation is needed, DDL / DCL can now generate schema-qualified table names directly instead of requiring manual `schema.table` input in the table name field.

### Improved
- **Consistent schema handling across workflows**: AI table generation, SQL import, share links, drafts, and saved tables now preserve and restore schema information. Older data saved as `schema.table` is also split automatically into `Schema Name + Table Name` when loaded.

## [0.15.5] - 2026-03-17
### Added
- **Hive database support**: Adds support for Apache Hive database with partitioning, bucketing (CLUSTERED BY), and storage format options. Indexes tab is hidden for Hive databases as they are not applicable.
- **Storage estimator for Hive**: Adds Hive storage format support to the storage capacity estimator.

### Improved
- **SPA routing**: Enhances single-page application routing with proper fallback handling, ensuring client-side navigation works correctly.
- **API efficiency**: Disables thinking in API routes for faster response times.

## [0.15.4] - 2026-03-12
- Some minor updates

## [0.15.3] - 2026-03-10
### Fixed
- **SQL import works again in production**: Fixes a parsing failure when importing SQL on Vercel production deployments, preventing online environments from breaking due to module-loading errors.

## [0.15.2] - 2026-03-04
### Improved
- **Seasonal effects disabled by default**: The Chinese New Year fireworks entry and intro overlay are now turned off after the holiday, keeping the everyday workspace cleaner.


## [0.15.1] - 2026-02-27
### Improved
- **Consistent AI response language**: AI table generation, DDL explanation, and DDL review now consistently follow the current application language after locale switches.

## [0.15.0] - 2026-02-26
### Added
- **Documentation site launch**: Introduces a VitePress docs center with Chinese and English routes, including Basic Guide, Advanced Guide, FAQ, and release notes.
- **In-app docs entry**: Adds a `Docs` button in the top action area that opens locale-specific documentation.

### Improved
- **Docs path canonicalization**: Redirects `/docs` to `/docs/`, and auto-routes docs root by browser language.
- **Unified release-notes access**: Removes the in-app changelog modal and maintains release notes on the documentation site.

### Fixed
- **Drag-and-drop stability**: Fixes nested DnD context issues in the field table and template field table to prevent reorder anomalies.
- **i18n console noise**: Disables i18next support notices to reduce unnecessary console output.

## [0.14.0] - 2026-02-25
### Added
- **Drag-and-drop organization**: Supports drag-and-drop field reordering with DDL sync, plus drag-and-drop management for saved tables and folders.
- **Template editing upgrade**: Replaces custom template field editing with a sortable table and smoother apply/switch flow.
- **Enhanced sharing flow**: Adds loading states, duplicate-request prevention, auto-loading of shared copies, and version count tracking.
- **Theme and language expansion**: Adds dark theme, system theme following, smooth theme transition, and broader English UI/changelog coverage.

### Improved
- **Workspace persistence**: Migrates workspace state to IndexedDB and adds bootstrap caching for more reliable recovery after reload/reopen.
- **Table editing UX**: Improves cell selection/edit behavior and fixes first-character loss and paste interference in input/textarea scenarios.
- **Stronger schema linkage**: Field rename now propagates to indexes, partitioning, and sharding settings.
- **Better SQL import**: Enhances MySQL import for partition parsing, table-level misc options, and authorization object handling.
- **UI polish**: Improves searchable database selector, drawer/button interactions, feedback toasts, and loading skeletons.

### Stability & Security
- Adds OpenAI governance controls (rate limiting and daily budget) for more stable operation under load.
- Adds configurable CSP headers with environment-based controls for safer deployments.
- Expands unit and E2E coverage to strengthen regression safety on core workflows.

### Branding
- Refreshes favicon and logo assets.

## [0.13.1] - 2026-02-11
- Some minor updates

## [0.13.0] - 2026-02-10
### Added
- **Master Table Workshop**: Supports generating table structure drafts quickly with AI, reducing the initial cost of table design
- **Field Rename Detection**: Recognizes field “rename” scenarios during structural adjustments, reducing false positives of delete-and-recreate
- **Rollback Script Generation**: Supports generating rollback DDL to restore previous states more efficiently after changes
- **Enhanced SQL Import Parsing Validation**: Added server-side validation channel for more reliable import and parsing results

### Improved
- **Enhanced Table Editing Experience**: Upgraded data table editing core, clearer frozen column display and smoother operations
- **Faster Page Loading**: Import modal and SQL display modules now load on demand, improving open and switch performance
- **More Stable Master Responses**: Added retry and rate-limiting mechanisms to improve success rate during peak usage
- **Smoother Feedback Presentation**: Improved rendering flow for long text outputs and review results
- **Improved Maintainability**: Modularized application state and business logic for more stable future iterations

### Stability & Security
- Enhanced input validation and security policies to reduce risks from abnormal input
- Added unified exception fallback and reporting mechanism for clearer feedback on page errors
- Improved accessibility support, including keyboard navigation and screen reader experience
- Expanded automation and unit tests to strengthen regression coverage of core workflows

### Engineering & Maintenance
- Unified dependency management and test commands for clearer version maintenance and quality checks
- Continued improvement of evaluation and progress documentation for better version tracking

## [0.12.0] - 2026-02-06
### Added
- **Database Extensions**: Added DDL generation support for GaussDB, Kingbase, GBase, and PolarDB, with completed type mappings and strategy factory integration
- **SQL Import Upgrade**: Upgraded import workflow to a “Validate → Preview → Confirm” three-step process, supporting field preview and editing before import
- **Table-Level Misc Configuration**: Added table-level options panel to generate `ENGINE`, `CHARSET`, `COLLATION`, `TABLESPACE`, and other configurations per database
- **E2E Automated Testing**: Introduced Playwright framework covering core features, configuration panels, tooling capabilities, and storage management flows

### Improved
- Enhanced dialog accessibility and interaction experience, including `aria-label` additions and focus style optimization
- Vercel Analytics switched to lazy loading to reduce initial load overhead
- Adjusted E2E selectors and test configuration to improve automation stability
- Updated Vitest configuration to exclude E2E directory and avoid conflicts with unit tests
- Added freeze configuration for field settings table, allowing optional freezing and customizable freeze column count with default of three columns

### Testing & Maintenance
- Added and improved multi-module test cases to strengthen regression assurance
- Dependency updates including OpenAI, `@types/node`, `@types/react`, Biome, and others

## [0.11.0] - 2026-02-02
### Added
- **Field Template Management**: Supports CRUD operations for field templates, field ordering, and saving current table as template
- **Folder Management**: Supports folder grouping for saved tables with new UI components and database integration
- **Table Version History**: Supports version rollback and comparison with new dialog UI and IndexedDB version control
- **Table Diff Comparison**: Implements table structure diff and ALTER DDL generation with change review dialog
- **Review History**: Supports viewing historical review records
- **Apply Review Suggestions**: One-click application of review suggestions to current table configuration
- **SQL Explanation**: Provides AI-generated explanations for selected DDL statements
- **Storage Capacity Estimator**: Supports physical disk usage estimation for MySQL, PostgreSQL, TiDB, OceanBase and other major databases, including architecture notes and interactive capacity planning

### Improved
- Saved table list supports field count badges, database type icons, and real-time search filtering
- Improved tab switching animations and Toast notification styles
- Enhanced accessibility and structure of review history items, improved Explain modal event handling
- Improved JSON parsing logic to extract full string and object items from suggestion arrays

### Testing & Maintenance
- Added unit tests for hooks and utils, increasing coverage
- Dependency updates including React, OpenAI, Hono, Biome, Autoprefixer and others

## [0.10.0] - 2026-01-26
### Added
- Saved tables drawer accessible via “View Saved Tables”, supporting load, rename, delete, and current load state indicator
- Persisted saved tables to IndexedDB with deduplicated names and overwrite support for loaded tables

### Improved
- Switching between loaded and unchanged tables no longer prompts confirmation
- Added save entry and load or modification state indicator in table configuration area
- Reduced saved tables entry to lightweight access point with current table name displayed
- DDL review supports streaming rendering and partial JSON parsing for faster feedback
- Skeleton indicators shown during streaming review stage
- UI module lazy loading and rendering performance optimization

### Testing & Maintenance
- Added unit tests for savedTables, DDL Review, partial JSON, and IndexedDB
- Coverage increased above 80 percent
- Updated dependency versions including Biome and Vitest

## [0.9.0] - 2026-01-19
### Added “Master Review” Feature
- Added “Master Review” button in DDL output panel
- Professional AI-based review of generated DDL
- Evaluation across naming conventions, data types, index design, integrity constraints, scalability, and performance
- Provides comprehensive score from 1 to 10 with improvement suggestions

## [0.8.4] - 2026-01-15
- Some minor updates

## [0.8.3] - 2025-12-31
- Happy New Year

## [0.8.2] - 2025-12-29
- Some minor updates

## [0.8.1] - 2025-12-28
### Partition Configuration Enhancement
- Supports partition expressions for HASH, KEY, RANGE, LIST types such as `YEAR(col)` and `dayofmonth(col)`
- Quick RANGE partition generation with “By Year”, “By Month”, and “By Day” buttons

## [0.8.0] - 2025-12-27
### Added MySQL Partition Table Configuration
- Added “Partition Configuration” tab supporting MySQL, MariaDB, and TiDB
- Supports six partition types including RANGE, RANGE COLUMNS, LIST, LIST COLUMNS, HASH, and KEY
- Each partition type includes description to assist selection
- HASH and KEY partitions support configurable partition count
- RANGE and LIST partitions support custom partition definitions
- DDL automatically generates corresponding partition statements

## [0.7.0] - 2025-12-24
### Added Database Support
- Added **MariaDB** database type support
- Added **TiDB** database type support
- Added **Dameng** database type support
- Added **OceanBase** database support with MySQL mode and Oracle mode
- Added **PostgreSQL Citus** database type support

### Citus Sharding Configuration
- Added “Sharding Configuration” tab shown only when PostgreSQL Citus is selected
- Supports table modes including Reference Table and Distributed Table
- Distributed mode allows selection of sharding column
- DDL automatically generates `create_reference_table()` or `create_distributed_table()` statements

## [0.6.5] - 2025-12-19
- Fixed COMMENT parsing to support escaped single quotes and prevent truncated comments
- Oracle index names limited to 30 characters to avoid overflow
- Default values containing “default” treated as constants and properly quoted

## [0.6.4] - 2025-12-18
- Some minor updates

## [0.6.3] - 2025-12-17
- Some minor updates

## [0.6.2] - 2025-12-16
- Some minor updates

## [0.6.1] - 2025-12-15
- Some minor updates

## [0.6.0] - 2025-12-11
- Optimized index name display with automatic wrapping for long names
- Automatic index name truncation beyond 40 characters with hash suffix to ensure uniqueness
- Added double-click editing for index names with custom naming support

## [0.5.0] - 2025-11-27
- Removed field names from primary key naming
- Generated DDL now displays primary key naming
- Imported SQL primary keys follow unified system naming rules

## [0.4.1] - 2025-11-21
- Improved SQL import functionality
- Increased unit test coverage

## [0.4.0] - 2025-11-20
- Added **Share Link** feature to share table configuration via URL
- Added **Import SQL** feature to import table configuration from SQL
- Merged **Field Configuration**, **Index Configuration**, and **Privilege Configuration**
- Brand logo upgrade

## [0.3.0] - 2025-11-15
- Improved **Changelog** page styling
- New brand logo
- Major UI style upgrade

## [0.2.4] - 2025-11-12
- Oracle generated DDL now includes synonym creation

## [0.2.3] - 2025-11-09
- Adjusted interface colors to warmer tones
- “Nullable” column supports YN and yn paste values
- Fixed issue where “Add Row” could only add one row
- Improved warning prompts for duplicate field names or reserved keywords

## [0.2.2] - 2025-11-03
- Fix: `mysql` `timestamp` field cannot configure update strategy when default type is current time

## [0.2.1] - 2025-11-03
- Fix: partial failure of **Clear All** button

## [0.2.0] - 2025-11-02
- UI style adjustment

## [0.1.0] - 2025-10-28
- Code refactoring

## [0.0.5] - 2025-10-25

### Added
- Automatically update index names when table name changes

### Fixed
- Corrected MySQL timestamp precision
- Corrected Oracle default constraint order

## [0.0.4] - 2025-10-24

### Added
- Primary key support with unique constraint index configuration (fix #1)
- UUID default value support for character type fields (fix #2)

### Refactored
- Moved clear button to left configuration panel (fix #3)

## [0.0.3] - 2025-10-18

### Added
- Collapsible index and privilege configuration
- Persistent index configuration

### Refactored
- Modernized project configuration

### Testing
- 100 percent coverage for core functionality

## [0.0.2] - 2025-10-16

### Added
- Field default values and update strategies
- Field name validation including duplicates and keyword highlighting
- Batch row addition
- Oracle support
- DDL copy button
- Local persistence

### Improved
- DDL readability and interaction
- UI theme with white background
- Simplified table columns

### Documentation
- Rewritten README
- Added project overview, features, and usage instructions
- Improved type mapping and DDL generation notes

## [0.0.1] - 2025-10-15

### Birth
- Table Craftsman: A web tool for designing database table structures and generating DDL
- Supports MySQL, PostgreSQL, SQL Server
