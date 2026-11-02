import type { APIRoute, GetStaticPaths } from 'astro';
import MiniSearch from 'minisearch';
import { getDocs, pageTitle, type DocEntry } from '../lib/docs';
import { docsHref, LOCALE_KEYS, LOCALES, routeOf, type LocaleKey } from '../lib/site';
import { createTokenizer, SEARCH_FIELDS, SEARCH_STORE_FIELDS } from '../lib/tokenize';

const HEADING = /<h([1-3])\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;

const decode = (text: string) =>
  text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');

const plainText = (html: string) =>
  decode(html.replace(/<(style|script)\b[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

function sections(entry: DocEntry) {
  const html = entry.rendered?.html ?? '';
  const url = docsHref(routeOf(entry.id));
  const headings = Array.from(html.matchAll(HEADING));

  return headings.map((heading, index) => {
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? html.length;

    return {
      id: `${url}#${heading[2]}`,
      title: plainText(heading[3] ?? ''),
      titles: pageTitle(entry),
      text: plainText(html.slice(start, end)),
    };
  });
}

export const getStaticPaths = (() =>
  LOCALE_KEYS.map((lang) => ({ params: { lang } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  // SAFETY: getStaticPaths only yields LOCALE_KEYS values for this param.
  const locale = params.lang as LocaleKey;
  const docs = await getDocs();

  const miniSearch = new MiniSearch({
    fields: SEARCH_FIELDS,
    storeFields: SEARCH_STORE_FIELDS,
    tokenize: createTokenizer(LOCALES[locale].lang),
  });

  miniSearch.addAll(docs.filter((entry) => entry.id.startsWith(`${locale}/`)).flatMap(sections));

  return new Response(JSON.stringify(miniSearch));
};
