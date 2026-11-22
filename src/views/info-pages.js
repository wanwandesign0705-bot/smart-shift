// このファイルの関数・定数は main.js で window に登録され、
// 画面の onclick と他のファイルから名前だけで呼べます（v2.3 の1ファイル版と同じ動き）。
/* ===================== アップデート情報 ===================== */
export const fmtDT=s=>{const d=new Date(s);return isNaN(d)?esc(s):`${d.getMonth()+1}/${d.getDate()}（${WD[d.getDay()]}）${pad(d.getHours())}:${pad(d.getMinutes())}`};
export const upcomingMaint=()=>UPD.maint.filter(m=>new Date(m.end||m.start)>new Date()).sort((a,b)=>a.start.localeCompare(b.start));
export function logItems(e){return`<ul style="margin:6px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px">${e.items.map(([k,t])=>`<li class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="chip ${UTAG[k]||''}" style="flex:none">${k}</span><span class="small">${esc(t)}</span></li>`).join('')}</ul>`}
export function openUpd(){page='upd';sel=null;setPref('seenVersion',APP_VER);render();window.scrollTo({top:0})}
export function closeUpd(){page=null;render()}
export function openLegal(k){page=k;sel=null;render();window.scrollTo({top:0})}
export function tabLegal(k){const L=LEGAL[k];
 const body=k==='tokusho'?`<div class="tw"><table class="t">${L.rows().map(([a,b])=>`<tr><th style="width:28%;white-space:normal">${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}</table></div>`
  :`<div class="stack">${L.body().map(([h,t])=>`<section><h3 style="margin-bottom:4px">${esc(h)}</h3><p class="small" style="max-width:70ch">${esc(t)}</p></section>`).join('')}</div>`;
 return`<div class="row between" style="margin-bottom:14px"><h2 style="margin:0;font-size:18px">${L.title}</h2><button class="b2" onclick="closeUpd()">戻る</button></div>
 <div class="banner warn"><span class="small">この文面は仮のものです。公開前に専門家の確認を受けてください。</span></div>
 <div class="card">${body}<p class="xs muted" style="margin-top:16px">制定日：${fmtY(LEGAL.ver)}</p></div>`}
export function consentView(){return`<div class="card" style="max-width:640px;margin:0 auto"><h2 style="font-size:18px">ご利用を始める前に</h2>
 <p class="small muted" style="margin-bottom:14px">管理者としてSmart Shift Managerを使い始めるには、利用規約とプライバシーポリシーへの同意が必要です。</p>
 <div class="stack"><label class="row"><input type="checkbox" id="f_ag1" onchange="render()"><span><button class="small" style="color:var(--accent-strong);text-decoration:underline" onclick="event.preventDefault();openLegal('terms')">利用規約</button>に同意します</span></label>
 <label class="row"><input type="checkbox" id="f_ag2" onchange="render()"><span><button class="small" style="color:var(--accent-strong);text-decoration:underline" onclick="event.preventDefault();openLegal('privacy')">プライバシーポリシー</button>に同意します</span></label>
 <div><button class="b" onclick="agree()" ${($('f_ag1')||{}).checked&&($('f_ag2')||{}).checked?'':'disabled'}>同意して始める</button></div></div></div>`}
export function agree(){if(!($('f_ag1').checked&&$('f_ag2').checked)){toast('両方にチェックしてください');return}S.consent={at:new Date().toISOString(),ver:LEGAL.ver};save();toast('同意を記録しました');render(true)}
export function footer(){return`<div class="row small" style="justify-content:center;gap:6px 18px;margin-top:28px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted)">${[['terms','利用規約'],['privacy','プライバシーポリシー'],['tokusho','特定商取引法に基づく表記']].map(([k,t])=>`<button onclick="openLegal('${k}')" style="text-decoration:underline">${t}</button>`).join('')}<button onclick="openUpd()" style="text-decoration:underline">アップデート情報</button><span>© Smart Shift Manager</span></div>`}
export function tabUpd(){const mt=upcomingMaint();
 return`<div class="row between" style="margin-bottom:14px"><div><h2 style="margin:0;font-size:18px">アップデート情報</h2><p class="small muted">Smart Shift Manager 運営からのお知らせです。現在のバージョン v${APP_VER}</p></div><button class="b2" onclick="closeUpd()">戻る</button></div>
 <div class="card"><h2>メンテナンス予定</h2>${mt.length?`<div class="list">${mt.map(m=>`<div class="li"><div class="body"><div class="row"><span class="chip warn">メンテナンス</span><b>${fmtDT(m.start)}${m.end?' 〜 '+fmtDT(m.end):''}</b></div><p class="small" style="margin-top:4px">${esc(m.body||'')}</p></div></div>`).join('')}</div>`:'<div class="empty">予定されているメンテナンスはありません</div>'}</div>
 <div class="card"><h2>今後の予定</h2>${UPD.plan.length?`<div class="list">${UPD.plan.map(p=>`<div class="li"><div class="body"><div class="row"><span class="chip a">${esc(p.when||'時期未定')}</span><b>${esc(p.title)}</b></div>${p.body?`<p class="small muted" style="margin-top:4px">${esc(p.body)}</p>`:''}</div></div>`).join('')}</div><p class="xs muted" style="margin-top:8px">予定は変わることがあります。</p>`:'<div class="empty">現在お知らせできる予定はありません</div>'}</div>
 <div class="card"><h2>更新履歴</h2><div class="list">${UPD.log.map(e=>`<div class="li" style="display:block"><div class="row"><b style="font-size:15px">v${e.v}</b><span class="small muted">${e.date?fmtY(e.date):esc(e.label||'')}</span>${e.v===APP_VER?'<span class="chip ok">最新</span>':''}</div>${logItems(e)}</div>`).join('')}</div></div>`}
export function whatsNew(){const e=UPD.log[0];$('md').innerHTML=`<div class="mdl"><div class="mdc fi"><div class="small muted">アップデートのお知らせ</div><h2 style="margin:2px 0 4px">v${e.v} に更新しました</h2><div class="xs muted">${e.date?fmtY(e.date):''}</div>${logItems(e)}<div class="row" style="justify-content:flex-end;margin-top:18px"><button class="b2" onclick="$('md').innerHTML='';openUpd()">すべての更新履歴</button><button class="b" onclick="setPref('seenVersion',APP_VER);$('md').innerHTML='';render()">閉じる</button></div></div></div>`}
export function maintBanner(){const m=upcomingMaint()[0];if(!m||new Date(m.start)-new Date()>7*864e5)return'';return`<div class="banner warn"><span class="chip warn">メンテナンス予定</span><span class="small">${fmtDT(m.start)}${m.end?' 〜 '+fmtDT(m.end):''}　${esc(m.body||'')}</span></div>`}
