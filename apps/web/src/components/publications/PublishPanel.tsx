import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PublicationWrite } from '@ddlbuilder/shared-types/api';
import {
  getPublication,
  listPublications,
  savePublication,
  deletePublication,
} from '@/services/publicationService';
import { useAuthIdentity } from '@/auth/AuthSessionProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { copyText } from '@/utils/clipboard';

export function PublishPanel({
  content,
  title: suggestedTitle,
}: {
  content: PublicationWrite['content'] | null;
  title: string;
}) {
  const { t } = useTranslation();
  const { userId } = useAuthIdentity();
  const client = useQueryClient();
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'link'>('private');
  const [message, setMessage] = useState('');

  const list = useQuery({
    queryKey: ['publications', userId],
    queryFn: listPublications,
    enabled: Boolean(userId),
  });
  const record = list.data?.find((item) => item.id === selected);

  const mutation = useMutation({
    mutationFn: async (operation: 'save' | 'visibility' | 'delete') => {
      setMessage('');

      if (operation === 'delete') {
        await deletePublication(selected);
        setSelected('');

        return;
      }

      const existing = record ? await getPublication(record.id) : null;
      const nextContent = operation === 'visibility' ? existing?.content : content;

      if (!nextContent) throw new Error(t('publication.selectContent'));

      const saved = await savePublication(
        {
          title:
            title.trim() ||
            (operation === 'visibility' ? existing?.title : suggestedTitle) ||
            t('publication.untitled'),
          visibility,
          revision: record?.revision ?? 0,
          content: nextContent,
        },
        record?.id,
      );
      setSelected(saved.id);
      setMessage(t('publication.saved'));
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['publications', userId] }),
  });

  if (!userId) return <p className="text-sm text-muted-foreground">{t('publication.login')}</p>;

  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-medium">{t('publication.publish')}</h3>
      <p className="text-sm text-muted-foreground">{t('publication.hint')}</p>
      <label className="block space-y-1 text-sm">
        <span>{t('publication.existing')}</span>
        <select
          className="h-10 w-full rounded-md border bg-background px-3"
          value={selected}
          disabled={mutation.isPending}
          onChange={(event) => {
            setSelected(event.target.value);
            const item = list.data?.find((entry) => entry.id === event.target.value);
            setTitle(item?.title ?? '');
            setVisibility(item?.visibility ?? 'private');
            mutation.reset();
            setMessage('');
          }}
        >
          <option value="">{t('publication.create')}</option>
          {list.data
            ?.filter((item) => !content || item.kind === content.kind)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} · v{item.revision}
              </option>
            ))}
        </select>
      </label>
      {list.isError && (
        <p role="alert">
          {t('publication.loadFailed')}{' '}
          <Button variant="ghost" onClick={() => void list.refetch()}>
            {t('common.retry')}
          </Button>
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>{t('publication.title')}</span>
          <Input
            value={title}
            maxLength={120}
            placeholder={suggestedTitle}
            disabled={mutation.isPending}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('publication.visibility')}</span>
          <select
            className="h-11 w-full rounded-md border bg-background px-3"
            value={visibility}
            disabled={mutation.isPending}
            onChange={(event) => setVisibility(event.target.value === 'link' ? 'link' : 'private')}
          >
            <option value="private">{t('publication.private')}</option>
            <option value="link">{t('publication.link')}</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!content || mutation.isPending || record?.kind === 'proposal'}
          onClick={() => mutation.mutate('save')}
        >
          {t(record ? 'publication.republish' : 'publication.create')}
        </Button>
        {record && (
          <>
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate('visibility')}
            >
              {t('publication.changeAccess')}
            </Button>
            <Button
              variant="outline"
              onClick={async () =>
                setMessage(
                  t(
                    (await copyText(`${location.origin}/publications/${record.id}`))
                      ? 'publication.copied'
                      : 'publication.copyFailed',
                  ),
                )
              }
            >
              {t('publication.copy')}
            </Button>
            <a
              className="inline-flex items-center text-sm underline"
              href={`/publications/${record.id}`}
              target="_blank"
              rel="noreferrer"
            >
              {t('publication.open')}
            </a>
            <Button
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => {
                if (window.confirm(t('publication.deleteConfirm'))) mutation.mutate('delete');
              }}
            >
              {t('common.delete')}
            </Button>
          </>
        )}
      </div>
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}{' '}
          <Button
            variant="ghost"
            onClick={async () => {
              await list.refetch();
              mutation.reset();
            }}
          >
            {t('schemaTools.reload')}
          </Button>
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
