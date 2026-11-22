// このファイルの関数・定数は main.js で window に登録され、
// 画面の onclick と他のファイルから名前だけで呼べます（v2.3 の1ファイル版と同じ動き）。
/* ===================== 管理者：有給管理 ===================== */
export function tabPL(){if(!can('pl'))return lockedCard('pl');
 const rows=S.staff.map((s,i)=>{const p=plInfo(s);
  const ob=!p.obl?'<span class="chip">対象外</span>':p.need5<=0?'<span class="chip ok">達成</span>':`<span class="chip ${p.daysToDue<90?'bad':'warn'}">あと${p.need5}日・期限 ${fmtY(p.end)}</span>`;
  return`<tr><td><b>${esc(s.name)}</b><div class="xs muted">${esc(s.role)}</div></td>
  <td><input type="date" id="f_hire_${i}" value="${esc(s.hire||'')}" onchange="U('staff.${i}.hire',this.value)"></td>
  <td><select onchange="U('staff.${i}.wdays',this.value,1)">${[5,4,3,2,1].map(n=>`<option value="${n}" ${+s.wdays===n?'selected':''}>${n===5?'週5日以上':'週'+n+'日'}</option>`).join('')}</select></td>
  <td class="num"><input type="number" step="0.5" style="width:64px" value="${+s.plHours||8}" onchange="U('staff.${i}.plHours',this.value,1)">h</td>
  <td>${p.base?fmtY(p.base):`<span class="small muted">初回 ${fmtY(p.first)}</span>`}</td>
  <td class="num">${p.grant}日</td>
  <td class="num"><input type="number" step="0.5" style="width:64px" value="${+s.plAdj||0}" onchange="U('staff.${i}.plAdj',this.value,1)"></td>
  <td class="num">${p.used}日${p.pend?`<div class="xs muted">申請中 ${p.pend}日</div>`:''}</td>
  <td class="num bold" style="color:${p.remain<=0?'var(--bad)':'inherit'}">${p.remain}日</td><td>${ob}</td></tr>`}).join('');
 const due=S.staff.map(s=>({s,p:plInfo(s)})).filter(x=>x.p.obl&&x.p.need5>0&&x.p.daysToDue<120);
 return`${due.length?`<div class="banner warn"><b>年5日の取得義務：期限が近いスタッフが${due.length}名います。</b><span class="small">${due.map(x=>esc(x.s.name)+'（あと'+x.p.need5+'日）').join('、')}</span></div>`:''}
 <div class="card"><div class="row between"><h2 style="margin:0">年次有給休暇管理簿</h2><button class="b2" onclick="${can('excel')?'expPL()':'go(6)'}">管理簿をExcel出力${can('excel')?'':' <span class="chip">有料</span>'}</button></div>
 <p class="small muted" style="margin:6px 0 10px">入社日と週の所定労働日数から、労働基準法39条の付与日数（比例付与を含む）を自動で計算します。週30時間以上働く人は「週5日以上」を選んでください。「繰越・調整」に前年度の繰越分や個別の調整日数を入れます。年10日以上付与される人は、基準日から1年以内に5日の取得が必要です。</p><p class="xs muted" style="margin:-4px 0 10px">${NOTE}</p>
 <div class="tw"><table class="t"><tr><th>スタッフ</th><th>入社日</th><th>所定日数</th><th class="num">1日の時間</th><th>基準日</th><th class="num">付与</th><th class="num">繰越・調整</th><th class="num">取得</th><th class="num">残日数</th><th>年5日義務</th></tr>${rows}</table></div></div>`}
