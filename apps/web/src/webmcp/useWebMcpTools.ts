import { useCallback, useEffect, useEffectEvent, useReducer, useRef } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSource } from '@ddlbuilder/shared-types/workspace';
import type {
  WebMcpApplyRequest,
  WebMcpAuthStatus,
  WebMcpChangeSet,
  WebMcpDialogModel,
} from './types';

interface UseWebMcpToolsInput {
  authStatus: WebMcpAuthStatus;
  openAuthDialog: () => void;
  hydrated: boolean;
  isShareView: boolean;
  source: WorkspaceSource;
  state: PersistedState;
  generatedSql: string;
  generatedDcl: string;
  getGeneratedOrm: () => string;
  replaceState: (state: PersistedState) => void;
}

type ConfirmationResolver = {
  resolve: (confirmed: boolean) => void;
  signal: AbortSignal;
  onAbort: () => void;
};

type WebMcpDialogState = {
  changeSet: WebMcpChangeSet | null;
  dialog: { mode: 'preview' | 'confirm'; request: WebMcpApplyRequest } | null;
};

type WebMcpDialogEvent =
  | { type: 'changeSetStaged'; changeSet: WebMcpChangeSet }
  | { type: 'confirmationRequested'; request: WebMcpApplyRequest }
  | { type: 'dialogClosed' }
  | { type: 'changeSetApplied' };

const initialDialogState: WebMcpDialogState = { changeSet: null, dialog: null };

function webMcpDialogReducer(
  state: WebMcpDialogState,
  event: WebMcpDialogEvent,
): WebMcpDialogState {
  switch (event.type) {
    case 'changeSetStaged':
      return {
        changeSet: event.changeSet,
        dialog: { mode: 'preview', request: { changeSet: event.changeSet } },
      };
    case 'confirmationRequested':
      return { ...state, dialog: { mode: 'confirm', request: event.request } };
    case 'dialogClosed':
      return { ...state, dialog: null };
    case 'changeSetApplied':
      return { ...state, changeSet: null };
  }
}

export function useWebMcpTools(input: UseWebMcpToolsInput): WebMcpDialogModel {
  const readSnapshot = useEffectEvent(() => input);
  const [{ changeSet, dialog }, dispatch] = useReducer(webMcpDialogReducer, initialDialogState);
  const changeSetRef = useRef<WebMcpChangeSet | null>(null);
  const confirmationRef = useRef<ConfirmationResolver | null>(null);
  const { authStatus, isShareView } = input;

  const settleConfirmation = useCallback((confirmed: boolean) => {
    const pending = confirmationRef.current;
    dispatch({ type: 'dialogClosed' });

    if (!pending) return;

    confirmationRef.current = null;
    pending.signal.removeEventListener('abort', pending.onAbort);
    pending.resolve(confirmed);
  }, []);

  const requestConfirmation = useCallback(
    (request: WebMcpApplyRequest, signal: AbortSignal) => {
      if (confirmationRef.current) {
        settleConfirmation(false);
      }

      dispatch({ type: 'confirmationRequested', request });

      return new Promise<boolean>((resolve) => {
        const onAbort = () => settleConfirmation(false);
        confirmationRef.current = { resolve, signal, onAbort };
        signal.addEventListener('abort', onAbort, { once: true });

        if (signal.aborted) onAbort();
      });
    },
    [settleConfirmation],
  );

  useEffect(() => {
    const modelContext = document.modelContext;

    if (!modelContext) return;
    const controller = new AbortController();

    void import('./webMcpRuntime').then(({ registerWebMcpTools }) => {
      if (controller.signal.aborted) return;

      registerWebMcpTools({
        modelContext,
        authStatus,
        isShareView,
        signal: controller.signal,
        readSnapshot,
        getPendingChangeSet: () => changeSetRef.current,
        setPendingChangeSet: (next) => {
          changeSetRef.current = next;
        },
        hasPendingConfirmation: () => confirmationRef.current !== null,
        onChangeSetStaged: (next) => dispatch({ type: 'changeSetStaged', changeSet: next }),
        onChangeSetApplied: () => dispatch({ type: 'changeSetApplied' }),
        requestConfirmation,
      });
    });

    return () => controller.abort();
  }, [authStatus, isShareView, requestConfirmation]);

  useEffect(
    () => () => {
      const pending = confirmationRef.current;

      if (pending) pending.resolve(false);
    },
    [],
  );

  const onCancel = useCallback(() => settleConfirmation(false), [settleConfirmation]);
  const onConfirm = useCallback(() => settleConfirmation(true), [settleConfirmation]);

  return {
    request: dialog?.request ?? (changeSet ? { changeSet } : null),
    mode: dialog?.mode ?? null,
    onConfirm,
    onCancel,
  };
}
