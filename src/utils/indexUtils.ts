import type { IndexDefinition } from "../types";
import { toStringSafe } from "./helpers";

export const sanitizeIndexesForPersist = (
  indexes: IndexDefinition[]
): IndexDefinition[] =>
  indexes
    .map((index) => ({
      id: index.id,
      name: toStringSafe(index.name).trim(),
      fields: index.fields.map((field) => ({
        name: toStringSafe(field.name).trim(),
        direction:
          field.direction === "ASC" || field.direction === "DESC"
            ? field.direction
            : "ASC",
      })),
      unique: Boolean(index.unique),
      isPrimary: Boolean(index.isPrimary),
    }))
    .filter((index) => index.name && index.fields.length > 0);