// このファイルの関数・定数は main.js で window に登録され、
// 画面の onclick と他のファイルから名前だけで呼べます（v2.3 の1ファイル版と同じ動き）。
/* ===================== スタッフ画面 ===================== */
export function setMe(v){me=v||null;setPref('me',me);render(true)}
export function mePicker(big){const o=S.staff.map(s=>`<option value="${s.id}" ${me===s.id?'selected':''}>${esc(s.name)}</option>`).join('');
 return big?`<div class="card"><h2>あなたの名前を選んでください</h2><p class="small muted" style="margin-bottom:10px">この端末に記憶されます。自分のシフト・有給残日数・申請が表示されます。</p><select id="f_me" onchange="setMe(this.value)"><option value="">選択してください</option>${o}</select></div>`
 :`<label class="row small">あなた：<select onchange="setMe(this.value)">${o}</select></label>`}
export function myStats(st){const D=dim();let days=0,h=0,pay=0;for(let d=1;d<=D;d++){if(!isPub(d))continue;const id=gv(st,d);if(isWork(id)){days++;h+=hrs(sh(id))}pay+=cellCost(st,id)}return{days,h,pay}}
export async function submitReq(){const st=S.staff.find(s=>s.id===me);if(!st)return;const type=$('f_qt').value,reason=($('f_qr')||{}).value||'';let date,r;
 if(type==='swap'){date=$('f_qs').value;if(!date){toast('交代したい日を選んでください');return}r={type,staffId:me,date,shiftId:gvd(me,date),status:'open',reason}}
 else{date=$('f_qd').value;if(!date){toast('日付を選んでください');return}
  if(R.some(x=>x.staffId===me&&x.date===date&&x.type===type&&['pending','approved'].includes(x.status))){toast('同じ日の申請がすでにあります');return}
  const half=type==='pl'&&$('f_qh')&&$('f_qh').checked;
  if(type==='pl'){const p=plInfo(st);if(p.remain-p.pend-(half?.5:1)<0){toast('有給の残日数が足りません。管理者に相談してください');return}}
  r={type,staffId:me,date,half:!!half,status:'pending',reason}}
 if(await REQ.add(r)){toast(type==='swap'?'交代の募集を出しました':'申請しました。管理者の承認をお待ちください');['f_qr','f_qd'].forEach(i=>{const e=$(i);if(e)e.value=''});render(true)}}
