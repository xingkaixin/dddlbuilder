(() => {
  let theme = null;
  try {
    theme = localStorage.getItem('ddlbuilder:theme:v1');
  } catch {}
  const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', dark);
})();
