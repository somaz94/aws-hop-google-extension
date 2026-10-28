// A classic script in <head>, so the cached theme is set before the first paint; the page re-applies the synced setting.
{
  const saved = localStorage.getItem('theme');
  const dark = saved === 'dark' || (saved !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
