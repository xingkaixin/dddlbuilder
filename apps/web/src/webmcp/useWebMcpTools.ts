import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { diffPersistedState, generateAlterDDL, generateRollbackDDL } from '@ddlbuilder/ddl-core';
import { isDatabaseType, type PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSource } from '@ddlbuilder/shared-types/workspace';
import { buildWorkspaceContentHash } from '@ddlbuilder/workspace-core';
import { buildNormalizedFields } from '@/stores';
import { requestSqlParse } from '@/services/sqlParseService';
import { convertParsedResultToPersistedState } from '@/utils/convertParsedResultToPersistedState';
import { preserveImportedFieldIds } from '@/utils/importedFieldIdentity';
import { lintSchema, type SchemaLintIssue } from '@/utils/schemaLint';
import { normalizeSchemaStateForSignature } from '@/utils/persistedStateSignature';
import { applySchemaPatchOperations, parseSchemaPatchOperations } from './schemaPatch';
import { createWebMcpTools, WebMcpToolError } from './tools';
import {
  summarizeChangeSet,
  type WebMcpApplyRequest,
  type WebMcpAuthStatus,
  type WebMcpChangeSet,
  type WebMcpChangeSource,
  type WebMcpDialogModel,
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
  generatedOrm: string;
  replaceState: (state: PersistedState) => void;
}

interface RuntimeSnapshot extends UseWebMcpToolsInput {}

type ConfirmationResolver = {
  resolve: (confirmed: boolean) => void;
  signal: AbortSignal;
  onAbort: () => void;
};

const MAX_PAGE_SIZE = 50;
const MAX_OUTPUT_CHARS = 1200;

const requireString = (input: Record<string, unknown>, key: string) => {
  const value = input[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WebMcpToolError('INVALID_INPUT', `${key} is required`);
  }
  return value.trim();
};

const readInteger = (
  input: Record<string, unknown>,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  const value = input[key];
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new WebMcpToolError('INVALID_INPUT', `${key} is outside the supported range`);
  }
  return value as number;
};

const buildSignature = (state: PersistedState) =>
  buildWorkspaceContentHash(normalizeSchemaStateForSignature(state));

const applyPatchOperations = (state: PersistedState, operations: WebMcpChangeSet['operations']) => {
  if (!operations) throw new WebMcpToolError('INVALID_INPUT', 'Operations are required');
  try {
    return applySchemaPatchOperations(state, operations);
  } catch (error) {
    if (error instanceof Error) {
      throw new WebMcpToolError('INVALID_INPUT', error.message);
    }
    throw error;
  }
};

const lintState = (state: PersistedState): SchemaLintIssue[] =>
  lintSchema({
    tableName: state.tableName,
    rows: state.rows,
    indexes: state.indexes,
    foreignKeys: state.foreignKeys,
    mysqlPartitionConfig: state.mysqlPartitionConfig,
    citusShardingConfig: state.citusShardingConfig,
    tableMiscConfig: state.tableMiscConfig,
  });

const assertReady = (snapshot: RuntimeSnapshot) => {
  if (!snapshot.hydrated) throw new WebMcpToolError('NOT_READY', 'Workspace is still loading');
};

const assertMutable = (snapshot: RuntimeSnapshot) => {
  assertReady(snapshot);
  if (snapshot.isShareView) {
    throw new WebMcpToolError('READ_ONLY', 'Shared workspaces are read-only');
  }
};

const page = <T>(values: T[], offset: number, limit: number) => ({
  items: values.slice(offset, offset + limit),
  total: values.length,
  nextOffset: offset + limit < values.length ? offset + limit : null,
});

