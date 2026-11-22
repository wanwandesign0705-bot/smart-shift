// このファイルの関数・定数は main.js で window に登録され、
// 画面の onclick と他のファイルから名前だけで呼べます（v2.3 の1ファイル版と同じ動き）。
/* ===================== 管理者：プラン・お支払い ===================== */
export const linkKey=(p,c)=>p+'_'+c;
export function okUrl(u){return/^https:\/\/[^\s"'<>]+$/.test(u||'')}
export function tabPlan(){const t=tier(),p=S.plan,left=trialLeft();
 const cur=p.tier==='trial'?(left>0?`無料トライアル中（残り${left}日）・プロの全機能を利用できます`:'無料トライアルは終了しました。現在はフリープランです'):`${PLANS[t].name}プラン（${p.cycle==='y'?'年払い':'月払い'}）をご利用中`;
 const card=k=>{const P=PLANS[k],price=cycle==='y'?P.y:P.m,link=p.links[linkKey(k,cycle)],isCur=p.tier===k;
  return`<div class="plan ${k==='standard'?'rec':''}"><div class="row between"><h3 style="font-size:17px">${P.name}</h3>${k==='standard'?'<span class="chip a">おすすめ</span>':''}${isCur?'<span class="chip ok">ご利用中</span>':''}</div>
  <p class="small muted">${P.lead}</p><div><span class="price">${price?yen(price):'¥0'}</span><span class="small muted"> / ${cycle==='y'?'年':'月'}（税込）</span>${cycle==='y'&&price?`<div class="xs" style="color:var(--ok)">月あたり ${yen(price/12)}・2ヶ月分お得</div>`:''}</div>
  <ul class="small">${P.feat.map(f=>`<li>${f}</li>`).join('')}</ul>
  <div class="cta">${k==='free'?`<button class="b2" style="width:100%" disabled>${isCur?'ご利用中':'トライアル終了後は自動でフリー'}</button>`:isCur?`<button class="b2" style="width:100%" disabled>ご利用中</button>`:okUrl(link)?`<a class="b" style="width:100%" href="${esc(link)}" target="_blank" rel="noopener">${P.name}に申し込む</a><p class="xs muted" style="margin-top:6px;text-align:center">Stripeの決済ページが新しいタブで開きます</p>`:`<button class="b" style="width:100%" disabled>準備中</button><p class="xs muted" style="margin-top:6px;text-align:center">決済リンクが未設定です（下の運営者設定）</p>`}</div></div>`};
 return`<div class="card"><div class="row between"><div><div class="small muted">現在のご契約</div><h2 style="margin:2px 0 0;font-size:18px">${cur}</h2></div>${okUrl(p.portal)?`<a class="b2" href="${esc(p.portal)}" target="_blank" rel="noopener">請求書・領収書・解約</a>`:''}</div>
 ${p.tier==='trial'&&left>0?`<div class="bar" style="margin-top:12px"><i style="width:${Math.max(0,Math.min(100,(60-left)/60*100))}%"></i></div><p class="xs muted" style="margin-top:6px">トライアル終了後にお申し込みがない場合は、自動でフリープラン（スタッフ5名まで）になります。データは消えません。</p>`:''}</div>
 <div class="row between" style="margin-bottom:12px"><h2 style="margin:0">プランを選ぶ</h2><div class="seg"><button class="${cycle==='m'?'b':'b2'}" onclick="cycle='m';render()">月払い</button><button class="${cycle==='y'?'b':'b2'}" onclick="cycle='y';render()">年払い（2ヶ月分お得）</button></div></div>
 <div class="plans" style="margin-bottom:16px">${['free','standard','pro'].map(card).join('')}</div>
 <div class="card"><h2>運営者設定（アプリ提供者向け）</h2>
 <p class="small muted" style="margin-bottom:10px">Stripeダッシュボードで各プランの「Payment Link（決済リンク）」を作り、URLを貼り付けてください。カード情報はStripeの画面で入力され、このアプリには保存されません。支払い完了を自動でプランに反映するには、Stripe Webhookを受け取るサーバーが別途必要です。それまでは下の「プランを手動で切り替え」で有効化してください。</p>
 <div class="stack">${['standard','pro'].flatMap(k=>['m','y'].map(c=>`<label class="f">${PLANS[k].name}・${c==='m'?'月払い':'年払い'}の決済リンク<input id="f_lk_${k}_${c}" placeholder="https://buy.stripe.com/..." value="${esc(p.links[linkKey(k,c)]||'')}" onchange="setLink('${k}_${c}',this.value)"></label>`)).join('')}
 <label class="f">顧客ポータル（請求書・領収書・解約）のリンク<input id="f_portal" placeholder="https://billing.stripe.com/p/login/..." value="${esc(p.portal||'')}" onchange="setLink('portal',this.value)"></label>
 <div class="row"><label class="f">プランを手動で切り替え<select onchange="setTier(this.value)">${[['trial','無料トライアル'],['free','フリー'],['standard','スタンダード'],['pro','プロ']].map(([v,l])=>`<option value="${v}" ${p.tier===v?'selected':''}>${l}</option>`).join('')}</select></label>
 <label class="f">請求サイクル<select onchange="U('plan.cycle',this.value)"><option value="m" ${p.cycle==='m'?'selected':''}>月払い</option><option value="y" ${p.cycle==='y'?'selected':''}>年払い</option></select></label>
 <label class="f">トライアル開始日<input type="date" value="${esc(p.trialStart)}" onchange="U('plan.trialStart',this.value)"></label></div></div></div>`}
export function setLink(k,v){v=v.trim();if(v&&!okUrl(v)){toast('https:// から始まるURLを入力してください');return}if(k==='portal')S.plan.portal=v;else S.plan.links[k]=v;save();toast('保存しました');render()}
export function setTier(v){S.plan.tier=v;save();toast(v==='trial'?'トライアルに戻しました':PLANS[v].name+'プランに切り替えました');render()}
