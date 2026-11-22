// このファイルの関数・定数は main.js で window に登録され、
// 画面の onclick と他のファイルから名前だけで呼べます（v2.3 の1ファイル版と同じ動き）。
/* ===================== 管理者：シフト作成 ===================== */
export function publish(){const last=dk(dim());if(!S.pubUntil||last>S.pubUntil)S.pubUntil=last;S.pubAt=new Date().toISOString();save();toast(`${fmtY(last)}までのシフトをスタッフに公開しました`);render()}
export function unpublish(){const prev=iso(new Date(pstart()-864e5));if(S.pubUntil&&S.pubUntil>=dk(1)){S.pubUntil=prev;save();toast('この期間の公開を取り消しました');render()}}
export function tabShift(){
 const b=(k,t)=>`<button class="${av===k?'b':'b2'}" onclick="av='${k}';render()">${t}</button>`;
 let top=`<div class="card tight"><div class="row between">${navBar()}<div class="seg">${b('shift','シフト表')}${b('res','予約管理')}</div></div></div>`;
 if(av==='res')return top+(can('res')?tabRes(1):lockedCard('res'));
 const pend=R.filter(r=>r.status==='pending').length,iss=can('cost')?laborIssues():[],pub=isPub(dim())?'all':isPub(1)?'part':'none';
 let ed='';if(sel){const s=S.staff.find(x=>x.id===sel[0]);if(s){const w=wv(s,sel[1]),k=sel[0]+'_'+dk(sel[1]),cur=gv(s,sel[1]);
  ed=`<div class="card fi" id="cellEd"><div class="row between"><h2 style="margin:0">${esc(s.name)} ／ ${mon(sel[1])}月${dom(sel[1])}日（${WD[dow(sel[1])]}）</h2><button class="b3" onclick="sel=null;render()">閉じる</button></div>
  <div class="row" style="margin:12px 0">${S.shifts.map(x=>`<button class="b2" style="background:${esc(x.color)};color:var(--cell-fg);${cur===x.id?'outline:2px solid var(--accent)':''}" onclick="setSh('${x.id}')">${esc(x.name)}</button>`).join('')}
  <button class="b2" style="background:${PL.color};color:var(--cell-fg)" onclick="setSh('PL')">有給（全日）</button><button class="b2" style="background:${PLH.color};color:var(--cell-fg)" onclick="setSh('PLH')">有給（半日）</button></div>
  <div class="row"><label class="row small"><input type="checkbox" ${w?'checked':''} onchange="togWish()"> 希望休（自動生成で休みに固定）</label><input id="f_memo" style="flex:1 1 260px" placeholder="個別メモ（例：10時出勤、15時まで）" value="${esc(S.memo[k])}" onchange="setMemo(this.value)"></div></div>`}}
 const over=S.staff.length>staffLimit();
 return top+`${over?`<div class="banner warn"><b>${PLANS[tier()].name}プランのスタッフ上限（${staffLimit()}名）を超えています。</b><span class="small">自動生成は先頭${staffLimit()}名だけが対象です。</span><button class="b3" onclick="go(6)">プランを変更</button></div>`:''}
 <div class="card tight"><div class="row between"><div class="row"><button class="b" onclick="gen()">自動生成</button>
 ${pub==='all'?`<span class="chip ok">公開中</span><button class="b2" onclick="unpublish()">公開を取り消す</button>`:`<button class="b ok" onclick="publish()">${pub==='part'?'残りを公開':'スタッフに公開'}</button>`}
 <button class="b2" onclick="${can('excel')?'expXlsx()':'go(6)'}">Excel出力${can('excel')?'':' <span class="chip">有料</span>'}</button>
 <button class="b2" onclick="shareModal()">スタッフへの共有方法</button></div>
 <div class="row">${pend?`<button class="chip warn" onclick="go(1)">承認待ちの申請 ${pend}件</button>`:''}${iss.length?`<button class="chip bad" onclick="go(3)">労務アラート ${iss.length}件</button>`:can('cost')?'<span class="chip ok">労務アラートなし</span>':''}</div></div>
 <p class="small muted" style="margin-top:8px">${esc(msg)||'セルをクリックして編集。希＝希望休、●＝メモ、下線＝労務アラート。最下段は出勤人数／必要人数です。'}</p></div>
 ${ed}<div class="card sc">${grid(1)}</div>${legend()}`}
export function shareModal(){$('md').innerHTML=`<div class="mdl" onclick="if(event.target===this)$('md').innerHTML=''"><div class="mdc fi"><h2>スタッフへの共有方法</h2><ol class="small" style="padding-left:18px;margin:0 0 12px;display:flex;flex-direction:column;gap:6px"><li>画面上部の「共有」メニューを開きます。</li><li>スタッフをメールで招待します。招待された人は申請（有給・希望休・交代）を送れます。</li><li>リンク共有だけの場合、スタッフは閲覧のみで申請は送れません。</li></ol><p class="xs muted" style="margin-bottom:16px">${mode==='db'?'いまは共有モードです。シフト・申請はすべての端末に反映されます。':'いまはこの端末だけに保存されています。サインインした状態で開くと共有モードになります。'}</p><div class="row" style="justify-content:flex-end"><button class="b" onclick="$('md').innerHTML=''">閉じる</button></div></div></div>`}
