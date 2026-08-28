import { defineConfig, mergeConfig, type Plugin } from 'vite';
import baseConfig from './vite.config.ts';

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
  configureServer(server) {
    server.middlewares.use('/api/me', (request, response, next) => {
      if (request.method !== 'GET') {
        next();
        return;
      }

      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ signedIn: false, user: null }));
    });
  },
});

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [e2ePagePlugin()],
  }),
);
