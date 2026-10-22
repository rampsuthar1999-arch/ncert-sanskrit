/* Reader core: home, page viewer, thumbnails, search, routing. Study features live in study.js and hook in via App. */
(function(){
const $=s=>document.querySelector(s);
const BOOK=window.BOOK=Object.assign({name:'दीपकम्',ih:1851,cls:6,pfx:'',full:8,toc:'xv',study:['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16'],shelf:[]},window.BOOK||{});
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
const App=window.App={hooks:{render:[],home:[],ready:[]},marking:false,store};

const savedTheme=store.get('theme'); if(savedTheme) document.documentElement.dataset.theme=savedTheme;
$('#themeBtn').onclick=()=>{
  const dark=matchMedia('(prefers-color-scheme: dark)').matches;
  const cur=document.documentElement.dataset.theme||(dark?'dark':'light');
  const nxt=cur==='dark'?'light':'dark'; document.documentElement.dataset.theme=nxt; store.set('theme',nxt);
};

let tt; function toast(m,ms=1800){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('show'),ms);}
App.toast=toast;

fetch('book.json').then(r=>r.json()).then(init);

function init(book){
const P=book.pages, CH=book.chapters, N=P.length;
const byNum={}; P.forEach((p,i)=>byNum[p.n]=i);
const chOf=i=>{for(let k=CH.length-1;k>=0;k--) if(i>=CH[k].first) return CH[k]; return CH[0];};
Object.assign(App,{book,P,CH,N,byNum,chOf});

/* ---------- home ---------- */
$('#pgCount').textContent=`${CH.length-1} पाठाः · ${N} पृष्ठानि`;
function buildGrid(){
  const grid=$('#grid'); grid.innerHTML='';
  CH.forEach(c=>{
    const first=P[c.first], last=P[c.first+c.count-1];
    const b=document.createElement('button'); b.className='card';
    const pct=App.chapterProgress?App.chapterProgress(c):0;
    b.innerHTML=`<span class="bar"><i style="width:${pct}%"></i></span>${App.hasStudy&&App.hasStudy(c.id)?`<span class="ribbon">${+c.id<=BOOK.full?'Study layer':'Word list'}</span>`:''}
    <img class="th" loading="lazy" src="${first.th}" alt="">
    <div class="meta"><div class="lbl">${c.label}</div><div class="ttl sa">${c.title}</div><div class="pr">पृष्ठम् ${first.n} – ${last.n}${pct?` · ${pct}% read`:''}</div></div>`;
    b.onclick=()=>open(c.first);
    grid.appendChild(b);
  });
}
App.buildGrid=buildGrid;
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>open(byNum[b.dataset.go]));
$('#coverImg').onclick=()=>open(0);
function refreshHome(){
  buildGrid();
  const last=store.get(BOOK.pfx+'lastPage');
  if(last && byNum[last]!==undefined && byNum[last]>0){
    const i=byNum[last], c=chOf(i);
    $('#resumeTxt').textContent=`${c.label} – ${c.title}, page ${last}`;
    $('#resume').classList.remove('hidden');
    $('#resumeBtn').onclick=()=>open(i);
  }
  App.hooks.home.forEach(f=>f());
}
App.refreshHome=refreshHome;
document.documentElement.style.setProperty('--pr','1400/'+BOOK.ih);
/* other classes on the same site: shown only if that book is actually there */
(BOOK.shelf||[]).forEach(b=>{ const a=document.createElement('a'); a.className='btn hidden'+(b.cls===BOOK.cls?' primary':''); a.href=b.href; a.textContent=b.lab||('कक्षा '+b.cls); $('#shelf').appendChild(a); fetch(b.href+'book.json',{method:'HEAD'}).then(r=>{ if(!r.ok) return; a.classList.remove('hidden'); $('#shelf').classList.remove('hidden'); }).catch(()=>{}); });

/* ---------- reader ---------- */
const sel=$('#chSel');
CH.forEach((c,k)=>{const o=document.createElement('option');o.value=k;o.textContent=c.id==='ps'?c.label:`${c.label.replace(' पाठः','')} – ${c.title}`;sel.appendChild(o);});
sel.onchange=()=>go(CH[sel.value].first);
$('#pgOf').textContent=`/ ${P[N-1].n}`;

let cur=0, zoom=false;
const isSmall=()=>innerWidth<760;
let spreadPref=store.get('spread');
const spreadOn=()=>{ if(isSmall()) return false; if(App.panelOpen && innerWidth<1250) return false; return spreadPref? spreadPref==='on' : innerWidth>=1000; };
const spreadOf=i=>{ if(i===0) return [0]; const a=i%2===1?i:i-1; return a+1<N?[a,a+1]:[a]; };
const visible=()=>spreadOn()?spreadOf(cur):[cur];
App.visible=visible; App.cur=()=>cur;

const spread=$('#spread'), stage=$('#stage');
function layout(){
  const v=spread.children.length||1;
  const sw=stage.clientWidth-(isSmall()?16:28), sh=stage.clientHeight-(isSmall()?16:28);
  const ratio=book.w/book.h;
  let w;
  if(zoom) w=Math.min(1400, sw/v*(isSmall()?1.6:1));
  else if(isSmall()) w=sw;
  else w=Math.min(sw/v, sh*ratio);
  [...spread.children].forEach(pg=>{ pg.style.width=Math.floor(w)+'px'; pg.querySelector('.ov').style.setProperty('--fs',(w*0.024).toFixed(1)+'px'); });
}
App.layout=layout;
function render(){
  const v=visible();
  spread.className=zoom?'wide':'fit';
  spread.innerHTML='';
  const pages=v.map(i=>{
    const pg=document.createElement('div'); pg.className='pg'; pg.dataset.i=i;
    const im=new Image(); im.src=P[i].src; im.alt=`पृष्ठम् ${P[i].n}`; im.width=book.w; im.height=book.h; im.decoding='async'; im.draggable=false;
    const ov=document.createElement('div'); ov.className='ov';
    pg.append(im,ov); spread.appendChild(pg);
    return {i,pg,ov,img:im};
  });
  layout();
  const c=chOf(cur); sel.value=CH.indexOf(c);
  $('#pgIn').value=P[v[0]].n+(v.length>1?'–'+P[v[1]].n:'');
  $('#prev').disabled=v[0]===0; $('#next').disabled=v[v.length-1]===N-1;
  $('#zoomBtn').classList.toggle('on',zoom); $('#spreadBtn').classList.toggle('on',spreadOn());
  stage.scrollTo(0,0);
  [v[0]-2,v[0]-1,v[v.length-1]+1,v[v.length-1]+2].forEach(i=>{if(i>=0&&i<N){const im=new Image();im.src=P[i].src;}});
  markThumb();
  store.set(BOOK.pfx+'lastPage',P[cur].n);
  const h='#/page/'+P[cur].n; if(location.hash!==h) history.replaceState(null,'',h);
  document.title=`${c.id==='ps'?BOOK.name:c.title} · पृष्ठम् ${P[cur].n} – ${BOOK.name}`;
  App.hooks.render.forEach(f=>f(pages));
}
App.render=render;
function go(i){ cur=Math.max(0,Math.min(N-1,i)); render(); }
function step(d){
  const v=visible();
  if(d>0) go(v[v.length-1]+1); else go(spreadOn()? (spreadOf(Math.max(0,v[0]-1))[0]) : v[0]-1);
}
function show(id){ ['#home','#reader','#view'].forEach(s=>$(s).classList.toggle('hidden',s!==id)); }
function open(i){ show('#reader'); history.pushState(null,'','#/page/'+P[i].n); go(i); }
function showHome(push=true){
  show('#home'); closeSearch(); App.closePop&&App.closePop();
  if(push) history.pushState(null,'',location.pathname+location.search);
  document.title=BOOK.name+' – '+(BOOK.tag||'कक्षा '+BOOK.cls); scrollTo(0,0); refreshHome();
}
Object.assign(App,{go,open,step,showHome,show});
$('#homeBtn').onclick=()=>showHome();
$('#prev').onclick=()=>step(-1); $('#next').onclick=()=>step(1);
$('#zoomBtn').onclick=()=>{zoom=!zoom;render();};
$('#spreadBtn').onclick=()=>{spreadPref=spreadOn()?'off':'on';store.set('spread',spreadPref);render();};
$('#fsBtn').onclick=()=>{ if(document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(()=>{}); };
const pgIn=$('#pgIn');
pgIn.onfocus=()=>pgIn.select();
pgIn.onkeydown=e=>{ if(e.key==='Enter'){ const v=pgIn.value.trim().toLowerCase().replace(/[०-९]/g,d=>'०१२३४५६७८९'.indexOf(d)).split('–')[0];
  if(byNum[v]!==undefined){go(byNum[v]);pgIn.blur();} else toast('Page not found'); } };

// swipe (disabled while marking)
let tx=null,ty=null;
stage.addEventListener('touchstart',e=>{ if(e.touches.length===1&&!App.marking){tx=e.touches[0].clientX;ty=e.touches[0].clientY;} else tx=null; },{passive:true});
stage.addEventListener('touchend',e=>{
  if(tx===null) return; const t=e.changedTouches[0], dx=t.clientX-tx, dy=t.clientY-ty; tx=null;
  if(window.visualViewport && visualViewport.scale>1.05) return;
  if(e.target.closest('input,textarea,select')) return;
  if(Math.abs(dx)>70 && Math.abs(dx)>Math.abs(dy)*1.6 && stage.scrollWidth<=stage.clientWidth+2) step(dx<0?1:-1);
},{passive:true});

addEventListener('keydown',e=>{
  if($('#reader').classList.contains('hidden')) return;
  if(e.target.closest('input,select,textarea')){ if(e.key==='Escape') e.target.blur(); return; }
  if(e.ctrlKey||e.metaKey||e.altKey) return;
  const k=e.key;
  if(k==='ArrowRight'||k==='PageDown'){e.preventDefault();step(1);}
  else if(k==='ArrowLeft'||k==='PageUp'){e.preventDefault();step(-1);}
  else if(k==='Home'){go(0);} else if(k==='End'){go(N-1);}
  else if(k==='z'||k==='Z'){zoom=!zoom;render();}
  else if(k==='s'||k==='S'){$('#spreadBtn').click();}
  else if(k==='t'||k==='T'){toggleThumbs();}
  else if(k==='f'||k==='F'){$('#fsBtn').click();}
  else if(k==='p'||k==='P'){$('#studyBtn').click();}
  else if(k==='m'||k==='M'){$('#markBtn').click();}
  else if(k==='/'){e.preventDefault();openSearch();}
  else if(k==='Escape'){
    if(App.popOpen&&App.popOpen()) App.closePop();
    else if(!$('#searchP').classList.contains('hidden')) closeSearch();
    else if(!$('#thumbs').classList.contains('hidden')) toggleThumbs();
    else if(App.marking) $('#markBtn').click();
    else showHome(); }
});
let rt; addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>{if(!$('#reader').classList.contains('hidden')){ const n=spread.children.length; if(n!==visible().length) render(); else layout(); }},120);});

