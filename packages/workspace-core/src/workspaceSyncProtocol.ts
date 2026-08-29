import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { WORKSPACE_SYNC_MESSAGE } from '@ddlbuilder/shared-types';

export type WorkspaceYDocMessageHeader =
  | { kind: 'sync'; requestId?: number }
  | { kind: 'persisted'; requestId: number }
  | { kind: 'unknown' };

export const encodeWorkspaceYDocSyncMessage = (write: (encoder: encoding.Encoder) => void) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, WORKSPACE_SYNC_MESSAGE.sync);
  write(encoder);
  return encoding.toUint8Array(encoder);
};

export const encodeWorkspaceYDocTrackedSyncMessage = (
  requestId: number,
  syncMessage: Uint8Array,
) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, WORKSPACE_SYNC_MESSAGE.syncWithAck);
  encoding.writeVarUint(encoder, requestId);
  encoding.writeUint8Array(encoder, syncMessage);
  return encoding.toUint8Array(encoder);
};

export const encodeWorkspaceYDocAcknowledgement = (requestId: number) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, WORKSPACE_SYNC_MESSAGE.persisted);
  encoding.writeVarUint(encoder, requestId);
  return encoding.toUint8Array(encoder);
};

export const readWorkspaceYDocMessageHeader = (
  decoder: decoding.Decoder,
): WorkspaceYDocMessageHeader => {
  const messageType = decoding.readVarUint(decoder);
  if (messageType === WORKSPACE_SYNC_MESSAGE.persisted) {
    return { kind: 'persisted', requestId: decoding.readVarUint(decoder) };
  }
  if (messageType === WORKSPACE_SYNC_MESSAGE.sync) return { kind: 'sync' };
  if (messageType !== WORKSPACE_SYNC_MESSAGE.syncWithAck) return { kind: 'unknown' };

  const requestId = decoding.readVarUint(decoder);
  return decoding.readVarUint(decoder) === WORKSPACE_SYNC_MESSAGE.sync
    ? { kind: 'sync', requestId }
    : { kind: 'unknown' };
};
