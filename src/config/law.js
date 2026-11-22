// このファイルの関数・定数は main.js で window に登録され、
// 画面の onclick と他のファイルから名前だけで呼べます（v2.3 の1ファイル版と同じ動き）。
/* ===== 労務の基準値（年ごとにここだけ差し替える） ===== */
export const LAW={
 year:'令和8年分',checked:'2026-11-17',
 fuyo:[[1300000,'130万円（社会保険の扶養）'],[1360000,'136万円（扶養控除・配偶者控除）'],[1780000,'178万円（本人の所得税）']],
 shaho:{minH:20,fullH:30,months:2,bigSize:51,
  smallNote:'従業員50人以下の会社は、現在は週20時間以上でも社会保険の加入義務はありません。企業規模の要件は2027年10月から段階的に引き下げ予定です。'}};
export const NOTE='※参考値です。最終的な判断は社会保険労務士などの専門家にご確認ください';
export const noteH=(extra)=>`<p class="xs muted" style="margin-top:8px">${NOTE}${extra?'　'+extra:''}</p>`;
export const lawBasis=()=>`${LAW.year}の基準・最終確認日${(d=>d.getFullYear()+'年'+(d.getMonth()+1)+'月'+d.getDate()+'日')(pd(LAW.checked))}`;
export const FUYO=[[0,'設定なし'],...LAW.fuyo];
export const FUYO_MAP={1060000:1300000,1230000:1360000,1500000:1360000,1600000:1780000};
