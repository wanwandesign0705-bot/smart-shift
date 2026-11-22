// このファイルの関数・定数は main.js で window に登録され、
// 画面の onclick と他のファイルから名前だけで呼べます（v2.3 の1ファイル版と同じ動き）。
/* ===================== 管理者：申請・承認 ===================== */
export const RT={pl:'有給休暇',off:'希望休',swap:'シフト交代'};
export const RS={pending:['承認待ち','warn'],open:['交代相手を募集中','a'],approved:['承認済み','ok'],rejected:['却下','bad'],canceled:['取り消し','']};
export const stName=id=>(S.staff.find(s=>s.id===id)||{}).name||'（削除されたスタッフ）';
export function reqDetail(r){let t=`<b>${esc(stName(r.staffId))}</b>　${fmtD(r.date)}`;
 if(r.type==='pl')t+=r.half?'　半日':'　全日';
 if(r.type==='swap'){const s=sh(r.shiftId);t+=`　${esc(s?s.name:'')}${r.takerId?` → <b>${esc(stName(r.takerId))}</b> が引き受け`:''}`}
 return t}
export function impact(r){if(r.type==='swap')return'';const cur=gvd(r.staffId,r.date);if(!isWork(cur))return'<span class="chip">この日は勤務なし</span>';const k=workingOn(r.date)-1,n=needOn(r.date);return`<span class="chip ${k<n?'bad':'ok'}">承認後の出勤 ${k}/${n}名</span>`}
export async function approve(id){const r=R.find(x=>x.id===id);if(!r)return;const G=S.grid;
 if(r.type==='pl'){G[r.staffId]=G[r.staffId]||{};G[r.staffId][r.date]=r.half?'PLH':'PL'}
 else if(r.type==='off'){S.wish[r.staffId]=S.wish[r.staffId]||{};S.wish[r.staffId][r.date]=true;if(isWork(gvd(r.staffId,r.date))){G[r.staffId][r.date]=offId()}}
 else if(r.type==='swap'){if(!r.takerId){toast('引き受ける人がまだいません');return}G[r.staffId]=G[r.staffId]||{};G[r.takerId]=G[r.takerId]||{};G[r.staffId][r.date]=offId();G[r.takerId][r.date]=r.shiftId}
 save();if(await REQ.upd(id,{status:'approved',decidedAt:new Date().toISOString()}))toast('承認し、シフト表に反映しました');render()}
export async function reject(id){const n=($('f_rj_'+id)||{}).value||'';if(await REQ.upd(id,{status:'rejected',decidedAt:new Date().toISOString(),note:n}))toast('却下しました')}
export async function approveAll(){const ps=R.filter(r=>r.status==='pending'&&(r.type!=='swap'||r.takerId));for(const r of ps)await approve(r.id)}
export function tabReqs(){if(!can('pl')&&!can('req'))return lockedCard('req');
 const pend=R.filter(r=>r.status==='pending').sort((a,b)=>a.date.localeCompare(b.date)),open=R.filter(r=>r.status==='open'),hist=R.filter(r=>!['pending','open'].includes(r.status)).sort((a,b)=>(b.decidedAt||b.createdAt||'').localeCompare(a.decidedAt||a.createdAt||'')).slice(0,40);
 const row=(r,act)=>{const p=r.type==='pl'?plInfo(S.staff.find(s=>s.id===r.staffId)||{}):null;
  return`<div class="li"><div class="body"><div class="row" style="margin-bottom:4px"><span class="chip a">${RT[r.type]}</span><span class="chip ${RS[r.status][1]}">${RS[r.status][0]}</span>${act?impact(r):''}${p&&act?`<span class="chip">有給残 ${p.remain}日 → ${p.remain-(r.half?.5:1)}日</span>`:''}</div><div>${reqDetail(r)}</div>${r.reason?`<div class="small muted">理由：${esc(r.reason)}</div>`:''}${r.note?`<div class="small muted">管理者メモ：${esc(r.note)}</div>`:''}<div class="xs muted">申請 ${r.createdAt?new Date(r.createdAt).toLocaleString('ja-JP'):''}</div></div>
  ${act?`<div class="row"><input id="f_rj_${r.id}" placeholder="却下理由（任意）" style="width:160px"><button class="b2 danger" onclick="reject('${r.id}')">却下</button><button class="b ok" onclick="approve('${r.id}')" ${r.type==='swap'&&!r.takerId?'disabled':''}>承認</button></div>`:''}</div>`};
 return`<div class="card"><div class="row between"><h2 style="margin:0">承認待ち <span class="dot" ${pend.length?'':'hidden'}>${pend.length}</span></h2>${pend.length>1?'<button class="b2" onclick="approveAll()">まとめて承認</button>':''}</div>
 <p class="small muted" style="margin-top:4px">承認すると、有給はシフト表に「有給」として入り、希望休は自動生成で休みに固定されます。交代は2人のシフトを入れ替えます。</p>
 <div class="list" style="margin-top:8px">${pend.length?pend.map(r=>row(r,1)).join(''):'<div class="empty">承認待ちの申請はありません。スタッフ画面の「申請」から有給・希望休・交代を出せます。</div>'}</div></div>
 ${open.length?`<div class="card"><h2>交代相手を募集中</h2><div class="list">${open.map(r=>row(r,0)).join('')}</div></div>`:''}
 <div class="card"><h2>履歴</h2><div class="list">${hist.length?hist.map(r=>row(r,0)).join(''):'<div class="empty">まだ履歴はありません</div>'}</div></div>`}
