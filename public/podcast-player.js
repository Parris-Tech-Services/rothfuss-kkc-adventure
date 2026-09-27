import { podcastEpisodes } from './podcast-data.js';

const STORAGE_KEY = 'kkc-adventure-podcast-v1';
const AUDIO_CACHE = 'kkc-podcast-audio-v1';
const RECENT_LIMIT = 6;

let currentIndex = 0;
let recent = [];
let isOpen = false;
let offlineState = 'streaming';

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  if (Number.isInteger(saved.currentIndex) && saved.currentIndex >= 0 && saved.currentIndex < podcastEpisodes.length) {
    currentIndex = saved.currentIndex;
  }
  if (Array.isArray(saved.recent)) {
    recent = saved.recent.filter((value) => Number.isInteger(value) && value >= 0 && value < podcastEpisodes.length).slice(0, RECENT_LIMIT);
  }
} catch (_) {}

const save = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ currentIndex, recent: recent.slice(0, RECENT_LIMIT) }));
  } catch (_) {}
};

const style = document.createElement('style');
style.textContent = `
  #kkc-podcast-launcher{position:fixed;left:14px;bottom:max(14px,env(safe-area-inset-bottom));z-index:2147483000;border:1px solid #8a6a3e;border-radius:999px;background:#20170f;color:#f8ecd4;padding:11px 16px;font:700 14px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.42);cursor:pointer;touch-action:manipulation}
  #kkc-podcast-panel{position:fixed;left:10px;bottom:max(10px,env(safe-area-inset-bottom));z-index:2147483001;width:min(560px,calc(100vw - 20px));box-sizing:border-box;border:1px solid #8a6a3e;border-radius:16px;background:#1a130d;color:#f8ecd4;padding:13px;box-shadow:0 20px 55px rgba(0,0,0,.58);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
  #kkc-podcast-panel[hidden]{display:none!important}.kkc-podcast-head{display:flex;gap:12px;justify-content:space-between;align-items:flex-start}.kkc-podcast-kicker{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#d7b274}.kkc-podcast-title{margin:4px 0 0;font-size:16px;line-height:1.3}.kkc-podcast-meta{margin:5px 0 0;color:#d8c7ac;font-size:12px;line-height:1.4}.kkc-podcast-close{width:38px;height:38px;flex:0 0 38px;border:1px solid #7d6442;border-radius:50%;background:#302317;color:#fff;font-size:22px;cursor:pointer;touch-action:manipulation}.kkc-podcast-frame{display:block;width:100%;height:152px;border:0;border-radius:12px;background:#080603;margin-top:10px}.kkc-podcast-audio{display:block;width:100%;margin-top:10px}.kkc-podcast-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.kkc-podcast-action,.kkc-podcast-link,.kkc-podcast-offline{border-radius:10px;padding:9px 12px;font:700 13px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;text-decoration:none;cursor:pointer;touch-action:manipulation}.kkc-podcast-action{border:0;background:#765126;color:#fff}.kkc-podcast-offline{border:0;background:#315c42;color:#fff}.kkc-podcast-offline:disabled{opacity:.65;cursor:wait}.kkc-podcast-link{display:inline-flex;align-items:center;border:1px solid #7d6442;background:#302317;color:#fff}.kkc-podcast-note{margin:9px 0 0;color:#bfae93;font-size:11px}
  @media(max-width:640px){#kkc-podcast-panel{left:5px;width:calc(100vw - 10px);padding:11px}.kkc-podcast-actions>*{flex:1;justify-content:center;text-align:center}}
`;
document.head.appendChild(style);

const launcher = document.createElement('button');
launcher.id = 'kkc-podcast-launcher';
launcher.type = 'button';
launcher.textContent = '🎧 Podcasts';
launcher.setAttribute('aria-label', 'Open fantasy and books podcasts');
launcher.setAttribute('aria-expanded', 'false');

document.body.appendChild(launcher);

const panel = document.createElement('aside');
panel.id = 'kkc-podcast-panel';
panel.hidden = true;
panel.setAttribute('aria-label', 'KKC Adventure podcast player');
panel.innerHTML = `
  <div class="kkc-podcast-head">
    <div>
      <div class="kkc-podcast-kicker">KKC Adventure · tavern radio</div>
      <h2 class="kkc-podcast-title"></h2>
      <p class="kkc-podcast-meta"></p>
    </div>
    <button class="kkc-podcast-close" type="button" aria-label="Close podcast player">×</button>
  </div>
  <div class="kkc-podcast-media"></div>
  <div class="kkc-podcast-actions">
    <button class="kkc-podcast-action" type="button">📖 Different podcast</button>
    <span class="kkc-podcast-offline-slot"></span>
    <a class="kkc-podcast-link" target="_blank" rel="noopener noreferrer">Open in Spotify ↗</a>
  </div>
  <p class="kkc-podcast-note"></p>
`;
document.body.appendChild(panel);

