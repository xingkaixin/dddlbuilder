import { decodeSavedDraftBase } from '@ddlbuilder/workspace-core';

export {
  buildSchemaStateSignature as serializePersistedStateForComparison,
  normalizeSchemaStateForSignature as normalizePersistedStateForSignature,
} from '@ddlbuilder/workspace-core';

export const normalizePersistedStateSignature = (signature: string) =>
  decodeSavedDraftBase({ baseSignature: signature }).baseSignature;
