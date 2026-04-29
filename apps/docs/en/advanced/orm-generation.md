# ORM Model Generation

## Who this is for

For users who need to translate table structures directly into ORM model code for business projects.

## What this solves

You don't need to manually translate between DDL and ORM models; the system can generate model code for the target framework directly, reducing duplicate work and type inconsistency risks.

## Prerequisites

- The current table has completed field configuration, and DDL has been generated on the right.
- The ORM framework used by the business project is already identified.

## Steps

1. Click the `ORM` tab in the right output area. Result: a framework selector and generated code appear.
2. Switch the target in the framework selector (Prisma, TypeORM, SQLAlchemy, GORM, JPA). Result: code refreshes in real time according to that framework's syntax.
3. Check field type mappings, primary key definitions, and index annotations in the generated result. Result: type mappings follow each framework's conventions, such as `varchar` → Prisma's `String`, TypeORM's `varchar`, JPA's `@Column`, etc.
4. Click `Copy ORM`. Result: code is copied to clipboard, ready to paste into the business project.

## Supported frameworks and mapping highlights

| Framework | File Format | Typical Mapping |
|---|---|---|
| Prisma | `.prisma` schema | `String`, `Int`, `DateTime`, `@id`, `@index` |
| TypeORM | TypeScript decorators | `@Entity()`, `@Column()`, `@PrimaryGeneratedColumn()` |
| SQLAlchemy | Python class | `Column()`, `Integer()`, `String()`, `relationship()` |
| GORM | Go struct | `gorm.Model`, tag-style `gorm:"column;type"` |
| JPA | Java annotations | `@Entity`, `@Table`, `@Id`, `@Column`, `@Index` |

## Done when

- ORM code has been successfully copied to clipboard.
- Field types, primary keys, and indexes are expressed in the ORM code.
- After pasting into the business project, it can compile/run directly without large-scale adjustments.

## Common pitfalls

- ORM generation is based on current table structure snapshot; field changes require re-copying, not automatically synced.
- Complex relationships in some frameworks (such as many-to-many intermediate tables) may require additional manual adjustments.
- Enum types vary greatly across ORMs (e.g., Prisma enum vs JPA `@Enumerated`); review after generation is recommended.
- `Schema Name` is mapped to schema/database configuration in some frameworks, but actual effect depends on the ORM's own data source configuration.
