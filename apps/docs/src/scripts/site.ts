import type MiniSearch from 'minisearch';
import { createTokenizer, SEARCH_FIELDS, SEARCH_STORE_FIELDS } from '../lib/tokenize';
import { perFrame } from './per-frame';

const THEME_KEY = 'ddlbuilder:theme:v1';
const MAX_RESULTS = 12;
const { body, documentElement } = document;
const lang = body.dataset.lang ?? 'zh';

document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
  const dark = documentElement.classList.toggle('dark');

  try {
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  } catch {
    // The toggle still applies for this page when storage is blocked.
  }
});

for (const block of document.querySelectorAll<HTMLPreElement>('.prose pre')) {
  const wrapper = document.createElement('div');
  const button = document.createElement('button');

  button.type = 'button';
  button.className = 'copy-code';
  button.textContent = body.dataset.copy ?? '';
  button.addEventListener('click', async () => {
    await navigator.clipboard.writeText(block.querySelector('code')?.innerText ?? '');
    button.textContent = body.dataset.copied ?? '';
    setTimeout(() => {
      button.textContent = body.dataset.copy ?? '';
    }, 1500);
  });
  wrapper.className = 'code-block';
  block.before(wrapper);
  wrapper.append(block, button);
}

const dialog = document.querySelector<HTMLDialogElement>('[data-search-dialog]');
const input = dialog?.querySelector('input');
const results = dialog?.querySelector('ul');
let index: Promise<MiniSearch> | undefined;

async function loadIndex(): Promise<MiniSearch> {
  const [{ default: MiniSearchClass }, response] = await Promise.all([
    import('minisearch'),
    fetch(`/docs/search-${lang}.json`),
  ]);

  return MiniSearchClass.loadJSON(await response.text(), {
    fields: SEARCH_FIELDS,
    storeFields: SEARCH_STORE_FIELDS,
    tokenize: createTokenizer(documentElement.lang),
  });
}

function showMessage(text: string) {
  results?.replaceChildren(Object.assign(document.createElement('li'), { textContent: text }));
}

async function search(query: string) {
  if (!results) return;

  if (!query.trim()) {
    results.replaceChildren();

    return;
  }

  index ??= loadIndex();

  const hits = (await index).search(query, {
    prefix: true,
    fuzzy: 0.2,
    combineWith: 'AND',
    boost: { title: 4, text: 2, titles: 1 },
  });

  if (hits.length === 0) {
    showMessage(dialog?.dataset.empty ?? '');

    return;
  }

  results.replaceChildren(
    ...hits.slice(0, MAX_RESULTS).map((hit) => {
      const item = document.createElement('li');
      const link = document.createElement('a');

      link.href = String(hit.id);
      link.textContent = `${hit.titles} › ${hit.title}`;
      item.append(link);

      return item;
    }),
  );
}

function openSearch() {
  dialog?.showModal();
  input?.select();
}

for (const button of document.querySelectorAll('[data-search-open]')) {
  button.addEventListener('click', openSearch);
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('input, textarea') !== null;
}

document.addEventListener('keydown', (event) => {
  const shortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';

  if (shortcut || (event.key === '/' && !isTyping(event.target))) {
    event.preventDefault();
    openSearch();
  }
});

input?.addEventListener('input', () => {
  search(input.value).catch(() => {
    index = undefined;
    showMessage(dialog?.dataset.failed ?? '');
  });
});

for (const panel of document.querySelectorAll('dialog')) {
  panel.addEventListener('click', (event) => {
    const box = panel.getBoundingClientRect();

    const inside =
      event.clientX >= box.left &&
      event.clientX <= box.right &&
      event.clientY >= box.top &&
      event.clientY <= box.bottom;

    if (!inside) panel.close();
  });
}

const languages = document.querySelector<HTMLDetailsElement>('.lang');

document.addEventListener('click', (event) => {
  if (languages && event.target instanceof Node && !languages.contains(event.target)) {
    languages.open = false;
  }
});

document.addEventListener('keydown', (event) => {
  if (languages && event.key === 'Escape') languages.open = false;
});

const banner = document.querySelector('.doc__banner');
const float = document.querySelector<HTMLElement>('.float');

function syncFloat() {
  if (!banner || !float) return;

  const past = banner.getBoundingClientRect().bottom <= 0;
  const { state } = float.dataset;

  if (past && state !== 'in' && state !== 'hold') {
    float.dataset.state = state === 'out' ? 'hold' : 'in';
  }

  if (!past && (state === 'in' || state === 'hold')) float.dataset.state = 'out';
}

float?.addEventListener('animationend', (event) => {
  if (event.animationName === 'float-out') delete float.dataset.state;
});

window.addEventListener('scroll', perFrame(syncFloat), { passive: true });

syncFloat();
