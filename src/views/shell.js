// このファイルの関数・定数は main.js で window に登録され、
// 画面の onclick と他のファイルから名前だけで呼べます（v2.3 の1ファイル版と同じ動き）。
/* ===================== ロック画面・全体 ===================== */
export function lockScreen(){const blocked=mode==='db'&&!isOwner;
 return`<div class="lk"><div class="lk-in"><div class="lk-mark">${icon('lock')}</div><div class="lk-eye">ADMINISTRATOR</div><div class="lk-t">Smart Shift Manager</div><div class="lk-s">管理者ログイン　チームの時間を、もっとスムーズに。</div>
 ${blocked?`<p class="lk-m" style="color:var(--fg)">管理画面はこのページのオーナーだけが開けます。</p>`:`<div id="lkb"><input id="lkp" class="lk-i" type="password" autocomplete="off" placeholder="管理者パスワードを入力" onkeydown="if(event.key==='Enter')unlock()"></div><button class="lk-b" onclick="unlock()">ロックを解除する</button><div id="lkm" class="lk-m"></div>`}
 <button class="lk-l" onclick="showLock=false;render()">スタッフ画面に戻る</button></div></div>`}
export function unlock(){if($('lkp').value!==S.apw){const b=$('lkb');b.classList.remove('shake');void b.offsetWidth;b.classList.add('shake');$('lkm').textContent='パスワードが違います。もう一度お試しください。';$('lkp').select();return}adminOK=true;showLock=false;render()}
export function relock(){adminOK=false;sel=null;render()}
export function go(t){page=null;tab=t;LS.set('ssm_tab',t);sel=null;render();window.scrollTo({top:0,behavior:'smooth'})}
export function banner(){const p=S.plan,left=trialLeft();
 if(p.tier==='trial'&&left>0)return`<div class="banner"><span class="chip a">無料トライアル 残り${left}日</span><span class="small">すべての機能を試せます。終了後はフリープラン（5名まで）になります。</span><button class="b3" onclick="go(6)">プランを選ぶ</button></div>`;
 if(tier()==='free')return`<div class="banner warn"><span class="chip warn">フリープラン</span><span class="small">有給・申請・人件費分析・Excel出力はスタンダードから使えます。</span><button class="b3" onclick="go(6)">アップグレード</button></div>`;return''}
export const ATABS=['シフト作成','申請・承認','有給管理','人件費・労務','社内連絡','設定','プラン・お支払い'];
export function render(fresh){
 const keep={};if(!fresh)document.querySelectorAll('#app [id^="f_"]').forEach(e=>keep[e.id]=e.type==='checkbox'?e.checked:e.value);const fid=document.activeElement&&document.activeElement.id;
 const lk=showLock&&!adminOK;$('hd').hidden=$('tabs').hidden=lk;
 const sync=mode==='db'?(cfgReady?'<span class="chip ok">共有中</span>':'<span class="chip">同期中…</span>'):'<span class="chip" title="データはこのブラウザ内に保存されます">この端末に保存</span>';
 $('hd').innerHTML=`<div class="brand"><div class="brand-mark"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M8 15h3"/></svg></div><b>Smart Shift Manager</b>${sync}</div>`+`<div class="row"><button class="b2" onclick="openUpd()">アップデート情報${isNewUpd()?' <span class="chip bad">NEW</span>':''}</button>`+
  (adminOK?`<div class="row"><span class="chip a">管理者モード・${PLANS[tier()].name}${S.plan.tier==='trial'&&trialLeft()>0?'（トライアル）':''}</span><button class="b2" onclick="relock()">ロックしてスタッフ画面へ</button></div>`:`<button class="b" onclick="showLock=true;render()">管理者メニュー</button>`)+'</div>';
 const pc=R.filter(r=>r.status==='pending').length;
 $('tabs').className=adminOK?'tabs':'';
 $('tabs').innerHTML=adminOK?ATABS.map((n,i)=>`<button class="tab ${tab===i&&!page?'on':''}" onclick="go(${i})">${n}${i===1&&pc?` <span class="dot">${pc}</span>`:''}</button>`).join(''):'';
 $('app').innerHTML=lk?lockScreen():maintBanner()+(page==='upd'?tabUpd():page?tabLegal(page):!adminOK?tabStaff():!S.consent?consentView():banner()+[tabShift,tabReqs,tabPL,tabAnalysis,tabNotice,tabSettings,tabPlan][tab]())+footer();
 for(const id in keep){const e=$(id);if(e){if(e.type==='checkbox')e.checked=keep[id];else if(e.tagName!=='SELECT'||[...e.options].some(o=>o.value===keep[id]))e.value=keep[id]}}
 if(fid&&$(fid)&&fid.startsWith('f_'))$(fid).focus();
 drw();if(lk)setTimeout(()=>{const i=$('lkp');i&&i.focus()},50)}
