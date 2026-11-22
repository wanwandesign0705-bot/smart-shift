// このファイルの関数・定数は main.js で window に登録され、
// 画面の onclick と他のファイルから名前だけで呼べます（v2.3 の1ファイル版と同じ動き）。
/* ===================== 期間 ===================== */
export function norm(){const d=pd(curStart);if(S.span==='m1')curStart=iso(new Date(d.getFullYear(),d.getMonth(),1));else{const w=(d.getDay()+6)%7;curStart=iso(new Date(d.getFullYear(),d.getMonth(),d.getDate()-w))}}
export const pstart=()=>pd(curStart);
export const dim=()=>{const a=pstart();return S.span==='m1'?new Date(a.getFullYear(),a.getMonth()+1,0).getDate():SPN[S.span]};
export const dt=d=>{const a=pstart();return new Date(a.getFullYear(),a.getMonth(),a.getDate()+d-1)};
export const dow=d=>dt(d).getDay(),dk=d=>iso(dt(d)),dom=d=>dt(d).getDate(),mon=d=>dt(d).getMonth()+1;
export const isHol=d=>HOL.has(dk(d)),holSun=d=>isHol(d)||dow(d)===0;
export const dcls=d=>holSun(d)?'sun':dow(d)===6?'sat':'wk';
export const dlabel=d=>d===1||dom(d)===1?mon(d)+'/'+dom(d):String(dom(d));
export function reset(){sel=null;resDay=null;render()}
export function nav(k){const d=pstart();curStart=iso(S.span==='m1'?new Date(d.getFullYear(),d.getMonth()+k,1):new Date(d.getFullYear(),d.getMonth(),d.getDate()+k*dim()));reset()}
export function goToday(){curStart=iso(new Date());norm();reset()}
export function setSpan(v){S.span=v;norm();save();reset()}
export function plabel(){const a=dt(1),b=dt(dim());return S.span==='m1'?`${a.getFullYear()}年${a.getMonth()+1}月`:`${a.getMonth()+1}/${a.getDate()} 〜 ${b.getMonth()+1}/${b.getDate()}`}
export function ptitle(){const a=dt(1),b=dt(dim());return S.span==='m1'?`${a.getFullYear()}年${a.getMonth()+1}月`:`${a.getFullYear()}年${a.getMonth()+1}月${a.getDate()}日〜${b.getMonth()+1}月${b.getDate()}日`}
export function navBar(){return`<div class="row"><button class="b2" onclick="nav(-1)" aria-label="前の期間">◀</button><b style="min-width:9rem;text-align:center;font-size:17px">${plabel()}</b><button class="b2" onclick="nav(1)" aria-label="次の期間">▶</button><button class="b2" onclick="goToday()">今日</button><span class="chip">${SPL[S.span]}</span></div>`}
export const isPub=d=>!!S.pubUntil&&dk(d)<=S.pubUntil;
