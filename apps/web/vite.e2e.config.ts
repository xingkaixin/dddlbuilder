import {
  defineConfig,
  mergeConfig,
  type Plugin,
  type PreviewServer,
  type ViteDevServer,
} from 'vite';
import baseConfig from './vite.config.ts';

const configureE2EServer = (server: ViteDevServer | PreviewServer) => {
  server.middlewares.use('/api/me', (request, response, next) => {
    if (request.method !== 'GET') {
      next();
      return;
    }

    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ signedIn: false, user: null }));
  });
};

const e2ePagePlugin = (): Plugin => ({
  name: 'ddlbuilder-e2e-page',
  transformIndexHtml(html) {
    return html
      .replace(
        /<link\b(?=[^>]*rel="(?:stylesheet|preconnect)")[^>]*href="https:\/\/[^"]+"[^>]*>/g,
        '',
      )
      .replace(/<script\b[^>]*src="https:\/\/[^"]+"[^>]*>[\s\S]*?<\/script>/g, '');
  },
  configureServer: configureE2EServer,
  configurePreviewServer: configureE2EServer,
});

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [e2ePagePlugin()],
    preview: {
      headers: {
        'Content-Security-Policy':
          "default-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:",
      },
    },
  }),
);