export async function takeSwap(id){if(await REQ.upd(id,{takerId:me,status:'pending',takenAt:new Date().toISOString()}))toast('引き受けました。管理者の承認で確定します')}
export async function cancelReq(id){if(await REQ.upd(id,{status:'canceled'}))toast('申請を取り消しました')}
export function staffReqTab(st){const okPL=can('pl'),okReq=can('req');if(!okPL&&!okReq)return lockedCard('req');
 const t=($('f_qt')||{}).value||(okPL?'pl':'off'),p=plInfo(st),today=iso(todayD());
 const myShifts=Object.entries(S.grid[me]||{}).filter(([d,v])=>d>=today&&isWork(v)&&d<=(S.pubUntil||'')).sort().slice(0,40);
 const types=[okPL&&['pl','有給休暇'],okReq&&['off','希望休'],okReq&&['swap','シフト交代の募集']].filter(Boolean);
 const now=todayD(),dd=+S.deadline||20,past=now.getDate()>dd,dlM=new Date(now.getFullYear(),now.getMonth()+(past?1:0),1),tgM=new Date(now.getFullYear(),now.getMonth()+(past?2:1),1);
 const mine=R.filter(r=>r.staffId===me).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,30);
 const others=R.filter(r=>r.type==='swap'&&r.status==='open'&&r.staffId!==me&&r.date>=today);
 return`${okPL?`<div class="tiles"><div class="tile"><div class="k">有給の残り</div><div class="v">${p.remain}日</div><div class="xs muted">${p.pend?'申請中 '+p.pend+'日・':''}${p.base?'付与 '+p.grant+'日（基準日 '+fmtY(p.base)+'）':'初回付与 '+fmtY(p.first)}</div></div>${p.obl?`<div class="tile"><div class="k">年5日の取得</div><div class="v">${p.used}<span class="small"> / 5日</span></div><div class="xs muted">${p.need5>0?'期限 '+fmtY(p.end)+' まで':'達成しています'}</div></div>`:''}</div><p class="xs muted" style="margin:-8px 0 14px">${NOTE}</p>`:''}
 <div class="card"><h2>申請する</h2><p class="small muted" style="margin-bottom:10px">${tgM.getMonth()+1}月分の希望休・有給は ${dlM.getMonth()+1}月${dd}日までに出してください。</p>
 <div class="row" style="align-items:flex-end"><label class="f">種類<select id="f_qt" onchange="render()">${types.map(([v,l])=>`<option value="${v}" ${t===v?'selected':''}>${l}</option>`).join('')}</select></label>
 ${t==='swap'?`<label class="f">交代したい日<select id="f_qs"><option value="">選択</option>${myShifts.map(([d,v])=>`<option value="${d}">${fmtD(d)} ${esc((sh(v)||{}).name||'')}</option>`).join('')}</select></label>`:`<label class="f">日付<input id="f_qd" type="date" min="${today}"></label>`}
 ${t==='pl'?`<label class="row small" style="padding-bottom:8px"><input id="f_qh" type="checkbox"> 半日</label>`:''}
 <label class="f" style="flex:1 1 200px">${t==='pl'?'理由（任意・書かなくても取得できます）':'ひとこと（任意）'}<input id="f_qr" placeholder="${t==='swap'?'例：通院のため':'例：私用のため'}"></label>
 <button class="b" onclick="submitReq()">${t==='swap'?'募集を出す':'申請する'}</button></div>
 ${t==='swap'&&!myShifts.length?'<p class="xs muted" style="margin-top:6px">公開済みの今後のシフトがありません。</p>':''}</div>
 ${others.length?`<div class="card"><h2>交代できる人を探しています</h2><div class="list">${others.map(r=>{const busy=isWork(gvd(me,r.date))||isPL(gvd(me,r.date));return`<div class="li"><div class="body">${reqDetail(r)}${r.reason?`<div class="small muted">${esc(r.reason)}</div>`:''}</div>${busy?'<span class="chip">この日は出勤予定です</span>':`<button class="b" onclick="takeSwap('${r.id}')">引き受ける</button>`}</div>`}).join('')}</div></div>`:''}
 <div class="card"><h2>自分の申請</h2><div class="list">${mine.length?mine.map(r=>`<div class="li"><div class="body"><div class="row" style="margin-bottom:4px"><span class="chip a">${RT[r.type]}</span><span class="chip ${RS[r.status][1]}">${RS[r.status][0]}</span></div>${reqDetail(r)}${r.note?`<div class="small muted">管理者より：${esc(r.note)}</div>`:''}</div>${['pending','open'].includes(r.status)?`<button class="b3" onclick="cancelReq('${r.id}')">取り消す</button>`:''}</div>`).join(''):'<div class="empty">まだ申請はありません</div>'}</div></div>`}
/* Supabase を使う版で、招待リンクで参加していない端末（参加前の人、店長がロックした端末）に出す案内。
   名前を選んで、ほかの人のシフトや給与見込を見られる画面は出さない */
export function staffLanding(){return`<div class="card" style="max-width:560px;margin:0 auto"><h2 style="font-size:18px">Smart Shift</h2>
 <p class="small" style="line-height:1.9;margin-top:6px"><b>スタッフの方</b>：店長から届いた招待リンク（または QR コード）を開いてください。参加すると、この端末で自分のシフト・給与見込・有給の残りが見られます。</p>
 <p class="small" style="line-height:1.9;margin-top:6px"><b>店長の方</b>：右上の「管理者メニュー」からログインしてください。</p></div>`}
