import { inkMarkup } from '@ddlbuilder/design/ink';

let nextId = 0;

function draw(element: HTMLElement) {
  const { offsetWidth: width, offsetHeight: height, dataset } = element;

  element.querySelector(':scope > .lm-ink')?.remove();

  if (width < 2 || height < 2) return;

  const markup = inkMarkup({
    id: (nextId++).toString(36),
    seedText: dataset.seed ?? element.textContent ?? '',
    width,
    height,
    radius: dataset.radius ? Number(dataset.radius) : undefined,
    wash: dataset.sketch === 'wash',
  });

  element.insertAdjacentHTML(
    'afterbegin',
    `<svg class="lm-ink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">${markup}</svg>`,
  );
}

const observer = new ResizeObserver((entries) => {
  for (const entry of entries) {
    if (entry.target instanceof HTMLElement) draw(entry.target);
  }
});

for (const element of document.querySelectorAll('[data-sketch], .custom-block')) {
  element.classList.add('lm-sketch');
  observer.observe(element);
}
