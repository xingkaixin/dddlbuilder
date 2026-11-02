import type { APIRoute } from 'astro';
import { alternatesFor, canonicalHref, getDocs } from '../lib/docs';
import { lastUpdated } from '../lib/git';
import { routeOf } from '../lib/site';

const toLastmod = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, '+00:00');

export const GET: APIRoute = async () => {
  const docs = await getDocs();
  const routes = new Set(docs.map((entry) => routeOf(entry.id)));

  const urls = docs.map((entry) => {
    const route = routeOf(entry.id);

    const links = alternatesFor(route, routes).map(
      (link) => `<xhtml:link rel="alternate" hreflang="${link.lang}" href="${link.href}"/>`,
    );
    const lastmod = toLastmod(lastUpdated(entry.filePath ?? entry.id));

    return `<url><loc>${canonicalHref(route)}</loc><lastmod>${lastmod}</lastmod>${links.join('')}</url>`;
  });
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">' +
    `${urls.join('')}</urlset>`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};
