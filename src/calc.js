// このファイルの関数・定数は main.js で window に登録され、
// 画面の onclick と他のファイルから名前だけで呼べます（v2.3 の1ファイル版と同じ動き）。
/* ===================== シフト計算 ===================== */
export const offId=()=>(S.shifts.find(s=>s.name==='休み')||S.shifts[S.shifts.length-1]||{}).id;
export const isPL=id=>id==='PL'||id==='PLH';
export const sh=id=>id==='PL'?PL:id==='PLH'?PLH:S.shifts.find(s=>s.id===id);
export const isWork=id=>!!id&&id!==offId()&&!isPL(id)&&!!sh(id);
export const gvd=(sid,date)=>(S.grid[sid]||{})[date];
export const gv=(st,d)=>gvd(st.id,dk(d));
export const wv=(st,d)=>!!(S.wish[st.id]&&S.wish[st.id][dk(d)]);
export function tm(s){if(!s||!s.time)return null;const m=String(s.time).match(/(\d+):(\d+)\s*[-〜~]\s*(翌)?(\d+):(\d+)/);if(!m)return null;let a=+m[1]+m[2]/60,b=+m[4]+m[5]/60;if(m[3]||b<=a)b+=24;return{a,b}}
/* 休憩：未設定なら 6h超45分・8h超60分（労基法34条） */
export function hrs(s){const t=tm(s);if(!t)return 0;const h=t.b-t.a;const br=s.brk!=null&&s.brk!==''?+s.brk:(h>8?1:h>6?.75:0);return Math.max(0,h-br)}
export function nightH(s){const t=tm(s);if(!t)return 0;const ov=(x,y)=>Math.max(0,Math.min(t.b,y)-Math.max(t.a,x));return Math.min(hrs(s),ov(0,5)+ov(22,29)+ov(46,53))}
export function cellCost(st,id){if(isPL(id))return(id==='PL'?+st.plHours||8:(+st.plHours||8)/2)*st.wage;if(!isWork(id))return 0;const s=sh(id);return(hrs(s)+.25*nightH(s))*st.wage}
export function needOn(date){const d=pd(date),w=d.getDay();return(+S.need[w]||0)+(w===5?+S.bonus.fri||0:0)+(w===6?+S.bonus.sat||0:0)}
export const workingOn=date=>S.staff.filter(s=>isWork(gvd(s.id,date))).length;
export function U(path,v,num){const p=path.split('.');let o=S;for(let i=0;i<p.length-1;i++){if(o[p[i]]==null)o[p[i]]={};o=o[p[i]]}o[p[p.length-1]]=num?(+v||0):v;save();render()}

export function parsePat(txt){const out=[];String(txt).split(/[,、→>]/).forEach(x=>{const m=x.trim().match(/^(.+?)[×x*](\d+)$/),nm=m?m[1].trim():x.trim(),n=m?+m[2]:1,s=S.shifts.find(s=>s.name===nm);if(s)for(let i=0;i<n;i++)out.push(s.id)});return out}
export function gen(){const D=dim(),off=offId(),G=S.grid,lim=staffLimit();
 const pool=S.staff.slice(0,lim===Infinity?S.staff.length:lim);
 pool.forEach(st=>{G[st.id]=G[st.id]||{};for(let d=1;d<=D;d++){if(!isPL(G[st.id][dk(d)]))delete G[st.id][dk(d)]}});
 const set=(st,d,v)=>{if(!isPL(gv(st,d)))G[st.id][dk(d)]=v},wk=(st,d)=>isWork(gv(st,d)),ab=d=>Math.round((dt(d)-new Date(2026,0,1))/864e5);
 pool.forEach((st,i)=>{for(let d=1;d<=D;d++){if(isPL(gv(st,d)))continue;if(wv(st,d)){set(st,d,off);continue}
  if(st.mode==='w'){const f=(st.fix||{})[dow(d)];set(st,d,f&&sh(f)?f:off)}
  else if(st.mode!==''){const q=parsePat(S.pats[+st.mode]||'');set(st,d,q.length?q[(((ab(d)+i*2)%q.length)+q.length)%q.length]:off)}}});
 const free=pool.filter(s=>s.mode===''),dayS=(S.shifts.find(s=>isWork(s.id)&&!s.min&&s.time)||S.shifts[0]).id,maxRun=+S.rules.maxRun||6;
 const tot=(s,d)=>{let n=0;for(let k=1;k<d;k++)if(wk(s,k))n++;return n};
 for(let d=1;d<=D;d++){const cnt=id=>pool.filter(s=>gv(s,d)===id).length;
  const lastDays=new Date(dt(d).getFullYear(),dt(d).getMonth()+1,0).getDate();
  const need=needOn(dk(d))+(dom(d)>lastDays-3?+S.bonus.end||0:0);
  const cand=()=>free.filter(s=>!gv(s,d)&&!wv(s,d)).filter(s=>{const p=sh(gv(s,d-1));return!(p&&p.ake)}).filter(s=>{for(let k=1;k<=maxRun;k++)if(!wk(s,d-k))return true;return false}).sort((a,b)=>tot(a,d)-tot(b,d));
  S.shifts.forEach(x=>{if(!isWork(x.id))return;while(cnt(x.id)<(+x.min||0)){const c=cand()[0];if(!c)break;set(c,d,x.id)}});
  while(pool.filter(s=>wk(s,d)).length<need){const c=cand()[0];if(!c)break;set(c,d,dayS)}
  free.forEach(s=>{if(!gv(s,d))set(s,d,off)})}
 save();msg='自動生成しました。承認済みの有給・希望休・固定曜日・巡回パターンを守り、必要人数と出勤日数の偏りを調整しています。';render()}

