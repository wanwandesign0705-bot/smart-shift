// このファイルの関数・定数は main.js で window に登録され、
// 画面の onclick と他のファイルから名前だけで呼べます（v2.3 の1ファイル版と同じ動き）。
/* ===================== ユーティリティ ===================== */
export const $=id=>document.getElementById(id);
export const pad=n=>String(n).padStart(2,'0'),iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
export const yen=n=>'¥'+Math.round(n).toLocaleString('ja-JP');
export const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const todayD=()=>{const t=new Date();t.setHours(0,0,0,0);return t};
export const pd=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
export const addM=(s,m)=>{const[y,mo,d]=s.split('-').map(Number);return new Date(y,mo-1+m,d)};
export const fmtD=s=>{if(!s)return'';const d=pd(s);return`${d.getMonth()+1}/${d.getDate()}（${WD[d.getDay()]}）`};
export const fmtY=s=>{if(!s)return'';const d=pd(s);return`${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`};
let toastT;export function toast(t){const el=$('toast');el.textContent=t;el.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>el.hidden=true,2600)}
