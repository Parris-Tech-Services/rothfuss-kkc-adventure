const SHELL_CACHE='kkc-podcast-shell-v2';
const AUDIO_CACHE='kkc-podcast-audio-v1';
const BASE=new URL('./',self.location.href);
const shellUrl=(path='')=>new URL(path,BASE).href;
const SHELL=['','styles.css','app.js','podcast-player.js?v=1','podcast-data.js'].map(shellUrl);

self.addEventListener('install',event=>event.waitUntil(
  caches.open(SHELL_CACHE)
    .then(c=>Promise.all(SHELL.map(async u=>{try{const r=await fetch(u,{cache:'reload'});if(r.ok)await c.put(u,r)}catch{}})))
    .then(()=>self.skipWaiting())
));

self.addEventListener('activate',event=>event.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k.startsWith('kkc-podcast-')&&![SHELL_CACHE,AUDIO_CACHE].includes(k)).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())
));

self.addEventListener('fetch',event=>{
  const r=event.request;
  if(r.method!=='GET')return;

  if(r.destination==='audio'){
    event.respondWith(
      caches.open(AUDIO_CACHE)
        .then(c=>c.match(r,{ignoreVary:true}))
        .then(hit=>hit||fetch(r))
    );
    return;
  }

  const u=new URL(r.url);
  if(u.origin!==self.location.origin||!u.pathname.startsWith(BASE.pathname))return;

  if(r.mode==='navigate'){
    event.respondWith(
      fetch(r)
        .then(x=>{
          if(x.ok)caches.open(SHELL_CACHE).then(c=>c.put(shellUrl(''),x.clone())).catch(()=>{});
          return x;
        })
        .catch(()=>caches.open(SHELL_CACHE).then(c=>c.match(shellUrl(''))))
    );
    return;
  }

  event.respondWith(
    caches.match(r).then(hit=>hit||fetch(r).then(x=>{
      if(x.ok)caches.open(SHELL_CACHE).then(c=>c.put(r,x.clone())).catch(()=>{});
      return x;
    }))
  );
});
