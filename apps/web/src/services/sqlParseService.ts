import type { DatabaseType } from '@ddlbuilder/shared-types';
import type { MultiParsedResult, ParsedResult } from '@ddlbuilder/ddl-core/parser';
import i18n from '@/i18n';
import { ApiError } from '@/services/apiError';

const SQL_PARSE_API_ENDPOINT = '/api/parse-sql';
const SQL_PARSE_MULTI_API_ENDPOINT = '/api/parse-multi-sql';

interface SqlParseRequestPayload {
  sql: string;
  dbType: DatabaseType;
}

interface SqlParseResponsePayload {
  result: ParsedResult;
}

interface SqlParseMultiResponsePayload {
  results: ParsedResult[];
  failed: Array<{ statement: string; error: string }>;
}

async function readApiError(response: Response): Promise<ApiError> {
  const data: unknown = await response.json().catch(() => null);
  const payload = data && typeof data === 'object' ? data : {};
  const message =
    'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : i18n.t('services.requestFailed', { status: response.status });
  const code = 'code' in payload && typeof payload.code === 'string' ? payload.code : undefined;
  return new ApiError(message, response.status, code);
}

export async function requestSqlParse(payload: SqlParseRequestPayload): Promise<ParsedResult> {
  const response = await fetch(SQL_PARSE_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || !('result' in data)) {
    throw new Error(i18n.t('services.parseResultInvalid'));
  }

  return (data as SqlParseResponsePayload).result;
}

export async function requestMultiSqlParse(
  payload: SqlParseRequestPayload,
): Promise<MultiParsedResult> {
  const response = await fetch(SQL_PARSE_MULTI_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const data: unknown = await response.json();
  if (
    !data ||
    typeof data !== 'object' ||
    !('results' in data) ||
    !('failed' in data) ||
    !Array.isArray((data as SqlParseMultiResponsePayload).results) ||
    !Array.isArray((data as SqlParseMultiResponsePayload).failed)
  ) {
    throw new Error(i18n.t('services.parseResultInvalid'));
  }

  return data as SqlParseMultiResponsePayload;
}
