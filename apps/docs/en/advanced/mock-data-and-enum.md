# Mock Data and Logical Enums

## Who this is for

For users who need to quickly generate test data, or want to unify field value specifications visually.

## What this solves

Mock data helps quickly populate structurally compliant data during development and testing; logical enums make field value specifications visible, reducing understanding deviation during team collaboration.

## Prerequisites

- The current table has completed field configuration.
- Mock data generation requires clear target row count and export format.

## Steps

### Mock Data Generation

1. Click `Mock Data` in the table configuration area or field configuration toolbar. Result: the Mock Data generation dialog opens.
2. Set target row count (e.g., 100, 1000). Result: the system generates corresponding random data by field type.
3. Check generation preview and confirm string length, numeric range, and date format meet expectations. Result: if deviation is large, return to field configuration to adjust defaults or types, then regenerate.
4. Select export format (such as SQL INSERT, CSV, JSON). Result: data is exported in batch, ready to import into test databases or pass to testing colleagues.

### Logical Enum Configuration

1. Find the target field in the field configuration table and expand the `Enum` editor. Result: the enum item management panel appears.
2. Click `Add Enum Item`, enter the enum value and display name. Result: the enum list gains one item.
3. Select a color identifier for the enum item. Result: different enum values are distinguished by different colors on the interface for quick identification.
4. Drag enum items to adjust order. Result: order is persisted to drafts and saved tables.
5. When filling field comments, you can note the field's enum specification. Result: team collaboration becomes easier to understand value meanings.

## Done when

- Mock data has been exported in correct format and is ready for testing.
- Enum items cover all valid business values, with intuitive color identifiers.
- Enum metadata has been saved with the table and remains valid after reload.

## Common pitfalls

- Mock data is randomly generated and does not represent real business distribution; for sensitive fields (such as phone numbers, IDs), secondary processing with masking rules is recommended.
- After enum values are modified, previously generated mock data does not update automatically; regeneration is required.
- Not all database types natively support enum types; the system expresses enum specifications via comments or constraints in DDL, with actual effect depending on the target database.
- Enum colors are for interface display only and are not written into DDL.
