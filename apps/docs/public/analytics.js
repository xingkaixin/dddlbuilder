document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest('a[href]');
  if (!(link instanceof HTMLAnchorElement)) return;

  const destination = new URL(link.href, location.href);
  if (destination.origin !== location.origin || destination.pathname !== '/') return;

  const placement = link.dataset.ctaPlacement || 'nav';
  const preset = link.dataset.preset || destination.searchParams.get('preset') || 'none';

  window.umami?.track('docs_open_app', {
    source: location.pathname,
    placement,
    preset,
  });
});
