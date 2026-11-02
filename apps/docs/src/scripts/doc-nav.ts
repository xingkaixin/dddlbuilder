import { perFrame } from './per-frame';

const READING_LINE = 0.2;
const EDGE_THRESHOLD = 4;
const ARROW_STEP = 0.6;
const LIST_TOP_KEY = 'doc-list-top';

const outlineLinks = [...document.querySelectorAll<HTMLAnchorElement>('[data-outline-link]')];
const sections = [...document.querySelectorAll<HTMLAnchorElement>('.toc a')].flatMap((link) => {
  const heading = document.getElementById(decodeURIComponent(link.hash.slice(1)));

  return heading
    ? [{ href: link.getAttribute('href'), heading, name: link.textContent ?? '' }]
    : [];
});
const sectionLabel = document.querySelector('[data-section]');
let current = sections[0];

function syncOutline() {
  const line = window.innerHeight * READING_LINE;
  const reached = sections.filter(({ heading }) => heading.getBoundingClientRect().top <= line);

  current = reached.at(-1) ?? sections[0];

  for (const link of outlineLinks) {
    if (link.getAttribute('href') === current?.href) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }

  if (sectionLabel && current) sectionLabel.textContent = current.name;
}

const wrap = document.querySelector<HTMLElement>('.list-wrap');
const list = document.querySelector<HTMLElement>('.list-scroll');

function syncList() {
  if (!wrap || !list) return;

  const above = list.scrollTop > EDGE_THRESHOLD;
  const below = list.scrollTop + list.clientHeight < list.scrollHeight - EDGE_THRESHOLD;

  for (const element of [wrap, list]) {
    element.toggleAttribute('data-more-above', above);
    element.toggleAttribute('data-more-below', below);
  }
}

function saveListTop() {
  try {
    sessionStorage.setItem(LIST_TOP_KEY, String(list?.scrollTop ?? 0));
  } catch {
    // Without storage the list falls back to centring the current page.
  }
}

function savedListTop(): string | null {
  try {
    return sessionStorage.getItem(LIST_TOP_KEY);
  } catch {
    return null;
  }
}

function restoreList() {
  if (!list) return;

  const saved = savedListTop();
  const active = list.querySelector<HTMLElement>('[aria-current="page"]');

  if (saved !== null) list.scrollTop = Number(saved);

  if (!active) return;

  const top = active.offsetTop - list.offsetTop;

  const inView =
    top >= list.scrollTop && top + active.offsetHeight <= list.scrollTop + list.clientHeight;

  if (!inView) list.scrollTop = top - list.clientHeight / 2;
}

function scrollList(direction: number) {
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;

  list?.scrollBy({
    top: direction * (list.clientHeight * ARROW_STEP),
    behavior: smooth ? 'smooth' : 'auto',
  });
}

window.addEventListener('scroll', perFrame(syncOutline), { passive: true });

window.addEventListener('resize', perFrame(syncOutline), { passive: true });

list?.addEventListener(
  'scroll',
  perFrame(() => {
    syncList();
    saveListTop();
  }),
  { passive: true },
);

document.querySelector('.list-arrow--up')?.addEventListener('click', () => scrollList(-1));

document.querySelector('.list-arrow--down')?.addEventListener('click', () => scrollList(1));

for (const button of document.querySelectorAll<HTMLElement>('[data-open]')) {
  button.addEventListener('click', () => {
    const sheet = document.querySelector<HTMLDialogElement>(
      `[data-sheet="${button.dataset.open}"]`,
    );

    syncOutline();
    sheet?.showModal();
    sheet?.querySelector('a[aria-current]')?.scrollIntoView({ block: 'center' });
  });
}

for (const sheet of document.querySelectorAll<HTMLDialogElement>('.sheet')) {
  sheet.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a, [data-close]')) sheet.close();
  });
}

restoreList();

syncList();

syncOutline();
