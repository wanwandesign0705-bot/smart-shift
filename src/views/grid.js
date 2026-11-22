// このファイルの関数・定数は main.js で window に登録され、
// 画面の onclick と他のファイルから名前だけで呼べます（v2.3 の1ファイル版と同じ動き）。
/* ===================== シフト表 ===================== */
export function cellHTML(st,d,adm,alerts){const id=gv(st,d),s=sh(id),m=S.memo[st.id+'_'+dk(d)],w=wv(st,d),on=sel&&sel[0]===st.id&&sel[1]===d;
 if(!adm&&!isPub(d))return`<td class="cell np" title="未公開"></td>`;
 const colored=s&&(isWork(id)||isPL(id));
 const cls=['cell',adm?'ed':'',on?'sel':'',colored?'':dcls(d),colored?'':'offc',alerts&&alerts.has(st.id+'_'+d)?'alert':''].join(' ');
 return`<td class="${cls}" style="${colored?`background:${esc(s.color)};color:var(--cell-fg)`:''}" ${adm?`onclick="pick('${st.id}',${d})"`:''} title="${esc(m||'')}">${s?esc(s.name):''}${w?'<div class="w">希</div>':''}${m?'<span class="m">●</span>':''}</td>`}
export function head(showRes){let h='<th class="n">スタッフ</th>';for(let d=1;d<=dim();d++)h+=`<th class="${holSun(d)?'sun':dow(d)===6?'sat':''}">${dlabel(d)}<br>${isHol(d)?'祝':WD[dow(d)]}${showRes?'<br>'+badge(d):''}</th>`;return`<tr>${h}</tr>`}
export function grid(adm){const showRes=can('res')&&S.res.length>0,D=dim(),al=new Set();if(adm)laborIssues().forEach(x=>{if(x.k==='連勤'||x.k==='希望休'||x.k==='インターバル')al.add(x.st.id+'_'+x.d)});
 const rows=S.staff.map(s=>`<tr><td class="n"><div class="bold" style="font-size:13px">${esc(s.name)}</div><div class="xs muted">${esc(s.role)}</div></td>${Array.from({length:D},(_,i)=>cellHTML(s,i+1,adm,al)).join('')}</tr>`).join('');
 let foot='';if(adm){foot=`<tr class="ft"><td class="n">出勤 / 必要</td>${Array.from({length:D},(_,i)=>{const d=i+1,k=workingOn(dk(d)),n=needOn(dk(d));return`<td style="color:${k<n?'var(--bad)':'inherit'}">${k}/${n}</td>`}).join('')}</tr>`}
 return`<table class="g">${head(showRes)}${rows}${foot}</table>`}
export function pick(s,d){sel=[s,d];render();setTimeout(()=>{const e=$('cellEd');e&&e.scrollIntoView({block:'nearest',behavior:'smooth'})},30)}
export function setSh(v){const[s,d]=sel;S.grid[s]=S.grid[s]||{};S.grid[s][dk(d)]=v;save();render()}
export function setMemo(v){S.memo[sel[0]+'_'+dk(sel[1])]=v;save();render()}
export function togWish(){const[s,d]=sel;S.wish[s]=S.wish[s]||{};S.wish[s][dk(d)]=!S.wish[s][dk(d)];save();render()}
export function legend(){return`<div class="row small" style="margin-top:10px">${[...S.shifts,PL].map(x=>`<span style="background:${esc(x.color)};color:var(--cell-fg);padding:2px 8px;border-radius:6px">${esc(x.name)} ${esc(x.time||'')}${x.brk?' 休憩'+x.brk+'h':''}</span>`).join('')}</div>`}
