---
title: "DDLBuilder ChangeLog"
description: "DDL Table Creation Tool Version Update Log"
---

# DDLBuilder
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
