document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest('a[href]');
  if (!link) return;

  const destination = new URL(link.href, location.href);
  if (destination.origin !== location.origin || destination.pathname !== '/') return;

  window.umami?.track('docs_open_app', { source: location.pathname });
});
