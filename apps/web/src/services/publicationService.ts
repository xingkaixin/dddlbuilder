import * as Schema from 'effect/Schema';
import {
  PublicationSchema,
  PublicationListSchema,
  PublicationCommentsSchema,
  type PublicationWrite,
  type CommentWrite,
} from '@ddlbuilder/shared-types/api';
import { decodeApiError } from '@ddlbuilder/shared-types/api-contracts';
import { ApiError } from './apiError';

async function publicationRequest<T>(
  schema: Schema.ConstraintDecoder<T>,
  path: string,
  method = 'GET',
  body?: PublicationWrite | CommentWrite | { resolved: boolean },
): Promise<T> {
  const response = await fetch(`/api/publications${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data: unknown = await response.json();

  if (!response.ok) {
    const error = decodeApiError(data);
    throw new ApiError(
      error.error ?? `Request failed (${response.status})`,
      response.status,
      error.code,
    );
  }

  return Schema.decodeUnknownSync(schema)(data);
}

export const listPublications = () => publicationRequest(PublicationListSchema, '');
export const getPublication = (id: string) =>
  publicationRequest(PublicationSchema, `/${encodeURIComponent(id)}`);
export const savePublication = (input: PublicationWrite, id?: string) =>
  publicationRequest(
    PublicationSchema,
    id ? `/${encodeURIComponent(id)}` : '',
    id ? 'PUT' : 'POST',
    input,
  );
export const getPublicationComments = (id: string) =>
  publicationRequest(PublicationCommentsSchema, `/${encodeURIComponent(id)}/comments`);
const SuccessSchema = Schema.Struct({ success: Schema.Literal(true) });
export const deletePublication = (id: string) =>
  publicationRequest(SuccessSchema, `/${encodeURIComponent(id)}`, 'DELETE');
export const addPublicationComment = (id: string, input: CommentWrite) =>
  publicationRequest(SuccessSchema, `/${encodeURIComponent(id)}/comments`, 'POST', input);
export const resolvePublicationComment = (id: string, commentId: string, resolved: boolean) =>
  publicationRequest(
    SuccessSchema,
    `/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}`,
    'PUT',
    { resolved },
  );
