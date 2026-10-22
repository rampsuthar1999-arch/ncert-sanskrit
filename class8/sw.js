// Offline cache: page images are cached as they are viewed; app shell is network-first.
const V='deepakam8-v1';
const SHELL=['./','index.html','css/style.css','js/translit.js','js/app.js','js/study.js','book.json','search.json','study/ch01.json','study/ch02.json','study/ch03.json','study/ch04.json','study/ch05.json','study/ch06.json','study/ch07.json','study/ch08.json','study/ch09.json','study/ch10.json','study/ch11.json','study/ch12.json','study/ch13.json','study/grammar.json','manifest.webmanifest','icon-192.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V&&k.startsWith(V.replace(/\d+$/,''))).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET') return;
  if(u.origin===location.origin && /\/(pages|thumbs)\//.test(u.pathname)){
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const cp=res.clone();caches.open(V).then(c=>c.put(e.request,cp));return res;})));
  } else if(u.origin===location.origin){
    e.respondWith(fetch(e.request).then(res=>{const cp=res.clone();caches.open(V).then(c=>c.put(e.request,cp));return res;}).catch(()=>caches.match(e.request)));
  }
});
