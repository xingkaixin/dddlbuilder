import { decodeSavedDraftBase } from '@ddlbuilder/workspace-core';

export {
  buildPersistedStateSignature,
  buildSchemaStateSignature,
  normalizePersistedStateForSignature,
  normalizeSchemaStateForSignature,
} from '@ddlbuilder/workspace-core';

export const normalizeSchemaStateSignature = (signature: string) =>
  decodeSavedDraftBase({ baseSignature: signature }).baseSignature;