export function stats(){const D=dim();return S.staff.map(st=>{let h=0,night=0,wend=0,days=0,pl=0,cost=0;
 for(let d=1;d<=D;d++){const id=gv(st,d),s=sh(id);cost+=cellCost(st,id);
  if(isWork(id)){days++;h+=hrs(s);night+=nightH(s)}else if(isPL(id))pl+=id==='PL'?1:.5;else if([0,6].includes(dow(d)))wend++}
 return{st,h,night,wend,days,pl,cost}})}
export const dayCost=d=>S.staff.reduce((a,s)=>a+cellCost(s,gv(s,d)),0);
export function pbudget(){const a=pstart();return S.span==='m1'?S.budget:S.budget*dim()/new Date(a.getFullYear(),a.getMonth()+1,0).getDate()}

/* ---- 労務チェック ---- */
export function laborIssues(){const D=dim(),out=[],maxRun=+S.rules.maxRun||6,iv=+S.rules.interval||11,ST=stats();
 S.staff.forEach((st,i)=>{let run=0,runStart=0;
  for(let d=1;d<=D;d++){const id=gv(st,d);
   if(isWork(id)){if(!run)runStart=d;run++;if(run===maxRun+1)out.push({lv:'bad',st,d:runStart,t:`${run}連勤以上（${dlabel(runStart)}〜）`,k:'連勤'})}else run=0;
   if(wv(st,d)&&isWork(id))out.push({lv:'warn',st,d,t:`${mon(d)}/${dom(d)} 希望休の日に出勤が入っています`,k:'希望休'});
   if(d<D&&isWork(id)&&isWork(gv(st,d+1))){const a=tm(sh(id)),b=tm(sh(gv(st,d+1)));if(a&&b){const gap=24+b.a-a.b;if(gap<iv)out.push({lv:'warn',st,d,t:`${mon(d)}/${dom(d)}→翌日 勤務間隔 ${gap.toFixed(1)}時間（目安${iv}時間）`,k:'インターバル'})}}}
  // 週40時間（月曜始まり）
  let wkH=0,wkS=1;for(let d=1;d<=D;d++){if(dow(d)===1&&d>1){wkH=0;wkS=d}const id=gv(st,d);if(isWork(id))wkH+=hrs(sh(id));
   if((dow(d)===0||d===D)&&wkH>40){out.push({lv:'warn',st,d:wkS,t:`${dlabel(wkS)}の週 ${wkH.toFixed(1)}時間（週40時間超・時間外）`,k:'週40h'});wkH=-1e9}}
  // 社会保険：週20時間以上（賃金要件は2026年10月撤廃）
  // 51人以上の会社だけ：週20〜30時間未満・2ヶ月超の雇用見込み・学生でない（30時間以上は通常の加入者として扱う）
  if(S.company==='large'){const wh=ST[i].h/(D/7),L=LAW.shaho;if(wh>=L.minH&&wh<L.fullH&&st.longEmp!==false&&!st.student)out.push({lv:'warn',st,d:1,t:`週平均 ${wh.toFixed(1)}時間・${L.months}ヶ月超の雇用見込みあり・学生でないため、社会保険の加入対象です`,k:'社保'})}
  // 扶養ライン
  if(+st.fuyo>0){const a=pstart(),md=new Date(a.getFullYear(),a.getMonth()+1,0).getDate(),m=S.span==='m1'?ST[i].cost:ST[i].cost*md/D,lim=st.fuyo/12;
   if(m>lim)out.push({lv:'bad',st,d:1,t:`月収見込 ${yen(m)} が扶養ライン目安 ${yen(lim)}/月 を超えています`,k:'扶養'});
   else if(m>lim*.9)out.push({lv:'warn',st,d:1,t:`月収見込 ${yen(m)}（扶養ライン目安 ${yen(lim)}/月 の9割超）`,k:'扶養'})}});
 return out}

export function shahoInfo(){if(S.company==='large')return'';
 if(S.company==='small')return`<div class="banner" style="margin-bottom:10px"><span class="chip">社会保険</span><span class="small">${LAW.shaho.smallNote}</span></div>`;
 return`<div class="banner warn" style="margin-bottom:10px"><span class="chip warn">社会保険</span><span class="small">会社全体の従業員数を設定してください。設定すると、週20時間以上の社会保険の判定ができます。</span>${adminOK?'<button class="b3" onclick="go(5)">設定を開く</button>':''}</div>`}

/* ---- 有給 ---- */
export function plInfo(st){const t=todayD(),adj=+st.plAdj||0;
 const pend=R.filter(r=>r.type==='pl'&&r.status==='pending'&&r.staffId===st.id).reduce((a,r)=>a+(r.half?.5:1),0);
 if(!st.hire)return{grant:0,used:0,pend,remain:adj,base:'',end:'',first:'',obl:false,need5:0};
 const first=addM(st.hire,6);
 if(t<first)return{grant:0,used:0,pend,remain:adj,base:'',end:'',first:iso(first),obl:false,need5:0};
 let k=0;while(addM(st.hire,6+12*(k+1))<=t)k++;
 const base=addM(st.hire,6+12*k),end=addM(st.hire,6+12*(k+1)),wd=Math.min(5,Math.max(1,+st.wdays||5)),grant=PLT[wd][Math.min(k,6)];
 let used=0;Object.entries(S.grid[st.id]||{}).forEach(([d,v])=>{if(isPL(v)){const x=pd(d);if(x>=base&&x<end)used+=v==='PL'?1:.5}});
 const due=new Date(end-864e5),obl=grant>=10;
 return{grant,used,pend,remain:grant+adj-used,base:iso(base),end:iso(due),first:iso(first),obl,need5:obl?Math.max(0,5-used):0,daysToDue:Math.ceil((due-t)/864e5)}}