const title = panel.querySelector('.kkc-podcast-title');
const meta = panel.querySelector('.kkc-podcast-meta');
const media = panel.querySelector('.kkc-podcast-media');
const offlineSlot = panel.querySelector('.kkc-podcast-offline-slot');
const note = panel.querySelector('.kkc-podcast-note');
const link = panel.querySelector('.kkc-podcast-link');
const close = panel.querySelector('.kkc-podcast-close');
const different = panel.querySelector('.kkc-podcast-action');

async function refreshOfflineState() {
  const episode = podcastEpisodes[currentIndex];
  if (!episode.audio || !('caches' in window)) {
    offlineState = 'streaming';
    if (isOpen) renderEpisode();
    return;
  }
  try {
    const cache = await caches.open(AUDIO_CACHE);
    offlineState = (await cache.match(episode.audio, { ignoreVary: true })) ? 'saved' : 'downloadable';
  } catch {
    offlineState = 'downloadable';
  }
  if (isOpen) renderEpisode();
}

async function toggleOffline() {
  const episode = podcastEpisodes[currentIndex];
  if (!episode.audio || !('caches' in window)) return;
  offlineState = 'downloading';
  renderEpisode();
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const existing = await cache.match(episode.audio, { ignoreVary: true });
    if (existing) {
      await cache.delete(episode.audio, { ignoreVary: true });
      offlineState = 'downloadable';
      renderEpisode();
      return;
    }
    let response;
    try {
      response = await fetch(episode.audio, { cache: 'no-store' });
    } catch {
      response = await fetch(episode.audio, { mode: 'no-cors', cache: 'no-store' });
    }
    if (response.type !== 'opaque' && !response.ok) throw new Error('Download failed: ' + response.status);
    await cache.put(episode.audio, response.clone());
    offlineState = 'saved';
  } catch (error) {
    console.error(error);
    offlineState = 'failed';
  }
  renderEpisode();
}

function renderEpisode() {
  const episode = podcastEpisodes[currentIndex];
  title.textContent = episode.title;
  meta.textContent = [episode.show, ...episode.tags].join(' · ');
  if (episode.audio) {
    media.innerHTML = '<audio class="kkc-podcast-audio" controls preload="metadata"></audio>';
    media.querySelector('audio').src = episode.audio;
    offlineSlot.innerHTML = `<button class="kkc-podcast-offline" type="button" ${offlineState === 'downloading' ? 'disabled' : ''}>${offlineState === 'saved' ? '✓ Offline saved · tap to remove' : offlineState === 'downloading' ? 'Downloading…' : offlineState === 'failed' ? 'Retry offline download' : '⬇ Download offline'}</button>`;
    offlineSlot.querySelector('button').addEventListener('click', toggleOffline);
    note.textContent = 'Verified publisher audio can be saved locally for offline listening.';
  } else {
    media.innerHTML = '<iframe class="kkc-podcast-frame" title="Spotify podcast episode" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>';
    const frame = media.querySelector('iframe');
    frame.src = `https://open.spotify.com/embed/episode/${encodeURIComponent(episode.id)}?theme=0`;
    frame.title = `Spotify episode: ${episode.title}`;
    offlineSlot.innerHTML = '';
    note.textContent = 'Streaming only for this episode: no verified direct publisher audio source is stored yet.';
  }
  link.href = `https://open.spotify.com/episode/${encodeURIComponent(episode.id)}`;
}

function chooseDifferent() {
  const excluded = new Set([currentIndex, ...recent]);
  let candidates = podcastEpisodes.map((_, index) => index).filter((index) => !excluded.has(index));
  if (!candidates.length) candidates = podcastEpisodes.map((_, index) => index).filter((index) => index !== currentIndex);
  if (!candidates.length) candidates = [0];

  const previous = currentIndex;
  currentIndex = candidates[Math.floor(Math.random() * candidates.length)];
  if (previous !== currentIndex) recent = [previous, ...recent.filter((index) => index !== previous)].slice(0, RECENT_LIMIT);
  save();
  offlineState = 'streaming';
  renderEpisode();
  refreshOfflineState();
}

function openPlayer() {
  isOpen = true;
  panel.hidden = false;
  launcher.hidden = true;
  launcher.setAttribute('aria-expanded', 'true');
  renderEpisode();
  refreshOfflineState();
}

function closePlayer() {
  isOpen = false;
  panel.hidden = true;
  launcher.hidden = false;
  launcher.setAttribute('aria-expanded', 'false');
  media.innerHTML = '';
}

launcher.addEventListener('click', openPlayer);
close.addEventListener('click', closePlayer);
different.addEventListener('click', chooseDifferent);

document.addEventListener('play', (event) => {
  const media = event.target;
  if (isOpen && (media instanceof HTMLAudioElement || media instanceof HTMLVideoElement)) closePlayer();
}, true);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./podcast-sw.js').catch(() => {});