export function useWebMcpTools(input: UseWebMcpToolsInput): WebMcpDialogModel {
  const snapshotRef = useRef<RuntimeSnapshot>(input);
  useLayoutEffect(() => {
    snapshotRef.current = input;
  }, [input]);
  const [changeSet, setChangeSet] = useState<WebMcpChangeSet | null>(null);
  const changeSetRef = useRef<WebMcpChangeSet | null>(null);
  const [dialogRequest, setDialogRequest] = useState<WebMcpApplyRequest | null>(null);
  const [dialogMode, setDialogMode] = useState<'preview' | 'confirm' | null>(null);
  const confirmationRef = useRef<ConfirmationResolver | null>(null);

  const storeChangeSet = useCallback((next: WebMcpChangeSet) => {
    changeSetRef.current = next;
    setChangeSet(next);
    setDialogRequest({ changeSet: next });
    setDialogMode('preview');
  }, []);

  const stageCandidate = useCallback(
    async (
      source: WebMcpChangeSource,
      requestedSignature: string,
      candidateState: PersistedState,
      operations?: WebMcpChangeSet['operations'],
    ) => {
      const snapshot = snapshotRef.current;
      assertMutable(snapshot);
      if (confirmationRef.current) {
        throw new WebMcpToolError('BUSY', 'Another change set is awaiting user confirmation');
      }
      const currentSignature = await buildSignature(snapshot.state);
      if (snapshotRef.current.state !== snapshot.state) {
        throw new WebMcpToolError(
          'CONFLICT',
          'The active document changed. Inspect it again before proposing changes.',
        );
      }
      if (requestedSignature !== currentSignature) {
        throw new WebMcpToolError(
          'CONFLICT',
          'The active document changed. Inspect it again before proposing changes.',
        );
      }
      const diff = diffPersistedState(snapshot.state, candidateState);
      if (!diff.hasChanges) throw new WebMcpToolError('NO_CHANGES', 'The proposal changes nothing');
      const issues = lintState(candidateState);
      const next: WebMcpChangeSet = {
        id: crypto.randomUUID(),
        source,
        baseSignature: currentSignature,
        baseState: structuredClone(snapshot.state),
        candidateState,
        diff,
        issues,
        operations,
        createdAt: Date.now(),
      };
      storeChangeSet(next);
      return {
        ok: true,
        status: 'preview_ready',
        changeSetId: next.id,
        source,
        summary: summarizeChangeSet(diff, issues),
        operationIds: operations?.map((operation) => operation.id) ?? [],
      };
    },
    [storeChangeSet],
  );

  const settleConfirmation = useCallback((confirmed: boolean) => {
    const pending = confirmationRef.current;
    if (!pending) {
      setDialogRequest(null);
      setDialogMode(null);
      return;
    }
    confirmationRef.current = null;
    pending.signal.removeEventListener('abort', pending.onAbort);
    setDialogRequest(null);
    setDialogMode(null);
    pending.resolve(confirmed);
  }, []);

  const requestConfirmation = useCallback(
    (request: WebMcpApplyRequest, signal: AbortSignal) => {
      if (confirmationRef.current) {
        settleConfirmation(false);
      }
      setDialogRequest(request);
      setDialogMode('confirm');
      return new Promise<boolean>((resolve) => {
        const onAbort = () => settleConfirmation(false);
        confirmationRef.current = { resolve, signal, onAbort };
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) onAbort();
      });
    },
    [settleConfirmation],
  );

  const inspectSchema = useCallback(async (toolInput: Record<string, unknown>) => {
    const snapshot = snapshotRef.current;
    assertReady(snapshot);
    const section = typeof toolInput.section === 'string' ? toolInput.section : 'overview';
    const offset = readInteger(toolInput, 'offset', 0, 0, Number.MAX_SAFE_INTEGER);
    const limit = readInteger(toolInput, 'limit', 20, 1, MAX_PAGE_SIZE);
    const state = snapshot.state;
    const baseSignature = await buildSignature(state);
    const base = { ok: true, section, baseSignature };

    if (section === 'overview') {
      return {
        ...base,
        document: {
          source:
            snapshot.source.kind === 'draft'
              ? { kind: 'draft', draftId: snapshot.source.draftId }
              : {
                  kind: 'saved_table',
                  normalizedName: snapshot.source.normalizedName,
                  tableId: snapshot.source.tableId,
                },
          readOnly: snapshot.isShareView,
          objectType: state.objectType ?? 'table',
          schemaName: state.schemaName,
          tableName: state.tableName,
          tableComment: state.tableComment,
          dbType: state.dbType,
          fieldCount: state.rows.filter((row) => row.fieldName.trim()).length,
          indexCount: state.indexes.length,
          foreignKeyCount: state.foreignKeys?.length ?? 0,
        },
      };
    }
    if (section === 'fields') {
      const fields = state.rows
        .filter((row) => row.fieldName.trim())
        .map((row) => ({
          id: row.id,
          fieldName: row.fieldName,
          fieldType: row.fieldType,
          fieldComment: row.fieldComment,
          nullable: row.nullable,
          defaultKind: row.defaultKind ?? 'none',
          defaultValue: row.defaultValue ?? '',
          onUpdate: row.onUpdate ?? 'none',
        }));
      return { ...base, ...page(fields, offset, limit) };
    }
    if (section === 'indexes') return { ...base, ...page(state.indexes, offset, limit) };
    if (section === 'relations') {
      return {
        ...base,
        ...page(state.foreignKeys ?? [], offset, limit),
        authObjects: state.authObjects,
      };
    }
    if (section === 'options') {
      return {
        ...base,
        mysqlPartitionConfig: state.mysqlPartitionConfig,
        citusShardingConfig: state.citusShardingConfig,
        tableMiscConfig: state.tableMiscConfig,
      };
    }
    throw new WebMcpToolError('INVALID_INPUT', `Unsupported section: ${section}`);
  }, []);

  const readOutput = useCallback((toolInput: Record<string, unknown>) => {
    const snapshot = snapshotRef.current;
    assertReady(snapshot);
    const kind = requireString(toolInput, 'kind');
    const offset = readInteger(toolInput, 'offset', 0, 0, Number.MAX_SAFE_INTEGER);
    const maxChars = readInteger(toolInput, 'maxChars', MAX_OUTPUT_CHARS, 1, MAX_OUTPUT_CHARS);
    const pending = changeSetRef.current;
    let content = '';
    if (kind === 'ddl') content = snapshot.generatedSql;
    else if (kind === 'dcl') content = snapshot.generatedDcl;
    else if (kind === 'orm') content = snapshot.generatedOrm;
    else if (kind === 'alter' || kind === 'rollback') {
      if (!pending) throw new WebMcpToolError('NOT_FOUND', 'No staged change set is available');
      const fields = buildNormalizedFields(pending.candidateState.rows);
      content =
        kind === 'alter'
          ? generateAlterDDL(
              pending.candidateState.tableName,
              pending.diff,
              fields,
              pending.candidateState.dbType,
            )
          : generateRollbackDDL(
              pending.candidateState.tableName,
              pending.diff,
              fields,
              pending.candidateState.dbType,
            );
    } else {
      throw new WebMcpToolError('INVALID_INPUT', `Unsupported output kind: ${kind}`);
    }
    return {
      ok: true,
      kind,
      content: content.slice(offset, offset + maxChars),
      offset,
      totalChars: content.length,
      nextOffset: offset + maxChars < content.length ? offset + maxChars : null,
    };
  }, []);

  const dependencies = useMemo(
    () => ({
      authStatus: input.authStatus,
      readOnly: input.isShareView,
      getAuthStatus: () => {
        const snapshot = snapshotRef.current;
        return {
          ok: true,
          status: snapshot.authStatus,
          anonymousCapabilities: ['edit_local_draft', 'import_sql', 'lint_schema', 'read_output'],
          signedInCapabilities: ['cloud_sync', 'saved_tables', 'paid_ai'],
        };
      },
      startSignIn: () => {
        const snapshot = snapshotRef.current;
        if (snapshot.authStatus === 'signed_in') return { ok: true, status: 'already_signed_in' };
        snapshot.openAuthDialog();
        return { ok: true, status: 'user_action_required' };
      },
      inspectSchema,
      lintSchema: () => {
        const snapshot = snapshotRef.current;
        assertReady(snapshot);
        const issues = lintState(snapshot.state);
        return {
          ok: true,
          counts: {
            errors: issues.filter((issue) => issue.severity === 'error').length,
            warnings: issues.filter((issue) => issue.severity === 'warning').length,
            suggestions: issues.filter((issue) => issue.severity === 'suggestion').length,
          },
          issues: issues.slice(0, 20),
          truncated: issues.length > 20,
        };
      },
      readOutput,
      previewPatch: async (toolInput: Record<string, unknown>) => {
        const snapshot = snapshotRef.current;
        assertMutable(snapshot);
        const baseSignature = requireString(toolInput, 'baseSignature');
        let operations: WebMcpChangeSet['operations'];
        try {
          operations = parseSchemaPatchOperations(toolInput.operations);
        } catch (error) {
          if (error instanceof Error) {
            throw new WebMcpToolError('INVALID_INPUT', error.message);
          }
          throw error;
        }
        const candidate = applyPatchOperations(snapshot.state, operations);
        return stageCandidate('schema_patch', baseSignature, candidate, operations);
      },
      previewSqlImport: async (toolInput: Record<string, unknown>) => {
        const snapshot = snapshotRef.current;
        assertMutable(snapshot);
        const baseSignature = requireString(toolInput, 'baseSignature');
        const sql = requireString(toolInput, 'sql');
        if (sql.length > 50_000) throw new WebMcpToolError('INVALID_INPUT', 'SQL is too long');
        const dbType = toolInput.dbType;
        if (!isDatabaseType(dbType)) {
          throw new WebMcpToolError('INVALID_INPUT', 'Unsupported database type');
        }
        const parsed = await requestSqlParse({ sql, dbType });
        const candidate = preserveImportedFieldIds(
          snapshot.state,
          convertParsedResultToPersistedState(parsed, dbType),
        );
        return stageCandidate('sql_import', baseSignature, candidate);
      },
      applyPatch: async (toolInput: Record<string, unknown>, signal: AbortSignal) => {
        const snapshot = snapshotRef.current;
        assertMutable(snapshot);
        const id = requireString(toolInput, 'changeSetId');
        const pending = changeSetRef.current;
        if (!pending || pending.id !== id) {
          throw new WebMcpToolError('NOT_FOUND', 'The staged change set is no longer available');
        }
        const rawOperationIds = toolInput.operationIds;
        if (rawOperationIds !== undefined && !Array.isArray(rawOperationIds)) {
          throw new WebMcpToolError('INVALID_INPUT', 'operationIds must be an array');
        }
        const operationIds = rawOperationIds?.map((value) => {
          if (typeof value !== 'string') {
            throw new WebMcpToolError('INVALID_INPUT', 'operationIds must contain strings');
          }
          return value;
        });
        if (operationIds && pending.source !== 'schema_patch') {
          throw new WebMcpToolError('INVALID_INPUT', 'SQL imports must be applied as a whole');
        }
        let requestChangeSet = pending;
        if (operationIds && pending.operations) {
          if (operationIds.length === 0) {
            throw new WebMcpToolError('INVALID_INPUT', 'At least one operation id is required');
          }
          const selected = pending.operations.filter((operation) =>
            operationIds.includes(operation.id),
          );
          if (selected.length !== operationIds.length) {
            throw new WebMcpToolError('INVALID_INPUT', 'Unknown operation id');
          }
          const candidateState = applyPatchOperations(pending.baseState, selected);
          const diff = diffPersistedState(pending.baseState, candidateState);
          requestChangeSet = {
            ...pending,
            candidateState,
            diff,
            issues: lintState(candidateState),
            operations: selected,
          };
        }
        const confirmed = await requestConfirmation(
          { changeSet: requestChangeSet, operationIds },
          signal,
        );
        if (!confirmed) return { ok: true, status: 'canceled_by_user' };

        const currentSignature = await buildSignature(snapshotRef.current.state);
        if (currentSignature !== pending.baseSignature) {
          throw new WebMcpToolError(
            'CONFLICT',
            'The active document changed while confirmation was pending',
          );
        }
        snapshotRef.current.replaceState(requestChangeSet.candidateState);
        changeSetRef.current = null;
        setChangeSet(null);
        return { ok: true, status: 'applied', changeSetId: pending.id };
      },
    }),
    [
      input.authStatus,
      input.isShareView,
      inspectSchema,
      readOutput,
      requestConfirmation,
      stageCandidate,
    ],
  );

  useEffect(() => {
    const modelContext = document.modelContext;
    if (!modelContext) return;
    const controller = new AbortController();
    const definitions = createWebMcpTools(dependencies);
    void Promise.allSettled(
      definitions.map((definition) =>
        modelContext.registerTool(definition, { signal: controller.signal }),
      ),
    ).then((results) => {
      if (controller.signal.aborted) return;
      results.forEach((result) => {
        if (result.status === 'rejected') {
          console.warn('[webmcp] failed to register tool', result.reason);
        }
      });
    });
    return () => controller.abort();
  }, [dependencies]);

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
    request: dialogRequest ?? (changeSet ? { changeSet } : null),
    mode: dialogMode,
    onConfirm,
    onCancel,
  };
}