export function tabStaff(){
 if(staffMode()&&sv===1)sv=0; // 参加したスタッフには「全体のシフト」を出さない
 if(cloudEnabled&&!staffMode()&&!(acct.user&&acct.user.is_anonymous&&staffCtx&&(staffCtx.unlinked||staffCtx.error)))return staffLanding();
 if(cloudEnabled&&acct.user&&acct.user.is_anonymous&&staffCtx&&(staffCtx.unlinked||staffCtx.error))return`<div class="card" style="max-width:560px;margin:0 auto"><h2>${staffCtx.error?'お店のデータを読み込めませんでした':'この端末の参加は解除されています'}</h2><p class="small" style="margin-top:6px">${staffCtx.error?esc(staffCtx.error):'店長が参加を解除したか、招待リンクを再発行して別の端末で参加しました。この端末で見るには、店長に招待リンクを送ってもらってください。'}</p></div>`;
 const st=S.staff.find(s=>s.id===me);
 const T=['マイシフト','全体のシフト','申請','社内連絡'],pendMine=R.filter(r=>r.staffId===me&&['pending','open'].includes(r.status)).length;
 const tabs=`<div class="row between" style="margin-bottom:14px"><div class="seg">${T.map((n,i)=>staffMode()&&i===1?'':`<button class="${sv===i?'b':'b2'}" onclick="sv=${i};render()">${n}${i===2&&pendMine?` <span class="dot">${pendMine}</span>`:''}${i===3&&unreadNotices()?` <span class="dot">${unreadNotices()}</span>`:''}</button>`).join('')}</div>${st&&!staffMode()?mePicker():''}</div>`;
 if(!st&&sv!==1&&sv!==3)return tabs+mePicker(true);
 let body='';
 if(sv===0){const m=myStats(st),D=dim();let r='';for(let d=1;d<=D;d++){if(!isPub(d))continue;const id=gv(st,d);if(!isWork(id)&&!isPL(id))continue;const x=sh(id),mm=S.memo[st.id+'_'+dk(d)];r+=`<tr><td class="bold">${mon(d)}/${dom(d)}（${isHol(d)?'祝':WD[dow(d)]}）</td><td><span style="background:${esc(x.color)};color:var(--cell-fg);padding:2px 8px;border-radius:6px;font-weight:600">${esc(x.name)}</span></td><td>${esc(x.time||'')}</td><td class="small">${esc(mm||'')}</td></tr>`}
  const unpub=!isPub(dim());
  body=`<div class="card tight">${navBar()}</div>${unpub?`<div class="banner"><b>${isPub(1)?'この期間の一部はまだ公開されていません。':'この期間のシフトはまだ公開されていません。'}</b><span class="small">公開されると、ここに表示されます。</span></div>`:''}
  <div class="tiles"><div class="tile"><div class="k">出勤日数</div><div class="v">${m.days}日</div></div><div class="tile"><div class="k">予定労働時間</div><div class="v">${m.h.toFixed(1)}h</div></div><div class="tile"><div class="k">給与見込（深夜割増込）</div><div class="v">${yen(m.pay)}</div><div class="xs muted">時給 ${yen(st.wage)}・交通費等は含みません</div></div>${staffMode()&&can('pl')?(()=>{const p=plInfo(st);return`<div class="tile"><div class="k">有給の残り</div><div class="v">${p.remain}日</div><div class="xs muted">${p.base?'付与 '+p.grant+'日（基準日 '+fmtY(p.base)+'）':'初回付与 '+fmtY(p.first)}</div></div>`})():''}</div><p class="xs muted" style="margin:-8px 0 14px">${NOTE}</p>
  <div class="card"><div class="tw"><table class="t"><tr><th>日付</th><th>区分</th><th>時間帯</th><th>メモ</th></tr>${r||'<tr><td colspan="4" class="empty">公開済みのシフトはありません</td></tr>'}</table></div></div>`}
 else if(sv===1&&!staffMode())body=`<div class="card tight">${navBar()}</div><div class="card sc">${grid(0)}</div>${legend()}`;
 else if(sv===2)body=staffReqTab(st)+(staffMode()?takenSwapsCard():'');
 else{if(staffMode())setTimeout(markShownNoticesRead,300);body=`<div class="card"><h2>社内連絡</h2><p class="small muted" style="margin:-6px 0 8px">店長・管理者からの連絡です。</p>${noticeList(0)}</div>`}
 return tabs+body}

/* 作業6：スタッフの端末の社内連絡（既読）と、引き受けた交代 */
export const unreadNotices=()=>staffMode()&&staffReads?S.notices.filter(n=>!staffReads.has(n.id)).length:0;
export async function markShownNoticesRead(){
 if(!staffMode()||!staffReads||sv!==3)return;
 const ids=S.notices.filter(n=>!staffReads.has(n.id)).map(n=>n.id);if(!ids.length)return;
 try{await markNoticesRead(ids);ids.forEach(id=>staffReads.add(id));render()}catch(e){}
}
export function takenSwapsCard(){const t=R.filter(r=>r.board==='taken');if(!t.length)return'';
 return`<div class="card"><h2>引き受けた交代</h2><div class="list">${t.map(r=>`<div class="li"><div class="body"><div class="row" style="margin-bottom:4px"><span class="chip a">シフト交代</span><span class="chip ${RS[r.status][1]}">${RS[r.status][0]}</span></div>${reqDetail({...r,takerId:null})}<div class="xs muted">${esc(r.shiftTime||'')}</div></div></div>`).join('')}</div></div>`}
