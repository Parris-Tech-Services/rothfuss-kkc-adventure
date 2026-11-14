// Settings menu. Podcasts are off by default so they never get in the way of play.
(() => {
  const PREF_KEY = 'kkc-adventure-podcasts-enabled-v1';
  const button = document.getElementById('settings-button');
  const panel = document.getElementById('settings-panel');
  const podcasts = document.getElementById('setting-podcasts');
  if (!button || !panel || !podcasts) return;

  let enabled = false;
  try { enabled = localStorage.getItem(PREF_KEY) === '1'; } catch (_) {}
  podcasts.checked = enabled;

  const setOpen = (open) => {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  };

  button.addEventListener('click', () => setOpen(panel.hidden));
  document.addEventListener('click', (event) => {
    if (!panel.hidden && !panel.contains(event.target) && !button.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) { setOpen(false); button.focus(); }
  });

  podcasts.addEventListener('change', () => {
    try { localStorage.setItem(PREF_KEY, podcasts.checked ? '1' : '0'); } catch (_) {}
    window.dispatchEvent(new CustomEvent('kkc-podcasts-pref', { detail: podcasts.checked }));
  });
})();
