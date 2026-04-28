import type { DatabaseType } from '@ddlbuilder/shared-types';
import type { ParsedResult, MultiParsedResult } from '@/utils/SqlParser';
import i18n from '@/i18n';

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

export async function requestSqlParse(payload: SqlParseRequestPayload): Promise<ParsedResult> {
  const response = await fetch(SQL_PARSE_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      typeof errorData.error === 'string'
        ? errorData.error
        : i18n.t('services.requestFailed', { status: response.status }),
    );
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
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      typeof errorData.error === 'string'
        ? errorData.error
        : i18n.t('services.requestFailed', { status: response.status }),
    );
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
