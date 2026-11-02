import type { MarkdownHeading } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { DOCS_BASE, LOCALE_KEYS, LOCALES, localeOf, SITE_URL } from './site';

export type DocEntry = CollectionEntry<'docs'>;

export const getDocs = () => getCollection('docs');

const PAGE_LOCALE = /^\/(?:zh|en|ja)\//;

export function firstHeading(entry: DocEntry): string | undefined {
  // SAFETY: the glob loader's Markdown renderer always records headings in this shape.
  const headings = entry.rendered?.metadata?.headings as MarkdownHeading[] | undefined;

  return headings?.find((heading) => heading.depth === 1)?.text;
}

export function pageTitle(entry: DocEntry): string {
  return entry.data.title ?? firstHeading(entry) ?? LOCALES[localeOf(entry.id)].title;
}

function siteHref(route: string): string {
  return `${SITE_URL}${DOCS_BASE}${route}`;
}

export function alternatesFor(route: string, routes: Set<string>) {
  const key = route.replace(PAGE_LOCALE, '/');
  const localized = LOCALE_KEYS.map((locale) => ({ locale, route: `/${locale}${key}` }));

  if (!localized.every((entry) => routes.has(entry.route))) return [];

  return [
    ...localized.map((entry) => ({
      lang: LOCALES[entry.locale].lang,
      route: entry.route,
      href: siteHref(entry.route),
    })),
    { lang: 'x-default', route: `/zh${key}`, href: siteHref(`/zh${key}`) },
  ];
}

export const canonicalHref = siteHref;
