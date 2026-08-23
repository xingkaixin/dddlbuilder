import { defineConfig, mergeConfig, type Plugin } from 'vite';
import baseConfig from './vite.config.ts';

const guestSessionPlugin = (): Plugin => ({
  name: 'ddlbuilder-e2e-guest-session',
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
    plugins: [guestSessionPlugin()],
  }),
);
