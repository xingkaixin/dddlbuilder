import type { Config } from 'drizzle-kit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  schema: path.join(__dirname, 'schema', '*.ts'),
  out: path.join(__dirname, 'migrations'),
  dialect: 'sqlite',
} satisfies Config;
