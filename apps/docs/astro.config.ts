import { unified } from '@astrojs/markdown-remark';
import { defineConfig } from 'astro/config';
import { checkInternalLinks } from './src/integrations/check-links';
import { DOCS_BASE, SITE_URL } from './src/lib/site';
import { rehypeDocs } from './src/markdown/rehype-docs';
import { remarkContainers } from './src/markdown/remark-containers';

export default defineConfig({
  site: SITE_URL,
  base: DOCS_BASE,
  trailingSlash: 'ignore',
  build: { format: 'preserve' },
  devToolbar: { enabled: false },
  integrations: [checkInternalLinks()],
  markdown: {
    processor: unified({
      smartypants: false,
      remarkPlugins: [remarkContainers],
      rehypePlugins: [rehypeDocs],
    }),
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },
  vite: {
    // The site's CSP has no 'unsafe-inline' for scripts, so Astro must not inline small ones.
    build: { assetsInlineLimit: 0 },
  },
});
