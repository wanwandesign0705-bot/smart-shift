// このファイルの関数・定数は main.js で window に登録され、
// 画面の onclick と他のファイルから名前だけで呼べます（v2.3 の1ファイル版と同じ動き）。
/* ===================== プラン ===================== */
export function trialLeft(){const a=pd(S.plan.trialStart||iso(new Date())),e=new Date(a.getFullYear(),a.getMonth()+2,a.getDate());return Math.ceil((e-todayD())/864e5)}
export function tier(){const p=S.plan.tier;return p==='trial'?(trialLeft()>0?'pro':'free'):(PLANS[p]?p:'free')}
export const can=f=>RANK[tier()]>=RANK[FEAT[f][0]];
export const staffLimit=()=>PLANS[tier()].staff;
export function lockedCard(f,inline){const p=PLANS[FEAT[f][0]];
 return`<div class="card"><div class="lockc"><div class="ic">${icon('lock')}</div><div style="flex:1 1 240px;min-width:0"><h3>${FEAT[f][1]}は${p.name}プランから使えます</h3><p class="muted small">月額 ${yen(p.m)}（税込）。年払いなら2ヶ月分お得です。</p></div>${adminOK?`<button class="b" onclick="go(6)">プランを見る</button>`:'<span class="chip">管理者にお問い合わせください</span>'}</div></div>`}
export function icon(n){const P={lock:'<rect x="4" y="11" width="16" height="10" rx="3"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',cal:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'};return`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent-strong)">${P[n]}</svg>`}
