import { execFileSync } from 'node:child_process';

const cache = new Map<string, Date>();

export function lastUpdated(filePath: string): Date {
  const cached = cache.get(filePath);

  if (cached) return cached;

  const timestamp = execFileSync('git', ['log', '-1', '--pretty=%aI', '--', filePath], {
    encoding: 'utf8',
  }).trim();
  const date = timestamp ? new Date(timestamp) : new Date();

  cache.set(filePath, date);

  return date;
}
