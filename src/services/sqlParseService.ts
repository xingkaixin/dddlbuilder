import type { DatabaseType } from '@/types';
import type { ParsedResult } from '@/utils/SqlParser';
import i18n from '@/i18n';

const SQL_PARSE_API_ENDPOINT = '/api/parse-sql';

interface SqlParseRequestPayload {
  sql: string;
  dbType: DatabaseType;
}

interface SqlParseResponsePayload {
  result: ParsedResult;
}

export async function requestSqlParse(
  payload: SqlParseRequestPayload,
): Promise<ParsedResult> {
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