/* thumbnails */
const strip=$('#thumbStrip'); let thumbsBuilt=false;
function buildThumbs(){
  P.forEach((p,i)=>{
    const c=chOf(i), b=document.createElement('button'); b.className='tb'; b.dataset.i=i;
    b.innerHTML=`<img loading="lazy" src="${p.th}" alt="" width="111" height="146"><span>${p.n}</span>${c.first===i?`<span class="chm">${c.id==='ps'?c.label:c.title}</span>`:''}`;
    b.onclick=()=>go(i); strip.appendChild(b);
  }); thumbsBuilt=true;
}
function markThumb(){
  if(!thumbsBuilt) return; strip.querySelectorAll('.cur').forEach(x=>x.classList.remove('cur'));
  visible().forEach(i=>strip.children[i].classList.add('cur'));
  if(!$('#thumbs').classList.contains('hidden')) strip.children[cur].scrollIntoView({inline:'center',block:'nearest'});
}
function toggleThumbs(){
  if(!thumbsBuilt) buildThumbs();
  const t=$('#thumbs'); t.classList.toggle('hidden'); $('#thumbBtn').classList.toggle('on',!t.classList.contains('hidden'));
  markThumb();
}
$('#thumbBtn').onclick=toggleThumbs;

/* ---------- search ---------- */
let texts=null, skel=null;
const DROP=/[ऀ-ःऺ-ॏ॑-ॗॢॣ​-‍\s\-–—'‘’"“”!?,.।॥:;()\[\]]/;
function skeleton(s){ const out=[],map=[]; for(let i=0;i<s.length;i++){ const ch=s[i]; if(DROP.test(ch)) continue; out.push(ch.toLowerCase()); map.push(i);} return {s:out.join(''),map}; }
async function loadTexts(){ if(texts) return; texts=await (await fetch('search.json')).json(); skel=texts.map(skeleton); }
function openSearch(){ $('#searchP').classList.remove('hidden'); setTimeout(()=>$('#q').focus(),30); loadTexts(); }
function closeSearch(){ $('#searchP').classList.add('hidden'); }
App.openSearch=openSearch;
$('#searchBtn').onclick=openSearch; $('#openSearchHome').onclick=openSearch; $('#closeSearch').onclick=closeSearch;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
App.esc=esc;
let qt; $('#q').addEventListener('input',()=>{clearTimeout(qt);qt=setTimeout(runSearch,200);});
async function runSearch(){
  await loadTexts();
  let raw=$('#q').value.trim(); const R=$('#results');
  if(/[a-zA-Z]/.test(raw)) raw=Translit.itrans(raw);
  const q=skeleton(raw).s;
  if(q.length<2){ R.innerHTML='<div class="hint">Type at least two letters.</div>'; return; }
  const SIGN=/[ऀ-ःऺ-ॏॢॣ]/g;
  const need={}; (raw.match(SIGN)||[]).filter(c=>c!=='्').forEach(c=>need[c]=(need[c]||0)+1);
  const ok=(t,a,b)=>{ const have={}; (t.slice(Math.max(0,a-1),b+4).match(SIGN)||[]).forEach(c=>have[c]=(have[c]||0)+1); return Object.keys(need).every(c=>(have[c]||0)>=need[c]); };
  const hits=[];
  skel.forEach((sk,i)=>{ let pos=sk.s.indexOf(q), n=0, first=-1;
    while(pos>=0){ const a=sk.map[pos], b=sk.map[pos+q.length-1]+1; if(ok(texts[i],a,b)){ n++; if(first<0) first=pos; } pos=sk.s.indexOf(q,pos+1);} if(n) hits.push({i,n,first}); });
  hits.sort((x,y)=>y.n-x.n||x.i-y.i);
  if(!hits.length){ R.innerHTML=`<div class="hint">No results for <b>${esc(raw)}</b>.</div>`; return; }
  R.innerHTML=`<div class="hint" style="padding:8px 14px">Found on ${hits.length} page(s) — <b>${esc(raw)}</b></div>`+hits.slice(0,150).map(h=>{
    const t=texts[h.i], m=skel[h.i].map, a=m[h.first], b=m[h.first+q.length-1]+1;
    const s=Math.max(0,a-60), e=Math.min(t.length,b+80);
    const snip=(s>0?'…':'')+esc(t.slice(s,a))+'<mark>'+esc(t.slice(a,b))+'</mark>'+esc(t.slice(b,e))+(e<t.length?'…':'');
    const c=chOf(h.i);
    return `<button class="res" data-i="${h.i}"><b>पृष्ठम् ${P[h.i].n} · ${c.id==='ps'?c.label:c.title}</b>${h.n>1?` <small>(${h.n})</small>`:''}<p>${snip}</p></button>`;
  }).join('');
  R.querySelectorAll('.res').forEach(b=>b.onclick=()=>{ const i=+b.dataset.i; if($('#reader').classList.contains('hidden')) open(i); else go(i); if(innerWidth<760) closeSearch(); });
}

/* ---------- routing ---------- */
let lastR={h:null,t:0};
function route(){
  const h=location.hash;
  if(h===lastR.h && Date.now()-lastR.t<150) return; lastR={h,t:Date.now()};
  const m=h.match(/^#\/page\/([^/]+)/);
  if(m && byNum[decodeURIComponent(m[1])]!==undefined){ show('#reader'); go(byNum[decodeURIComponent(m[1])]); return; }
  const v=h.match(/^#\/(review|grammar|notes|progress)(?:\/(.+))?/);
  if(v && App.showView){ show('#view'); App.showView(v[1],v[2]&&decodeURIComponent(v[2])); return; }
  if($('#home').classList.contains('hidden')) showHome(false); else refreshHome();
}
App.route=route;
addEventListener('popstate',route); addEventListener('hashchange',route);
App.hooks.ready.forEach(f=>f());
App.ready=true;
route();

if('serviceWorker' in navigator && location.protocol==='https:' && window.top===window){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
}
})();
