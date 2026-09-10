import {
  decodeApiError,
  decodeSqlParseResponse,
  decodeMultiSqlParseResponse,
} from '@ddlbuilder/shared-types/api-contracts';
import type { DatabaseType } from '@ddlbuilder/shared-types';
import type { MultiParsedResult, ParsedResult } from '@ddlbuilder/ddl-core/parser';
import * as Option from 'effect/Option';
import i18n from '@/i18n';
import { ApiError } from '@/services/apiError';

const SQL_PARSE_API_ENDPOINT = '/api/parse-sql';
const SQL_PARSE_MULTI_API_ENDPOINT = '/api/parse-multi-sql';

interface SqlParseRequestPayload {
  sql: string;
  dbType: DatabaseType;
}

async function readApiError(response: Response): Promise<ApiError> {
  const data: unknown = await response.json().catch(() => null);
  const payload = decodeApiError(data);
  const message = payload.error ?? i18n.t('services.requestFailed', { status: response.status });
  const code = payload.code;

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

  const data = decodeSqlParseResponse(await response.json());

  if (Option.isNone(data)) {
    throw new Error(i18n.t('services.parseResultInvalid'));
  }

  return data.value.result;
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

  const data = decodeMultiSqlParseResponse(await response.json());

  if (Option.isNone(data)) {
    throw new Error(i18n.t('services.parseResultInvalid'));
  }

  return data.value;
}
