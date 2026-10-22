/* Study layer: word analysis, sentence translations, audio, recording, on-page exercises,
   highlights/notes, flashcards with spaced repetition, grammar tables, notebook, progress. */
(function(){
const App=window.App, $=s=>document.querySelector(s), $$=(s,el=document)=>[...el.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const T=window.Translit;
const STUDY_CH=BOOK.study;
const STUDY=Object.fromEntries(STUDY_CH.map(c=>[c,`study/ch${c}.json`]));           // chapters with a prepared study layer
const IMG_W=1400, IMG_H=BOOK.ih||1851;

/* ---------------- state ---------------- */
const KEY='deepakam.'+BOOK.pfx+'study.v1';
const DEF={cards:{},notes:[],ans:{},exres:{},visits:{},vdays:{},met:{},log:[],days:{},flags:{},
  set:{rate:0.8,iast:true,marks:true,newPerDay:20,voice:''}};
let S;
try{ S=Object.assign(structuredClone(DEF),JSON.parse(localStorage.getItem(KEY)||'{}')); S.set=Object.assign({},DEF.set,S.set); }catch(e){ S=structuredClone(DEF); }
let saveT; function save(){ clearTimeout(saveT); saveT=setTimeout(()=>{ try{ localStorage.setItem(KEY,JSON.stringify(S)); }catch(e){ App.toast('Could not save (storage full or blocked)'); } },250); }
const today=()=>Math.floor((Date.now()-new Date().getTimezoneOffset()*60000)/864e5);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);

/* ---------------- data ---------------- */
const DATA={}, LOADING={};
function load(ch){ if(DATA[ch]) return Promise.resolve(DATA[ch]); if(!STUDY[ch]) return Promise.resolve(null);
  return LOADING[ch]||(LOADING[ch]=fetch(STUDY[ch]).then(r=>r.json()).then(d=>{ DATA[ch]=d; return d; })); }
let GRAM=null; function loadGram(){ return GRAM?Promise.resolve(GRAM):fetch('study/grammar.json').then(r=>r.json()).then(g=>GRAM=g); }
App.hasStudy=id=>!!STUDY[id];
App.chapterProgress=c=>{ let n=0; for(let i=c.first;i<c.first+c.count;i++) if(S.visits[i]) n++; return Math.round(100*n/c.count); };
const chIdOf=i=>App.chOf(i).id;
const localOf=i=>i-App.chOf(i).first;
const globalOf=(ch,li)=>App.CH.find(c=>c.id===ch).first+li;

/* ---------------- speech ---------------- */
let warnedVoice=false;
function pickVoice(){
  if(!('speechSynthesis' in window)) return null;
  const vs=speechSynthesis.getVoices();
  if(S.set.voice){ const v=vs.find(v=>v.name===S.set.voice); if(v) return v; }
  return vs.find(v=>/^sa/i.test(v.lang))||vs.find(v=>/^hi/i.test(v.lang))||vs.find(v=>/^mr/i.test(v.lang))||vs.find(v=>/^ne/i.test(v.lang))||null;
}
if('speechSynthesis' in window){ speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged=()=>{}; }
let wordTimer=null;
function stopSpeech(){ try{speechSynthesis.cancel();}catch(e){} clearInterval(wordTimer); $$('.w.say').forEach(x=>x.classList.remove('say')); }
function speak(text,{rate,onword,onend}={}){
  if(!('speechSynthesis' in window)){ App.toast('Speech is not available in this browser'); onend&&onend(); return; }
  stopSpeech();
  const clean=text.replace(/[।॥]/g,' , ').replace(/[—–‘’'"!?]/g,' ').replace(/\s+/g,' ').trim();
  const u=new SpeechSynthesisUtterance(clean);
  const v=pickVoice(); if(v){u.voice=v;u.lang=v.lang;} else { u.lang='hi-IN'; if(!warnedVoice){ warnedVoice=true; App.toast('No Hindi/Sanskrit voice found — install one in your device speech settings',3500);} }
  u.rate=rate||S.set.rate;
  const words=clean.split(' ').filter(w=>w&&w!==',');
  let got=false;
  if(onword){
    u.onboundary=e=>{ if(e.name&&e.name!=='word') return; got=true; clearInterval(wordTimer);
      const before=clean.slice(0,e.charIndex).split(' ').filter(w=>w&&w!==',').length; onword(Math.min(before,words.length-1)); };
    u.onstart=()=>{ setTimeout(()=>{ if(got) return; let k=0; onword(0);
      const per=words.map(w=>(w.length*90+160)/u.rate); let acc=0; const marks=per.map(p=>acc+=p);
      const t0=Date.now(); wordTimer=setInterval(()=>{ const el=Date.now()-t0+per[0]; while(k<words.length-1 && el>marks[k]) { k++; onword(k);} },60); },350); };
  }
  u.onend=u.onerror=()=>{ clearInterval(wordTimer); onend&&onend(); };
  speechSynthesis.speak(u);
}

/* ---------------- recordings (IndexedDB) ---------------- */
const RDB={db:null};
function idb(){ if(RDB.db) return Promise.resolve(RDB.db); return new Promise((res,rej)=>{ try{ const r=indexedDB.open('deepakam-'+BOOK.pfx+'rec',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('rec'); r.onsuccess=()=>{RDB.db=r.result;res(r.result);}; r.onerror=()=>rej(r.error);}catch(e){rej(e);} }); }
async function recGet(k){ try{ const db=await idb(); return await new Promise(r=>{ const q=db.transaction('rec').objectStore('rec').get(k); q.onsuccess=()=>r(q.result||null); q.onerror=()=>r(null); }); }catch(e){ return null; } }
async function recPut(k,v){ try{ const db=await idb(); db.transaction('rec','readwrite').objectStore('rec').put(v,k); }catch(e){} }
let recorder=null;
async function toggleRecord(btn,k,done){
  if(recorder){ recorder.stop(); return; }
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){ App.toast('Recording is not supported in this browser'); return; }
  let stream; try{ stream=await navigator.mediaDevices.getUserMedia({audio:true}); }catch(e){ App.toast('Microphone permission was not given'); return; }
  const mr=new MediaRecorder(stream), chunks=[];
  mr.ondataavailable=e=>chunks.push(e.data);
  mr.onstop=async()=>{ stream.getTracks().forEach(t=>t.stop()); recorder=null; btn.classList.remove('rec'); btn.innerHTML='🎙 Record';
    await recPut(k,new Blob(chunks,{type:mr.mimeType||'audio/webm'})); App.toast('Recording saved'); done&&done(); };
  mr.start(); recorder=mr; btn.classList.add('rec'); btn.innerHTML='⏹ Stop';
  setTimeout(()=>{ if(recorder===mr) mr.stop(); },20000);
}
async function playMine(k,onend){ const b=await recGet(k); if(!b){ App.toast('No recording yet'); return; } const a=new Audio(URL.createObjectURL(b)); a.onended=onend||null; a.play(); }

/* ---------------- helpers ---------------- */
function cropHTML(globalPage,box,maxW,hiBox,maxH){
  const pad=0.012; let [x,y,w,h]=box; x=Math.max(0,x-pad); y=Math.max(0,y-pad); w=Math.min(1-x,w+2*pad); h=Math.min(1-y,h+2*pad);
  let scale=maxW/(w*IMG_W); if(maxH && h*IMG_H*scale>maxH) scale=maxH/(h*IMG_H);
  const W=Math.round(w*IMG_W*scale), H=Math.round(h*IMG_H*scale);
  const src=App.P[globalPage].src;
  let hi='';
  if(hiBox){ hi=`<i style="position:absolute;left:${(hiBox[0]-x)*IMG_W*scale}px;top:${(hiBox[1]-y)*IMG_H*scale}px;width:${hiBox[2]*IMG_W*scale}px;height:${hiBox[3]*IMG_H*scale}px;background:rgba(255,190,0,.35);border-radius:3px"></i>`; }
  return `<div class="crop" style="position:relative;width:${W}px;height:${H}px;background-image:url('${src}');background-size:${IMG_W*scale}px auto;background-position:${-x*IMG_W*scale}px ${-y*IMG_H*scale}px">${hi}</div>`;
}
const pct=b=>`left:${b[0]*100}%;top:${b[1]*100}%;width:${b[2]*100}%;height:${b[3]*100}%`;
const iastHTML=s=>S.set.iast?`<div class="ia">${esc(T.iast(s))}</div>`:'';

/* ---------------- popover ---------------- */
const pop=$('#pop'); let popAnchor=null;
function openPop(html,anchor){
  pop.innerHTML=`<button class="ib x" title="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`+html;
  pop.classList.remove('hidden'); pop.querySelector('.x').onclick=closePop; popAnchor=anchor;
  if(innerWidth>760 && anchor){
    const r=anchor.getBoundingClientRect(), pw=pop.offsetWidth, ph=pop.offsetHeight;
    let left=Math.min(Math.max(8,r.left+r.width/2-pw/2),innerWidth-pw-8);
    let top=r.bottom+10; if(top+ph>innerHeight-8) top=Math.max(8,r.top-ph-10);
    pop.style.left=left+'px'; pop.style.top=top+'px';
  } else { pop.style.left=''; pop.style.top=''; }
}
function closePop(){ pop.classList.add('hidden'); $$('.w.act').forEach(x=>x.classList.remove('act')); popAnchor=null; }
App.closePop=closePop; App.popOpen=()=>!pop.classList.contains('hidden');
document.addEventListener('pointerdown',e=>{ if(pop.classList.contains('hidden')) return; if(e.target.closest('#pop,.w,.hlpin,.sent .sa-t')) return; closePop(); },true);

/* ---------------- cards & SRS ---------------- */
function addCard(c){
  const id=c.id||`${c.type}:${c.ch}:${c.ref}`;
  if(S.cards[id]){ App.toast('Already in your review deck'); return false; }
  S.cards[id]=Object.assign({id,due:today(),ivl:0,ease:2.5,reps:0,lapses:0,isNew:true,created:Date.now()},c);
  save(); updateBadges(); App.toast('Added to your review deck ★'); return true;
}
function cardTags(c){
  const d=DATA[c.ch]; if(!d) return [];
  if(c.type==='word'||c.type==='gloss'){ const l=c.type==='word'?c.ref:d.gloss[c.ref]?.l; return l!=null&&d.lex[l]?(d.lex[l].tags||[]):[]; }
  return [];
}
function schedule(c,g){
  const t=today(); let {ivl,ease,reps}=c;
  if(g===1){ c.lapses++; reps=0; ivl=0; ease=Math.max(1.3,ease-0.2); }
  else if(g===2){ ivl=reps===0?1:Math.max(1,Math.round(ivl*1.2)); ease=Math.max(1.3,ease-0.15); reps++; }
  else if(g===3){ ivl=reps===0?1:reps===1?3:Math.round(ivl*ease); reps++; }
  else { ivl=reps===0?4:Math.round(Math.max(ivl,1)*ease*1.3); ease+=0.15; reps++; }
  Object.assign(c,{ivl,ease,reps,due:t+ivl,isNew:false,last:t});
  S.log.push({d:t,g,id:c.id,tags:cardTags(c)}); if(S.log.length>5000) S.log.splice(0,1000);
  S.days[t]=(S.days[t]||0)+1; save();
}
function preview(c,g){ if(g===1) return '<10 min'; const x=Object.assign({},c); const t=today();
  let {ivl,ease,reps}=x; if(g===2) ivl=reps===0?1:Math.max(1,Math.round(ivl*1.2)); else if(g===3) ivl=reps===0?1:reps===1?3:Math.round(ivl*ease); else ivl=reps===0?4:Math.round(Math.max(ivl,1)*ease*1.3);
  return ivl<31?`${ivl} d`:ivl<365?`${Math.round(ivl/30)} mo`:`${(ivl/365).toFixed(1)} y`; }
function newToday(){ const t=today(); return S.log.filter(l=>l.d===t&&l.first).length; }
function dueCards(){ const t=today(); const all=Object.values(S.cards);
  const due=all.filter(c=>!c.isNew&&c.due<=t); const fresh=all.filter(c=>c.isNew).sort((a,b)=>a.created-b.created).slice(0,Math.max(0,S.set.newPerDay-newToday()));
  return {due,fresh}; }
function updateBadges(){ const {due,fresh}=dueCards(); const n=due.length+fresh.length;
  $('#dDue').textContent=n; $('#dDueTxt').textContent=n?`cards to review today (${fresh.length} new)`:'nothing due — well done';
  $('#dNotes').textContent=S.notes.length; $('#dMet').textContent=Object.keys(S.met).length; $('#dStreak').textContent=streak(); }
function streak(){ const days=new Set([...Object.keys(S.days),...Object.keys(S.vdays)].map(Number)); let t=today(); if(!days.has(t)) t--; let n=0; while(days.has(t)){n++;t--;} return n; }

/* ---------------- page decoration ---------------- */
App.hooks.render.push(pages=>{
  const t=today(); let firstVisit=false;
  pages.forEach(({i,pg,ov})=>{
    if(!S.visits[i]) firstVisit=true;
    S.visits[i]=S.visits[i]||Date.now(); S.vdays[t]=1;
    $('#spread').classList.toggle('study-off',!S.set.marks);
    drawNotes(i,ov);
    const ch=chIdOf(i);
    if(STUDY[ch]) load(ch).then(d=>{ if(pg.isConnected) decorate(i,pg,ov,d); });
  });
  save();
  const anyStudy=pages.some(p=>STUDY[chIdOf(p.i)]);
  $('#studyBadge').classList.toggle('hidden',!anyStudy||App.panelOpen);
  if(App.panelOpen) renderPanel();
  closePop();
});
function decorate(i,pg,ov,d){
  const ch=chIdOf(i), li=localOf(i), P=d.pages[li]; if(!P) return;
  // sentence boxes (for flashing) and words
  const frag=document.createDocumentFragment();
  P.sents.forEach((s,k)=>s.b.forEach(b=>{ const e=document.createElement('div'); e.className='sb'; e.dataset.o=k; e.style.cssText=pct(b); frag.appendChild(e); }));
  P.words.forEach((w,k)=>{ const e=document.createElement('div'); e.className='w'; e.dataset.k=k; e.style.cssText=pct(w.b); e.title=d.lex[w.l].f;
    e.onclick=ev=>{ ev.stopPropagation(); if(App.marking) return; openWord(ch,li,k,e); };
    frag.appendChild(e);
    const t=d.lex[w.l].t; if(t && !S.met[t]){ S.met[t]=today(); }
  });
  ov.prepend(frag);
  // exercise blanks
  d.ex.filter(e=>e.p===li).forEach(e=>{
    const soft=e.ex==='free'||e.k==='free'||e.k==='sample'; const inp=document.createElement('input'); inp.className='blank'+(soft?' free':''); inp.dataset.id=e.id; inp.style.cssText=pct(e.b);
    inp.setAttribute('aria-label',`${e.lab} answer`); inp.autocomplete='off'; inp.spellcheck=false; inp.lang='sa';
    inp.placeholder=soft?'…':''; inp.value=S.ans[e.id]||'';
    const r=S.exres[e.id]; if(r&&!soft) inp.classList.add(r.ok?'ok':'bad');
    inp.addEventListener('input',()=>{ const v=inp.value; if(/[a-zA-Z~^]/.test(v) && /\s$/.test(v)) inp.value=convertLatin(v); S.ans[e.id]=inp.value; inp.classList.remove('ok','bad'); delete S.exres[e.id]; save(); });
    inp.addEventListener('blur',()=>{ if(/[a-zA-Z~^]/.test(inp.value)){ inp.value=convertLatin(inp.value); S.ans[e.id]=inp.value; save(); } });
    inp.addEventListener('keydown',ev=>{ if(ev.key==='Enter'){ ev.preventDefault(); const all=$$('.blank'); const n=all[all.indexOf(inp)+1]; if(n) n.focus(); else inp.blur(); } });
    inp.addEventListener('focus',()=>{ if(!S.flags.blankHint){ S.flags.blankHint=1; save(); App.toast('Type in Devanagari, or in Roman (aa, ii, M = ं, H = ः) — it converts when you press space. Check answers in the study panel.',6000);} });
    ov.appendChild(inp);
  });
  // the book's word tables become review cards the first time you open the chapter
  if(d.gloss && !S.flags['gloss'+ch]){
    S.flags['gloss'+ch]=1; let n=0;
    d.gloss.forEach((g,k)=>{ const id=`gloss:${ch}:${k}`; if(!S.cards[id]){ S.cards[id]={id,type:'gloss',ch,ref:k,p:globalOf(ch,g.p),b:g.b,due:today(),ivl:0,ease:2.5,reps:0,lapses:0,isNew:true,created:Date.now()+k}; n++; } });
    save(); updateBadges(); App.toast(`${n} words from this chapter's word-meaning tables were added to your review deck`,4500);
  }
  save();
}
const convertLatin=v=>v.replace(/[A-Za-z~^.|]+/g,m=>/[A-Za-z]/.test(m)?T.itrans(m):m).replace(/\s+$/,' ');

/* ---------------- word popup ---------------- */
function openWord(ch,li,k,el){
  const d=DATA[ch], P=d.pages[li], w=P.words[k], L=d.lex[w.l];
  $$('.w.act').forEach(x=>x.classList.remove('act')); el.classList.add('act');
  const sOcc=w.s!=null?P.sents[w.s]:null, sent=sOcc?d.sents[sOcc.s]:null;
  const gi=globalOf(ch,li);
  let html=`<div class="form sa">${esc(L.f)}</div>${iastHTML(L.f)}
    <div><span class="kind">${esc(L.p)}</span>${L.sd?`<span class="kind">सन्धिः: ${esc(L.sd)}</span>`:''}</div>
    <dl>${L.l&&L.l!==L.f?`<dt>मूलम्</dt><dd class="sa">${esc(L.l)}</dd>`:''}
    ${L.g?`<dt>व्याकरणम्</dt><dd>${esc(L.g)}${L.ge?`<br><small class="muted">${esc(L.ge)}</small>`:''}</dd>`:''}
    <dt>हिन्दी</dt><dd>${esc(L.hi)}</dd><dt>English</dt><dd>${esc(L.en)}</dd></dl>
    <div class="acts"><button class="mini" data-a="say">🔊 Listen</button>${L.t?`<button class="mini" data-a="tbl">▦ All forms</button>`:''}<button class="mini" data-a="save">★ Save word</button></div>`;
  if(sent){
    html+=`<hr><div class="muted" style="font-size:12px;margin-bottom:4px">IN THIS SENTENCE</div><div class="sa" style="font-size:19px;line-height:1.5">${esc(sent.sa)}</div>${iastHTML(sent.sa)}
    <div class="acts"><button class="mini" data-a="play">🔊 Play</button><button class="mini" data-a="tr">Show translation</button><button class="mini" data-a="ssave">★ Save sentence</button></div>
    <div class="tr hidden"><div class="hi">${esc(sent.hi)}</div><div>${esc(sent.en)}</div>${sent.n?`<div class="note">💡 ${esc(sent.n)}</div>`:''}</div>`;
  }
  openPop(html,el);
  pop.querySelector('[data-a=say]').onclick=()=>speak(L.f);
  pop.querySelector('[data-a=save]').onclick=()=>addCard({type:'word',ch,ref:w.l,p:gi,b:sOcc?unionB(sOcc.b):w.b,hb:w.b});
  const tb=pop.querySelector('[data-a=tbl]'); if(tb) tb.onclick=()=>{ location.hash=`#/grammar/${L.t}:${L.f}`; };
  if(sent){
    pop.querySelector('[data-a=play]').onclick=()=>playSentence(ch,li,w.s);
    const trb=pop.querySelector('[data-a=tr]'); trb.onclick=()=>{ const t=pop.querySelector('.tr'); t.classList.toggle('hidden'); trb.textContent=t.classList.contains('hidden')?'Show translation':'Hide translation'; };
    pop.querySelector('[data-a=ssave]').onclick=()=>addCard({type:'sent',ch,ref:sOcc.s,p:gi,b:unionB(sOcc.b)});
  }
}
const unionB=bs=>{ const x0=Math.min(...bs.map(b=>b[0])), y0=Math.min(...bs.map(b=>b[1])), x1=Math.max(...bs.map(b=>b[0]+b[2])), y1=Math.max(...bs.map(b=>b[1]+b[3])); return [x0,y0,x1-x0,y1-y0]; };
function pageEl(gi){ return $(`.pg[data-i="${gi}"]`); }
function playSentence(ch,li,o,rate,onend){
  const d=DATA[ch], s=d.pages[li].sents[o], sent=d.sents[s.s], pg=pageEl(globalOf(ch,li));
  const els=pg?s.w.map(k=>pg.querySelector(`.w[data-k="${k}"]`)).filter(Boolean):[];
  flash(ch,li,o);
  speak(sent.sa,{rate,onword:i=>{ els.forEach(e=>e.classList.remove('say')); if(els[i]) els[i].classList.add('say'); },
    onend:()=>{ els.forEach(e=>e.classList.remove('say')); onend&&onend(); }});
}
function flash(ch,li,o){ const pg=pageEl(globalOf(ch,li)); if(!pg) return; const bs=$$(`.sb[data-o="${o}"]`,pg);
  bs.forEach(b=>b.classList.add('flash')); if(bs[0]) bs[0].scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'}); setTimeout(()=>bs.forEach(b=>b.classList.remove('flash')),1600); }

/* ---------------- highlights, notes & region cards ---------------- */
const COLORS={y:'#ffd60a',g:'#50c878',p:'#ff6996',b:'#50a0ff'};
function drawNotes(i,ov){
  $$('.hl,.hlpin',ov).forEach(e=>e.remove());
  S.notes.filter(n=>n.p===i).forEach(n=>{
    const e=document.createElement('div'); e.className=`hl ${n.c}${n.text?' has-note':''}${n.card?' card-mark':''}`; e.style.cssText=pct(n.b)+';pointer-events:none';
    ov.prepend(e);
    const pin=document.createElement('button'); pin.className='hlpin'; pin.title=n.text||'Edit highlight';
    pin.style.cssText=`position:absolute;left:calc(${(n.b[0]+n.b[2])*100}% - 9px);top:calc(${n.b[1]*100}% - 9px);width:18px;height:18px;border-radius:50%;border:2px solid #fff;background:${COLORS[n.c]};cursor:pointer;padding:0;z-index:3;box-shadow:0 1px 3px rgba(0,0,0,.3)`;
    pin.onclick=ev=>{ ev.stopPropagation(); openNote(n,pin); };
    ov.appendChild(pin);
  });
}
function redrawNotes(){ $$('#spread .pg').forEach(pg=>drawNotes(+pg.dataset.i,pg.querySelector('.ov'))); }
function setMarking(on){
  App.marking=on; $('#markBtn').classList.toggle('on',on); $('#markHint').classList.toggle('hidden',!on);
  $$('.ov').forEach(o=>o.classList.toggle('marking',on));
  requestAnimationFrame(()=>App.layout&&App.layout());
}
$('#markBtn').onclick=()=>setMarking(!App.marking);
$('#markOff').onclick=()=>setMarking(false);
App.hooks.render.push(()=>{ if(App.marking) $$('.ov').forEach(o=>o.classList.add('marking')); });
let drag=null;
document.addEventListener('pointerdown',e=>{
  if(!App.marking) return; const ov=e.target.closest('.ov'); if(!ov||e.target.closest('.hlpin')) return;
  e.preventDefault(); const r=ov.getBoundingClientRect();
  drag={ov,r,x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height,el:document.createElement('div')};
  drag.el.className='drag'; ov.appendChild(drag.el); ov.setPointerCapture?.(e.pointerId);
});
document.addEventListener('pointermove',e=>{ if(!drag) return; const {r}=drag; const x=(e.clientX-r.left)/r.width, y=(e.clientY-r.top)/r.height;
  const b=[Math.min(x,drag.x),Math.min(y,drag.y),Math.abs(x-drag.x),Math.abs(y-drag.y)].map(v=>Math.max(0,Math.min(1,v))); drag.b=b; drag.el.style.cssText=pct(b); });
document.addEventListener('pointerup',()=>{ if(!drag) return; const d=drag; drag=null; d.el.remove();
  if(!d.b||d.b[2]<0.015||d.b[3]<0.008) return;
  const i=+d.ov.parentElement.dataset.i; const n={id:uid(),p:i,b:d.b.map(v=>+v.toFixed(4)),c:'y',text:'',back:'',card:false,t:Date.now()};
  S.notes.push(n); save(); redrawNotes(); updateBadges();
  const pin=[...d.ov.querySelectorAll('.hlpin')].pop(); openNote(n,pin,true);
  if(App.panelOpen) renderPanel();
});
function openNote(n,anchor,isNew){
  const cardOn=!!S.cards['region:'+n.id];
  openPop(`<div style="font-weight:600;margin-bottom:6px">${isNew?'New highlight':'Highlight'} · page ${App.P[n.p].n}</div>
    ${cropHTML(n.p,n.b,330,null,160)}
    <div class="colors">${Object.keys(COLORS).map(c=>`<button data-c="${c}" class="${n.c===c?'on':''}" style="background:${COLORS[c]}" title="${c}"></button>`).join('')}</div>
    <label class="muted" style="font-size:13px">Note</label><textarea data-f="text" placeholder="Your note, question or explanation…">${esc(n.text)}</textarea>
    <hr><label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" data-f="card" ${cardOn?'checked':''}> Make this a flashcard</label>
    <div data-cardf class="${cardOn?'':'hidden'}" style="margin-top:6px"><label class="muted" style="font-size:13px">Answer side (what you want to recall)</label><textarea data-f="back" placeholder="e.g. the meaning or translation">${esc(n.back||'')}</textarea></div>
    <div class="acts"><button class="btn sm primary" data-a="ok">Save</button><button class="btn sm" data-a="del">Delete</button></div>`,anchor);
  $$('.colors button',pop).forEach(b=>b.onclick=()=>{ n.c=b.dataset.c; $$('.colors button',pop).forEach(x=>x.classList.toggle('on',x===b)); save(); redrawNotes(); });
  const cb=pop.querySelector('[data-f=card]'); cb.onchange=()=>pop.querySelector('[data-cardf]').classList.toggle('hidden',!cb.checked);
  pop.querySelector('[data-a=ok]').onclick=()=>{
    n.text=pop.querySelector('[data-f=text]').value.trim(); n.back=pop.querySelector('[data-f=back]').value.trim();
    const id='region:'+n.id;
    if(cb.checked && !S.cards[id]){ addCard({id,type:'region',ch:chIdOf(n.p),ref:n.id,p:n.p,b:n.b}); }
    if(!cb.checked && S.cards[id]) delete S.cards[id];
    n.card=cb.checked; save(); redrawNotes(); closePop(); updateBadges(); if(App.panelOpen) renderPanel();
  };
  pop.querySelector('[data-a=del]').onclick=()=>{ S.notes=S.notes.filter(x=>x!==n); delete S.cards['region:'+n.id]; save(); redrawNotes(); closePop(); updateBadges(); if(App.panelOpen) renderPanel(); };
  if(isNew) setTimeout(()=>pop.querySelector('[data-f=text]').focus(),50);
}

/* ---------------- study panel ---------------- */
let ptab='sent', revealAll=false;
App.panelOpen=false;
$('#studyBtn').onclick=()=>{ App.panelOpen=!App.panelOpen; $('#panel').classList.toggle('hidden',!App.panelOpen); document.body.classList.toggle('panel-open',App.panelOpen);
  $('#studyBtn').classList.toggle('on',App.panelOpen); App.render(); };
function visGroups(){ return App.visible().map(i=>({i,ch:chIdOf(i),li:localOf(i)})); }
async function renderPanel(){
  const el=$('#panel'); const vis=visGroups();
  const chs=[...new Set(vis.map(v=>v.ch).filter(c=>STUDY[c]))]; await Promise.all(chs.map(load));
  const has=vis.some(v=>STUDY[v.ch]);
  el.innerHTML=`<div class="ptabs"><button data-t="sent" class="${ptab==='sent'?'on':''}">वाक्यानि · Sentences</button><button data-t="ex" class="${ptab==='ex'?'on':''}">अभ्यासाः · Exercises</button><button data-t="notes" class="${ptab==='notes'?'on':''}">Notes</button></div><div class="pbody"></div>`;
  $$('.ptabs button',el).forEach(b=>b.onclick=()=>{ ptab=b.dataset.t; renderPanel(); });
  const body=el.querySelector('.pbody');
  if(ptab==='notes') return panelNotes(body,vis);
  if(!has){ body.innerHTML=`<div class="empty">${BOOK.full?`The full word-by-word study layer is ready for <b>chapters 1–${BOOK.full}</b>.`:'This book has its word-meaning tables as review cards (Review page).'}<br><br>On every page you can still:<br>• highlight and add notes with the ✎ tool,<br>• turn any part of a page into a flashcard,<br>• search the whole book.<br><br><button class="btn sm primary" id="goCh4">Open chapter 1 →</button></div>`;
    body.querySelector('#goCh4').onclick=()=>App.go(App.byNum['1']); return; }
  if(ptab==='sent') panelSents(body,vis); else panelEx(body,vis);
}
App.renderPanel=renderPanel;
function panelSents(body,vis){
  const items=[]; const seen=new Set();
  vis.forEach(v=>{ const d=DATA[v.ch]; if(!d) return; d.pages[v.li].sents.forEach((o,k)=>{ const key=v.ch+':'+o.s; if(seen.has(key)) return; seen.add(key); items.push({...v,o:k,s:o.s,sent:d.sents[o.s]}); }); });
  body.innerHTML=`<div class="ptools"><button class="mini ${revealAll?'on':''}" id="revAll">${revealAll?'Hide all translations':'Show all translations'}</button>
    <span class="muted">Try each sentence first, then reveal.</span></div>`+
    (items.length?'':'<div class="empty">No sentences on this page.</div>')+
    items.map((it,n)=>`<div class="sent" data-n="${n}"><div class="sa-t sa" title="Show on page">${esc(it.sent.sa)}</div>${iastHTML(it.sent.sa)}
      <div class="row"><button class="mini" data-a="play">🔊</button><button class="mini" data-a="slow" title="Slow">🐢</button>
      <button class="mini" data-a="tr">${revealAll?'Hide':'Translation'}</button><button class="mini" data-a="rec">🎙 Record</button>
      <button class="mini hidden" data-a="mine">▶ Mine</button><button class="mini hidden" data-a="cmp" title="Book voice, then yours">⇄ Compare</button><button class="mini" data-a="save" title="Save as flashcard">★</button></div>
      <div class="tr ${revealAll?'':'hidden'}"><div class="hi">${esc(it.sent.hi)}</div><div>${esc(it.sent.en)}</div>${it.sent.n?`<div class="note">💡 ${esc(it.sent.n)}</div>`:''}</div></div>`).join('');
  body.querySelector('#revAll').onclick=()=>{ revealAll=!revealAll; renderPanel(); };
  $$('.sent',body).forEach(div=>{ const it=items[+div.dataset.n]; const rk=`${it.ch}:${it.s}`; const q=a=>div.querySelector(`[data-a=${a}]`);
    div.querySelector('.sa-t').onclick=()=>flash(it.ch,it.li,it.o);
    q('play').onclick=()=>playSentence(it.ch,it.li,it.o);
    q('slow').onclick=()=>playSentence(it.ch,it.li,it.o,Math.max(0.45,S.set.rate*0.65));
    q('tr').onclick=()=>{ const t=div.querySelector('.tr'); t.classList.toggle('hidden'); q('tr').textContent=t.classList.contains('hidden')?'Translation':'Hide'; };
    const showMine=()=>{ q('mine').classList.remove('hidden'); q('cmp').classList.remove('hidden'); };
    recGet(rk).then(b=>{ if(b) showMine(); });
    q('rec').onclick=()=>toggleRecord(q('rec'),rk,showMine);
    q('mine').onclick=()=>playMine(rk);
    q('cmp').onclick=()=>playSentence(it.ch,it.li,it.o,null,()=>setTimeout(()=>playMine(rk),400));
    q('save').onclick=()=>addCard({type:'sent',ch:it.ch,ref:it.s,p:it.i,b:unionB(DATA[it.ch].pages[it.li].sents[it.o].b)});
  });
}
const EXTAG={ex2:'ex2',ex3:'ex3',ex5:'ex5',proj:'proj',ex4:'ex4'};
function panelEx(body,vis){
  const groups=[];
  vis.forEach(v=>{ const d=DATA[v.ch]; if(!d) return;
    const exs=d.ex.filter(e=>e.p===v.li); const kinds=[...new Set(exs.map(e=>e.ex))];
    kinds.forEach(k=>groups.push({...v,k,items:exs.filter(e=>e.ex===k),info:d.exinfo[k]||{title:k,en:''}}));
    (d.sel||[]).filter(x=>x.p===v.li).forEach(x=>groups.push({...v,k:x.id,sel:x,info:d.exinfo[x.id]||x}));
  });
  if(!groups.length){
    const d=DATA[vis[0].ch]; const ps=d?[...new Set([...d.ex.map(e=>e.p),...(d.sel||[]).map(x=>x.p)])].sort((a,b)=>a-b).map(li=>App.P[globalOf(vis[0].ch,li)].n):[];
    body.innerHTML=`<div class="empty">No exercises on this page.${ps.length?` This chapter's exercises are on page${ps.length>1?'s':''} ${ps.join(', ')}.`:''}</div>`; return; }
  body.innerHTML=groups.map((g,n)=>{ const free=!g.sel&&g.items.every(e=>e.k==='free'||e.ex==='free');
    return `<div class="exgrp" data-n="${n}"><h4 class="sa">${esc(g.info.title)}</h4><p>${esc(g.info.en)}</p>
    ${g.sel?selHTML(g):''}
    ${free?'<p>Your entries are saved automatically.</p>':`<div class="acts" style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm primary" data-a="chk">Check</button><button class="btn sm" data-a="show">Show answers</button><button class="btn sm" data-a="clr">Clear</button></div>`}
    <div class="exres"></div></div>`; }).join('');
  $$('.exgrp',body).forEach(div=>{ const g=groups[+div.dataset.n]; const res=div.querySelector('.exres'), q=a=>div.querySelector(`[data-a=${a}]`);
    if(!q('chk')) return;
    if(g.sel){ wireSel(div,g,res); return; }
    const tag=g.info.tag||EXTAG[g.k]||'exercise';
    const inputs=()=>g.items.map(e=>({e,inp:$(`.blank[data-id="${e.id}"]`)}));
    q('chk').onclick=()=>{ let ok=0, n=0, wrong=[], samples=[];
      inputs().forEach(({e,inp})=>{ const v=S.ans[e.id]||'';
        if(e.k==='free'||e.ex==='free') return;
        if(e.k==='sample'){ samples.push(e); return; }
        n++; const good=v.trim()!=='' && e.a.some(a=>a.startsWith('^')?T.normAns(v).startsWith(T.normAns(a.slice(1))):T.normAns(a)===T.normAns(v));
        S.exres[e.id]={ok:good,t:today()}; if(good) ok++; else wrong.push(e);
        if(inp){ inp.classList.toggle('ok',good); inp.classList.toggle('bad',!good); } });
      if(wrong.length) S.log.push({d:today(),g:0,ex:g.k,tags:[tag],n:wrong.length});
      save();
      res.innerHTML=(n?`<b>${ok} / ${n} correct.</b>`+(wrong.length?`<div class="why">${wrong.map(e=>`${esc(e.lab)} — ${S.ans[e.id]?`you wrote “${esc(S.ans[e.id])}”. `:'(empty) '}${e.why?esc(e.why):''}`).join('<br>')}</div>`:' 🎉'):'')+
        (samples.length?`<div class="why" style="margin-top:6px">Open answers — compare yours with a sample:<br>${samples.map(e=>`${esc(e.lab)} → <span class="sa" style="color:var(--ink)">${esc(e.a.join(' / '))}</span>`).join('<br>')}</div>`:'');
    };
    q('show').onclick=()=>{ res.innerHTML='<div class="why">'+g.items.filter(e=>e.a&&e.a.length).map(e=>`${esc(e.lab)} → <span class="sa" style="font-size:16px;color:var(--ink)">${esc(e.a.map(a=>a.startsWith('^')?`any word starting with ${a.slice(1)}`:a).join(' / '))}</span>${e.k==='sample'?' <small>(sample)</small>':''}`).join('<br>')+'</div>'; };
    q('clr').onclick=()=>{ inputs().forEach(({e,inp})=>{ delete S.ans[e.id]; delete S.exres[e.id]; if(inp){inp.value='';inp.classList.remove('ok','bad');} }); save(); res.innerHTML=''; };
  });
}
const selKey=(g,r)=>`sel:${g.ch}:${g.sel.id}:${r}`;
function selHTML(g){
  const x=g.sel; const pools=x.cols.map((c,ci)=>[...new Set(x.rows.map(r=>r.a[ci]).filter(Boolean).concat((x.extra&&x.extra[ci])||[]))].sort());
  return x.rows.map((m,r)=>{ const a=S.ans[selKey(g,r)]||{}; return `<div class="match-row" data-r="${r}"><div class="q">${esc(m.q)}</div>
    ${x.cols.map((c,ci)=>`<select data-c="${ci}"><option value="">— ${esc(c)} —</option>${(m.opts||pools[ci]).map(o=>`<option ${a[ci]===o?'selected':''}>${esc(o)}</option>`).join('')}</select>`).join('')}</div>`; }).join('')+'<div style="height:8px"></div>';
}
function wireSel(div,g,res){
  const x=g.sel, tag=g.info.tag||EXTAG[x.id]||'exercise';
  $$('select',div).forEach(s=>s.onchange=()=>{ const r=s.closest('.match-row').dataset.r; const k=selKey(g,r); const a=S.ans[k]||(S.ans[k]={}); a[s.dataset.c]=s.value; s.classList.remove('ok','bad'); save(); });
  div.querySelector('[data-a=chk]').onclick=()=>{ let ok=0,tot=0;
    $$('.match-row',div).forEach(row=>{ const r=+row.dataset.r; $$('select',row).forEach(s=>{ tot++; const good=s.value===x.rows[r].a[+s.dataset.c]; if(good) ok++; s.classList.toggle('ok',good); s.classList.toggle('bad',!good); }); });
    S.exres[`sel:${g.ch}:${x.id}`]={ok:ok===tot,t:today(),score:ok,tot}; if(ok<tot) S.log.push({d:today(),g:0,ex:x.id,tags:[tag],n:tot-ok}); save();
    res.innerHTML=`<b>${ok} / ${tot} correct.</b>`+(ok<tot&&x.hint?`<div class="why">Hint: ${esc(x.hint)}</div>`:ok===tot?' 🎉':''); };
  div.querySelector('[data-a=show]').onclick=()=>{ $$('.match-row',div).forEach(row=>{ const r=+row.dataset.r; $$('select',row).forEach(s=>{ s.value=x.rows[r].a[+s.dataset.c]; }); }); res.innerHTML='<div class="why">Answers filled in.</div>'; };
  div.querySelector('[data-a=clr]').onclick=()=>{ x.rows.forEach((m,r)=>delete S.ans[selKey(g,r)]); save(); renderPanel(); };
}
function panelNotes(body,vis){
  const ns=S.notes.filter(n=>vis.some(v=>v.i===n.p));
  body.innerHTML=`<div class="ptools"><button class="mini ${App.marking?'on':''}" id="pmk">✎ ${App.marking?'Stop marking':'Highlight a part of the page'}</button><a class="mini" href="#/notes">All notes →</a></div>`+
    (ns.length?ns.map(n=>`<div class="note-item" data-id="${n.id}">${cropHTML(n.p,n.b,120,null,80)}<div style="font-size:14px"><b style="color:${COLORS[n.c]}">●</b> ${esc(n.text||'(no note)')}${n.card?' <span class="muted">· ★ card</span>':''}</div></div>`).join('')
      :'<div class="empty">No highlights on these pages yet. Use ✎ and drag across any part of a page — a word, a line, a picture, a table cell.</div>');
  body.querySelector('#pmk').onclick=()=>{ setMarking(!App.marking); renderPanel(); };
  $$('.note-item',body).forEach(it=>it.onclick=()=>{ const n=S.notes.find(x=>x.id===it.dataset.id); const pin=$$('.hlpin').find(p=>p.title===(n.text||'Edit highlight')); openNote(n,pin||it); });
}

/* ---------------- views ---------------- */
let rv=null;
App.showView=async function(name,arg){
  closePop(); stopSpeech();
  $$('.vnav a').forEach(a=>a.classList.toggle('on',a.getAttribute('href')==='#/'+name));
  const titles={review:'पुनरावृत्तिः · Review',grammar:'व्याकरणम् · Grammar tables',notes:'टिप्पण्यः · Notebook',progress:'प्रगतिः · Progress'};
  $('#vTitle').textContent=titles[name]; document.title=titles[name]+' – '+BOOK.name;
  const body=$('#vBody'); body.innerHTML='<div class="empty">Loading…</div>'; scrollTo(0,0); $('#view').scrollTo(0,0);
  await Promise.all(Object.keys(STUDY).map(load)); await loadGram();
  if(name==='review') viewReview(body);
  else if(name==='grammar') viewGrammar(body,arg);
  else if(name==='notes') viewNotes(body);
  else viewProgress(body);
};
$('#vBack').onclick=()=>{ if(history.length>1) history.back(); else App.showHome(); };

/* review */
function cardFace(c){
  const d=DATA[c.ch];
  if(c.type==='word'){ const L=d.lex[c.ref]; return {front:`<div class="rv-front sa">${esc(L.f)}</div>${iastHTML(L.f)}<div class="rv-sub">What does it mean, and what form is it?</div>`, say:L.f,
    back:`<dl><dt>Meaning</dt><dd>${esc(L.hi)} · ${esc(L.en)}</dd>${L.l&&L.l!==L.f?`<dt>मूलम्</dt><dd class="sa">${esc(L.l)}</dd>`:''}${L.g?`<dt>Form</dt><dd>${esc(L.g)}<br><small class="muted">${esc(L.ge||'')}</small></dd>`:''}${L.sd?`<dt>सन्धिः</dt><dd>${esc(L.sd)}</dd>`:''}</dl>${L.t?`<p><a href="#/grammar/${L.t}:${encodeURIComponent(L.f)}">See all forms →</a></p>`:''}`}; }
  if(c.type==='gloss'){ const g=d.gloss[c.ref]; const L=g.l!=null?d.lex[g.l]:null; return {front:`<div class="rv-front sa">${esc(g.w)}</div>${iastHTML(g.w)}<div class="rv-sub">From the book's word-meaning table</div>`, say:g.w,
    back:`<dl><dt>Sanskrit synonym</dt><dd class="sa">${esc(g.syn)}</dd><dt>हिन्दी</dt><dd>${esc(g.hi)}</dd><dt>English</dt><dd>${esc(g.en)}</dd>${L&&L.g?`<dt>Form</dt><dd>${esc(L.g)}<br><small class="muted">${esc(L.ge||'')}</small></dd>`:''}</dl>`}; }
  if(c.type==='sent'){ const s=d.sents[c.ref]; return {front:`<div class="rv-front sa" style="font-size:26px">${esc(s.sa)}</div>${iastHTML(s.sa)}<div class="rv-sub">Translate it in your head</div>`, say:s.sa,
    back:`<div class="hi" style="font-weight:500">${esc(s.hi)}</div><div>${esc(s.en)}</div>${s.n?`<div class="muted" style="font-size:14px;margin-top:6px">💡 ${esc(s.n)}</div>`:''}`}; }
  const n=S.notes.find(x=>x.id===c.ref); return {front:`<div class="rv-sub">Your own card</div>`, back:`<div>${esc(n?.back||n?.text||'(no answer written — edit the highlight to add one)')}</div>`};
}
function viewReview(body){
  const {due,fresh}=dueCards();
  rv={queue:[...due.sort(()=>Math.random()-.5),...fresh],done:0,again:0,shown:false};
  nextCard(body);
}
function nextCard(body){
  if(!rv.queue.length){
    const t=today(); const tomorrow=Object.values(S.cards).filter(c=>!c.isNew&&c.due===t+1).length;
    body.innerHTML=`<div class="rv"><div class="rv-card"><div class="rv-front">✓</div><h3>${rv.done?`Session complete — ${rv.done} reviews`:'Nothing to review right now'}</h3>
      <p class="muted">${Object.keys(S.cards).length?`${tomorrow} card(s) due tomorrow · ${Object.keys(S.cards).length} cards in your deck.`:'Your deck is empty. Open any chapter — its word-meaning table is added automatically — or tap ★ on any word or sentence.'}</p>
      <div class="btns" style="justify-content:center"><a class="btn primary" href="#/page/${App.store.get('lastPage')||'47'}">Back to reading</a><a class="btn" href="#/progress">See progress</a></div></div></div>`;
    updateBadges(); return;
  }
  const c=rv.queue[0]; const f=cardFace(c); rv.shown=false;
  const ctx=c.b?cropHTML(c.p,c.b,Math.min(560,innerWidth-80),c.hb,220):'';
  const isRegion=c.type==='region';
  body.innerHTML=`<div class="rv"><div class="rv-top"><span>${rv.queue.length} left${c.isNew?' · <b>new card</b>':''}</span><span>${rv.done} done</span></div>
    <div class="rv-card">${isRegion?ctx:''}${f.front}${f.say?`<div style="margin-top:8px"><button class="mini" id="rvSay">🔊 Listen</button></div>`:''}
      <div id="rvBack" class="rv-back hidden">${f.back}${!isRegion&&ctx?`<div class="muted" style="font-size:12px;margin:12px 0 4px">ON THE PAGE · p. ${App.P[c.p].n}</div>${ctx}`:''}</div>
      <div id="rvShow" style="margin-top:18px"><button class="btn primary" id="rvShowBtn">Show answer <small style="opacity:.7">(space)</small></button></div>
      <div id="rvGrades" class="grades hidden">${[['पुनः','Again',1],['कठिनम्','Hard',2],['सम्यक्','Good',3],['सरलम्','Easy',4]].map(([s,e,g])=>`<button class="g${g}" data-g="${g}">${s} · ${e}<small>${preview(c,g)} · ${g}</small></button>`).join('')}</div>
    </div><p class="muted" style="text-align:center;font-size:13px">Keys: space = show, 1–4 = grade.</p></div>`;
  if(f.say) $('#rvSay').onclick=()=>speak(f.say);
  $('#rvShowBtn').onclick=showAns;
  $$('#rvGrades button').forEach(b=>b.onclick=()=>grade(+b.dataset.g));
  function showAns(){ rv.shown=true; $('#rvBack').classList.remove('hidden'); $('#rvShow').classList.add('hidden'); $('#rvGrades').classList.remove('hidden'); }
  function grade(g){ const wasNew=c.isNew; schedule(c,g); if(wasNew) S.log[S.log.length-1].first=1; save(); rv.queue.shift(); rv.done++;
    if(g===1){ rv.queue.splice(Math.min(rv.queue.length,3),0,c); } nextCard(body); }
  rv.keys={showAns,grade};
}
addEventListener('keydown',e=>{
  if($('#view').classList.contains('hidden')||!location.hash.startsWith('#/review')||!rv||!rv.keys) return;
  if(e.target.closest('input,textarea,select')) return;
  if(e.key===' '&&!rv.shown){ e.preventDefault(); rv.keys.showAns(); }
  else if(rv.shown && /^[1-4]$/.test(e.key)) rv.keys.grade(+e.key);
});

/* grammar */
const strip=s=>T.normAns(s.replace(/\(.*?\)/g,'').replace(/^हे\s*/,''));
function viewGrammar(body,arg){
  let id=arg, form=null; if(arg&&arg.includes(':')){ [id,form]=arg.split(':'); }
  if(id && GRAM[id]){
    const g=GRAM[id]; if(!S.met[id]){ S.met[id]=today(); save(); }
    const fk=form?T.normAns(form):null;
    body.innerHTML=`<p><a href="#/grammar">← All tables</a></p><div class="box"><h3 class="sa" style="font-size:22px;font-weight:400">${esc(g.title)}</h3><p class="muted" style="margin-top:-4px">${esc(g.en)}</p>
      <div class="tbl-wrap"><table class="gt"><thead><tr><th></th>${g.cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>
      ${g.cells.map((r,ri)=>`<tr><th>${g.rows[ri]}<small>${g.rows_en[ri]}</small></th>${r.map(c=>{ const parts=c.split('/'); const here=fk&&parts.some(p=>strip(p)===fk);
        return `<td class="${here?'here':''}" data-say="${esc(c.replace(/\(.*?\)/g,''))}">${esc(c).replace(/\((.*?)\)/,'<small>($1)</small>')}</td>`; }).join('')}</tr>`).join('')}
      </tbody></table></div>
      ${g.note?`<p style="margin-bottom:0">💡 ${esc(g.note)}</p>`:''}${g.like?`<p class="muted" style="margin-bottom:0">Same pattern: <span class="sa">${esc(g.like)}</span></p>`:''}
      <p class="muted" style="font-size:13px">Tap any cell to hear it.${form?` The form you tapped — <b class="sa">${esc(form)}</b> — is highlighted.`:''}</p></div>`;
    $$('td[data-say]',body).forEach(td=>td.onclick=()=>speak(td.dataset.say));
    return;
  }
  const ids=Object.keys(GRAM); const met=ids.filter(i=>S.met[i]), un=ids.filter(i=>!S.met[i]);
  const item=i=>`<a class="gt-item ${S.met[i]?'':'unmet'}" href="#/grammar/${i}"><b>${esc(GRAM[i].title)}</b><span>${esc(GRAM[i].en)}</span></a>`;
  body.innerHTML=`<div class="box"><h3>Met in your reading (${met.length})</h3><p class="muted" style="margin-top:0;font-size:14px">A table is added here the first time you read a page containing a word of that pattern.</p>
    ${met.length?`<div class="gt-list">${met.map(item).join('')}</div>`:'<div class="empty">None yet — read a page of chapter 4 and the tables will appear here.</div>'}</div>
    <div class="box"><h3>Not met yet (${un.length})</h3><div class="gt-list">${un.map(item).join('')}</div></div>`;
}

/* notebook */
function viewNotes(body){
  if(!S.notes.length){ body.innerHTML=`<div class="box"><h3>Your notebook is empty</h3><p class="muted">While reading, tap ✎ (top bar) and drag over any part of a page to highlight it, write a note, or turn it into a flashcard.</p></div>`; return; }
  const by={}; S.notes.slice().sort((a,b)=>a.p-b.p||a.b[1]-b.b[1]).forEach(n=>{ const c=App.chOf(n.p); (by[c.id]=by[c.id]||{c,ns:[]}).ns.push(n); });
  body.innerHTML=`<div class="btns" style="margin-bottom:14px"><button class="btn" id="nbMd">⬇ Export as Markdown</button></div>`+
    Object.values(by).map(({c,ns})=>`<div class="box"><h3 class="sa" style="font-weight:400;font-size:20px">${esc(c.id==='ps'?c.label:c.label+' — '+c.title)}</h3>
      ${ns.map(n=>`<div class="note-item" style="cursor:default" data-id="${n.id}">${cropHTML(n.p,n.b,200,null,120)}
        <div style="flex:1;min-width:0"><div class="muted" style="font-size:13px"><b style="color:${COLORS[n.c]}">●</b> page ${App.P[n.p].n}${n.card?' · ★ flashcard':''}</div>
        <div style="white-space:pre-wrap;margin:4px 0">${esc(n.text||'')}</div>${n.back?`<div class="muted" style="font-size:14px">Card answer: ${esc(n.back)}</div>`:''}
        <div class="acts" style="display:flex;gap:6px;margin-top:6px"><a class="mini" href="#/page/${App.P[n.p].n}">Open page</a><button class="mini" data-del="${n.id}">Delete</button></div></div></div>`).join('')}</div>`).join('');
  $$('[data-del]',body).forEach(b=>b.onclick=()=>{ S.notes=S.notes.filter(n=>n.id!==b.dataset.del); delete S.cards['region:'+b.dataset.del]; save(); viewNotes(body); updateBadges(); });
  body.querySelector('#nbMd').onclick=()=>{
    const md='# '+BOOK.name+' — my notes\n\n'+Object.values(by).map(({c,ns})=>`## ${c.label} — ${c.title}\n\n`+ns.map(n=>`- **p. ${App.P[n.p].n}**: ${n.text||'(highlight)'}${n.back?`  \n  _Card answer:_ ${n.back}`:''}`).join('\n')).join('\n\n')+'\n';
    download('deepakam-notes.md',md,'text/markdown');
  };
}
function download(name,text,type){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type})); a.download=name; document.body.appendChild(a); a.click(); a.remove(); }

/* progress & settings */
const TAGL={dual:['Dual forms (द्विवचनम्)','a_m'],'v-as':['Forms of √अस् (अस्मि, असि, अस्ति …)','as'],pron:['Personal pronouns (अहम्, त्वम् …)','asmad'],
  q:['Question words (कः, का, के …)','kim_m'],'noun-aa-f':['-आ feminine nouns (छात्रा)','aa_f'],'noun-ii-f':['-ई feminine nouns (नर्तकी)','ii_f'],'noun-a-m':['-अ masculine nouns (छात्रः)','a_m'],
  'noun-a-n':['-अ neuter nouns (पुस्तकम्)','a_n'],'v-lot':['Imperatives (पठन्तु, लिखन्तु)','path_lot'],'v-bhv':['Present-tense verb endings (-ामि, -ति)','path'],'v-atm':['आत्मनेपद verbs (वर्तते)','vrt'],
  ex2:['Pronoun ↔ verb agreement (exercise 2)','as'],exercise:['Exercises (general)','a_m'],'v-lan':['Past tense (लङ्लकारः)','path_lan'],'v-lrt':['Future tense (लृट्लकारः)','path_lrt'],'v-vidhi':['Optative "should" (विधिलिङ्)','path_vidhi'],'v-lat':['Present tense (लट्लकारः)','path'],
  num:['Numbers (संख्याः)','eka'],'krt-ktva':['Absolutives (-त्वा, -य)','path'],'krt-tumun':['Infinitives (-तुम्)','path'],case2:['Accusative (द्वितीया)','a_m'],case3:['Instrumental (तृतीया)','a_m'],case4:['Dative (चतुर्थी)','a_m'],
  case5:['Ablative (पञ्चमी)','a_m'],case6:['Genitive (षष्ठी)','a_m'],case7:['Locative (सप्तमी)','a_m'],sandhi:['Sandhi','a_m'],ex3:['Building dual & plural sentences (exercise 3)','a_m'],ex4:['Matching sentence forms (exercise 4)','as'],ex5:['Forming questions (exercise 5)','kim_m'],proj:['अस्मद् / युष्मद् declension','asmad']};
function viewProgress(body){
  const t=today(); const cards=Object.values(S.cards);
  const nNew=cards.filter(c=>c.isNew).length, mature=cards.filter(c=>!c.isNew&&c.ivl>=21).length, learning=cards.length-nNew-mature;
  const {due,fresh}=dueCards(); const rev7=S.log.filter(l=>l.g>0&&l.d>t-7); const acc=rev7.length?Math.round(100*rev7.filter(l=>l.g>1).length/rev7.length):null;
  // weak areas: lapses + exercise misses in the last 30 days, normalised by exposure
  const miss={}, seen={};
  S.log.filter(l=>l.d>t-30).forEach(l=>{ (l.tags||[]).forEach(tg=>{ if(!TAGL[tg]) return; seen[tg]=(seen[tg]||0)+(l.n||1); if(l.g<=1) miss[tg]=(miss[tg]||0)+(l.n||1); }); });
  const weak=Object.keys(miss).map(k=>({k,m:miss[k],r:miss[k]/Math.max(seen[k],1)})).sort((a,b)=>b.m-a.m||b.r-a.r).slice(0,5);
  const exAll=Object.entries(S.exres).filter(([k])=>!k.startsWith('mt-')); const exOk=exAll.filter(([,v])=>v.ok).length;
  const days=[...Array(28)].map((_,k)=>t-27+k);
  body.innerHTML=`
  <div class="box"><h3>Today</h3><div class="stats">
    <div class="stat"><b>${due.length+fresh.length}</b><span>cards due (${fresh.length} new)</span></div>
    <div class="stat"><b>${S.days[t]||0}</b><span>reviewed today</span></div>
    <div class="stat"><b>${streak()}</b><span>day streak</span></div>
    <div class="stat"><b>${acc==null?'–':acc+'%'}</b><span>recall, last 7 days</span></div></div>
    <div style="display:flex;gap:3px;margin-top:12px" title="Activity, last 4 weeks">${days.map(d=>`<i title="${S.days[d]||0} reviews" style="flex:1;height:22px;border-radius:3px;background:${S.days[d]?`rgba(201,101,18,${Math.min(1,.25+S.days[d]/30)})`:S.vdays[d]?'rgba(201,101,18,.15)':'var(--chip)'}"></i>`).join('')}</div>
    <div class="btns" style="margin-top:14px"><a class="btn primary" href="#/review">Start review →</a></div></div>
  <div class="box"><h3>Vocabulary deck</h3><div class="stats">
    <div class="stat"><b>${cards.length}</b><span>cards</span></div><div class="stat"><b>${nNew}</b><span>not yet studied</span></div>
    <div class="stat"><b>${learning}</b><span>learning</span></div><div class="stat"><b>${mature}</b><span>well known (21+ days)</span></div></div></div>
  <div class="box"><h3>Weak areas <span class="muted" style="font-weight:400;font-size:13px">(from cards you missed and exercise mistakes, last 30 days)</span></h3>
    ${weak.length?weak.map(w=>`<div class="weak"><span>${esc(TAGL[w.k][0])}</span><span><span class="muted">${w.m} miss${w.m>1?'es':''}</span> · <a href="#/grammar/${TAGL[w.k][1]}">table →</a></span></div>`).join(''):'<div class="empty">Nothing flagged yet. Review some cards and check a few exercises — patterns in your mistakes will show up here.</div>'}</div>
  <div class="box"><h3>Exercises</h3><p style="margin:0">${exAll.length?`${exOk} of ${exAll.length} checked answers correct.`:'No exercises checked yet — open the study panel on an exercise page.'}</p></div>
  <div class="box"><h3>Reading</h3><div class="prog">${App.CH.map(c=>{ const p=App.chapterProgress(c); return `<span class="sa">${esc(c.id==='ps'?c.label:c.title)}</span><span class="pbar"><i style="width:${p}%"></i></span><span class="muted">${p}%</span>`; }).join('')}</div></div>
  <div class="box" id="settings"><h3>Settings</h3>
    <div class="set-row"><span>Voice</span><select id="sVoice"><option value="">Automatic (Sanskrit / Hindi)</option></select></div>
    <div class="set-row"><span>Speech speed <b id="sRateV">${S.set.rate}</b></span><input type="range" id="sRate" min="0.5" max="1.2" step="0.05" value="${S.set.rate}"> <button class="mini" id="sTest">🔊 Test</button></div>
    <div class="set-row"><label><input type="checkbox" id="sIast" ${S.set.iast?'checked':''}> Show Roman transliteration (IAST) under Sanskrit</label></div>
    <div class="set-row"><label><input type="checkbox" id="sMarks" ${S.set.marks?'checked':''}> Underline tappable words on the page</label></div>
    <div class="set-row"><span>New cards per day</span><input type="number" id="sNew" min="0" max="200" value="${S.set.newPerDay}" style="width:80px"></div>
    <div class="set-row"><span>Backup — your data lives only in this browser</span><span class="btns"><button class="btn sm" id="sExp">⬇ Export backup</button><label class="btn sm">⬆ Restore<input type="file" id="sImp" accept=".json,application/json" hidden></label><button class="btn sm" id="sReset">Reset all</button></span></div>
  </div>`;
  const vs=('speechSynthesis' in window)?speechSynthesis.getVoices().filter(v=>/^(sa|hi|mr|ne|en-IN)/i.test(v.lang)):[];
  const sv=$('#sVoice'); vs.forEach(v=>{ const o=document.createElement('option'); o.value=v.name; o.textContent=`${v.name} (${v.lang})`; if(v.name===S.set.voice) o.selected=true; sv.appendChild(o); });
  if(!vs.length) sv.insertAdjacentHTML('afterend','<small class="muted">No Hindi/Sanskrit voices found on this device.</small>');
  sv.onchange=()=>{ S.set.voice=sv.value; save(); };
  $('#sRate').oninput=e=>{ S.set.rate=+e.target.value; $('#sRateV').textContent=S.set.rate; save(); };
  $('#sTest').onclick=()=>speak('अहं पठामि संस्कृतम् । अहं वदामि संस्कृतम् ।');
  $('#sIast').onchange=e=>{ S.set.iast=e.target.checked; save(); };
  $('#sMarks').onchange=e=>{ S.set.marks=e.target.checked; save(); };
  $('#sNew').onchange=e=>{ S.set.newPerDay=Math.max(0,+e.target.value||0); save(); updateBadges(); };
  $('#sExp').onclick=()=>download(`deepakam-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(S),'application/json');
  $('#sImp').onchange=async e=>{ const f=e.target.files[0]; if(!f) return; try{ const d=JSON.parse(await f.text()); if(!d.cards||!d.set) throw 0; S=Object.assign(structuredClone(DEF),d); save(); App.toast('Backup restored'); viewProgress(body); updateBadges(); }catch(err){ App.toast('That file is not a दीपकम् backup'); } };
  $('#sReset').onclick=()=>{ if(!confirmReset()) return; S=structuredClone(DEF); save(); viewProgress(body); updateBadges(); App.toast('All study data cleared'); };
}
let resetArm=0; function confirmReset(){ if(Date.now()-resetArm<4000) return true; resetArm=Date.now(); App.toast('Press “Reset all” again within 4 seconds to erase everything'); return false; }

App.hooks.home.push(updateBadges);
App.hooks.ready.push(()=>{ updateBadges(); });
})();
