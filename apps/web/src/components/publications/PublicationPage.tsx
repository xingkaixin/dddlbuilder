import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { decodeDeliveryTables } from '@ddlbuilder/workspace-core';
import { compareSchemaSnapshots } from '@ddlbuilder/ddl-core';
import { useAuthIdentity } from '@/auth/AuthSessionProvider';
import {
  getPublication,
  getPublicationComments,
  addPublicationComment,
  resolvePublicationComment,
} from '@/services/publicationService';
import { ComparisonDetails } from '@/components/schema-tools/ComparisonDetails';
import { DictionaryReader } from '@/components/schema-tools/DictionaryReader';
import { buildDictionary } from '@/components/schema-tools/dictionary';
import { comparisonMarkdown } from '@/components/schema-tools/comparisonReport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { downloadFile } from '@/utils/mockDataGenerator';

export default function PublicationPage({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const { userId, status } = useAuthIdentity();

  const query = useQuery({
    queryKey: ['publication', id, userId],
    queryFn: () => getPublication(id),
    enabled: status !== 'loading',
    retry: false,
  });
  const record = query.isError ? undefined : query.data;

  const content = useMemo(() => {
    if (!record) return null;

    try {
      return record.content.kind === 'document'
        ? {
            kind: 'document' as const,
            document: buildDictionary(
              decodeDeliveryTables(record.content.tables),
              record.content.standards,
              record.title,
              i18n.language,
              t,
            ),
          }
        : {
            kind: 'proposal' as const,
            comparison: compareSchemaSnapshots(
              decodeDeliveryTables(record.content.before),
              decodeDeliveryTables(record.content.after),
              [...record.content.renames],
            ),
          };
    } catch {
      return null;
    }
  }, [record, i18n.language, t]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-8">
      <title>{record ? `${record.title} · DDLBuilder` : 'DDLBuilder'}</title>
      <meta name="robots" content="noindex,nofollow" />
      <a href="/" className="text-sm text-primary underline">
        DDLBuilder · {t('publication.workspace')}
      </a>
      {query.isPending && <p role="status">{t('schemaTools.loading')}</p>}
      {query.isError && (
        <div role="alert">
          <p>{t('publication.unavailable')}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      )}
      {record && (
        <>
          <header className="space-y-2 border-b pb-5">
            <h1 className="break-words text-2xl font-semibold">{record.title}</h1>
            <p className="text-sm text-muted-foreground">
              {t(`publication.${record.kind}`)} · v{record.revision} ·{' '}
              {new Date(record.updatedAt).toLocaleString(i18n.language)} ·{' '}
              {t(`publication.${record.visibility}`)}
            </p>
          </header>
          {!content && <p role="alert">{t('publication.invalidContent')}</p>}
          {content?.kind === 'document' && <DictionaryReader document={content.document} />}
          {content?.kind === 'proposal' && (
            <>
              {record.content.kind === 'proposal' && (
                <p className="whitespace-pre-wrap">{record.content.reason}</p>
              )}
              <p className="text-sm text-muted-foreground">{t('schemaTools.compare.warning')}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    downloadFile(
                      comparisonMarkdown(content.comparison, t),
                      'schema-proposal.md',
                      'text/markdown',
                    )
                  }
                >
                  {t('schemaTools.compare.exportReport')}
                </Button>
                <Button
                  disabled={!content.comparison.sql}
                  onClick={() =>
                    downloadFile(content.comparison.sql, 'schema-migration.sql', 'text/plain')
                  }
                >
                  {t('schemaTools.compare.exportSql')}
                </Button>
              </div>
              {content.comparison.blockers.length > 0 && (
                <p role="alert" className="whitespace-pre-wrap text-sm text-destructive">
                  {content.comparison.blockers.join('\n')}
                </p>
              )}
              <ComparisonDetails comparison={content.comparison} />
              <ProposalComments id={id} isOwner={record.isOwner} />
            </>
          )}
        </>
      )}
    </main>
  );
}

function ProposalComments({ id, isOwner }: { id: string; isOwner: boolean }) {
  const { t } = useTranslation();
  const { userId } = useAuthIdentity();
  const client = useQueryClient();
  const [target, setTarget] = useState('');
  const [body, setBody] = useState('');
  const key = ['publication-comments', id, userId];
  const query = useQuery({ queryKey: key, queryFn: () => getPublicationComments(id) });

  const mutation = useMutation({
    mutationFn: async (comment?: { id: string; resolved: boolean }) => {
      if (comment) await resolvePublicationComment(id, comment.id, !comment.resolved);
      else {
        await addPublicationComment(id, { target, body });
        setBody('');
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });

  return (
    <section className="space-y-4 border-t pt-6">
      <h2 className="text-lg font-semibold">{t('publication.comments')}</h2>
      <p className="text-sm text-muted-foreground">{t('publication.commentsHint')}</p>
      {query.isError && (
        <p role="alert">
          {t('publication.loadFailed')}{' '}
          <Button variant="ghost" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        </p>
      )}
      {query.data?.map((comment) => (
        <article key={comment.id} className="space-y-2 border-l-2 pl-4">
          <p className="text-sm font-medium">
            {comment.author} · {comment.target || t('publication.wholeProposal')} ·{' '}
            {t(comment.resolved ? 'publication.resolved' : 'publication.unresolved')}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm">{comment.body}</p>
          {isOwner && (
            <Button
              size="sm"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(comment)}
            >
              {t(comment.resolved ? 'publication.reopen' : 'publication.resolve')}
            </Button>
          )}
        </article>
      ))}
      {userId ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(undefined);
          }}
        >
          <label className="block space-y-1 text-sm">
            <span>{t('publication.target')}</span>
            <Input
              value={target}
              maxLength={200}
              onChange={(event) => setTarget(event.target.value)}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span>{t('publication.comment')}</span>
            <Textarea
              value={body}
              maxLength={4000}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          <Button type="submit" disabled={!body.trim() || mutation.isPending}>
            {t('publication.send')}
          </Button>
        </form>
      ) : (
        <a href="/" className="text-sm underline">
          {t('publication.loginComment')}
        </a>
      )}
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      )}
    </section>
  );
}
