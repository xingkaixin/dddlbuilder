// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f]/g;
const SPECIAL = /[\s~`!@#$%^&*()\-_+=[\]{}|;:"'“”‘’<>,.?/]+/g;
const COMBINING = /[̀-ͯ]/g;

// Published links point at these ids, so this stays identical to VitePress's slugify.
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(COMBINING, '')
    .replace(CONTROL, '')
    .replace(SPECIAL, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase();
}
