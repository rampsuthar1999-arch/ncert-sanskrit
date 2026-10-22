/* Transliteration helpers: Roman (ITRANS-style) typing -> Devanagari, and Devanagari -> IAST */
(function(){
const VOW=[['aa','आ','ा'],['A','आ','ा'],['ai','ऐ','ै'],['au','औ','ौ'],['ii','ई','ी'],['I','ई','ी'],['ee','ई','ी'],['uu','ऊ','ू'],['U','ऊ','ू'],['oo','ऊ','ू'],
  ['RRi','ऋ','ृ'],['R^i','ऋ','ृ'],['RRI','ॠ','ॄ'],['Ri','ऋ','ृ'],['LLi','ऌ','ॢ'],['a','अ',''],['i','इ','ि'],['u','उ','ु'],['e','ए','े'],['o','ओ','ो'],['R','ऋ','ृ']];
const CONS=[['kSh','क्ष'],['x','क्ष'],['GY','ज्ञ'],['j~n','ज्ञ'],['dny','ज्ञ'],['shh','ष'],['chh','छ'],['kh','ख'],['gh','घ'],['~N','ङ'],['N^','ङ'],['Ch','छ'],['ch','च'],
  ['jh','झ'],['~n','ञ'],['JN','ञ'],['Th','ठ'],['Dh','ढ'],['th','थ'],['dh','ध'],['ph','फ'],['bh','भ'],['sh','श'],['Sh','ष'],
  ['k','क'],['g','ग'],['c','च'],['C','छ'],['j','ज'],['T','ट'],['D','ड'],['N','ण'],['t','त'],['d','द'],['n','न'],['p','प'],['f','फ'],['b','ब'],
  ['m','म'],['y','य'],['r','र'],['l','ल'],['L','ळ'],['v','व'],['w','व'],['S','ष'],['s','स'],['h','ह'],['z','श'],['q','क़']];
const OTHER=[['||','॥'],['|','।'],['.N','ँ'],['.n','ं'],['M','ं'],['H','ः'],['.a','ऽ'],['.h','्'],['OM','ॐ']];
function match(list,s,i){ for(const e of list){ if(s.startsWith(e[0],i)) return e; } return null; }
function itrans(s){
  let out='',i=0,pend=false; // pend: last output was a consonant awaiting a vowel
  while(i<s.length){
    const o=match(OTHER,s,i);
    if(o){ if(pend){ out+='्'; pend=false; } out+=o[1]; i+=o[0].length; continue; }
    const c=match(CONS,s,i);
    if(c){ if(pend) out+='्'; out+=c[1]; pend=true; i+=c[0].length; continue; }
    const v=match(VOW,s,i);
    if(v){ out+= pend ? v[2] : v[1]; pend=false; i+=v[0].length; continue; }
    if(pend){ out+='्'; pend=false; }
    out+=s[i]; i++;
  }
  if(pend) out+='्';
  return out;
}
const IC={'क':'k','ख':'kh','ग':'g','घ':'gh','ङ':'ṅ','च':'c','छ':'ch','ज':'j','झ':'jh','ञ':'ñ','ट':'ṭ','ठ':'ṭh','ड':'ḍ','ढ':'ḍh','ण':'ṇ',
 'त':'t','थ':'th','द':'d','ध':'dh','न':'n','प':'p','फ':'ph','ब':'b','भ':'bh','म':'m','य':'y','र':'r','ल':'l','व':'v','श':'ś','ष':'ṣ','स':'s','ह':'h','ळ':'ḷ'};
const IV={'अ':'a','आ':'ā','इ':'i','ई':'ī','उ':'u','ऊ':'ū','ऋ':'ṛ','ॠ':'ṝ','ऌ':'ḷ','ए':'e','ऐ':'ai','ओ':'o','औ':'au'};
const IM={'ा':'ā','ि':'i','ी':'ī','ु':'u','ू':'ū','ृ':'ṛ','ॄ':'ṝ','ॢ':'ḷ','े':'e','ै':'ai','ो':'o','ौ':'au'};
const IO={'ं':'ṃ','ः':'ḥ','ँ':'m̐','ऽ':"'",'।':'|','॥':'||','ॐ':'oṃ','०':'0','१':'1','२':'2','३':'3','४':'4','५':'5','६':'6','७':'7','८':'8','९':'9'};
function iast(s){
  let out=''; const a=[...s.replace(/[‌‍़]/g,'')];
  for(let i=0;i<a.length;i++){
    const ch=a[i];
    if(IC[ch]){ out+=IC[ch]; const n=a[i+1];
      if(n==='्'){ i++; } else if(IM[n]){ out+=IM[n]; i++; } else out+='a'; continue; }
    if(IV[ch]){ out+=IV[ch]; continue; }
    if(IO[ch]!==undefined){ out+=IO[ch]; continue; }
    out+=ch;
  }
  return out;
}
// normalise an answer for comparison
function normAns(s){
  return String(s||'').normalize('NFC').replace(/[​-‍]/g,'').replace(/[0-9]/g,d=>'०१२३४५६७८९'[d]).replace(/[।॥?!,.\-–—'"‘’“”()+=]/g,' ')
    .split(/\s+/).filter(Boolean).map(w=>w.replace(/म्$/,'ं')).join('');
}
window.Translit={itrans,iast,normAns};
})();
