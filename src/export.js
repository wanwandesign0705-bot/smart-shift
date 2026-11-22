// このファイルの関数・定数は main.js で window に登録され、
// 画面の onclick と他のファイルから名前だけで呼べます（v2.3 の1ファイル版と同じ動き）。
/* ===================== エクスポート ===================== */
export async function dl(name,blob){try{const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)}catch(e){toast('保存できませんでした：'+(e&&e.message||e))}}
export async function loadExcel(){try{return(await import('exceljs')).default}catch(e){return null}}
export const XL={F:'Meiryo',navy:'FF1E3A5F',ln:{style:'thin',color:{argb:'FFCBD5E1'}}};XL.bd={top:XL.ln,left:XL.ln,bottom:XL.ln,right:XL.ln};
export const fl=a=>({type:'pattern',pattern:'solid',fgColor:{argb:a}}),ar=h=>'FF'+String(h).replace('#','').toUpperCase();
export const pg={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:1,horizontalCentered:true,margins:{left:.4,right:.4,top:.5,bottom:.5,header:.3,footer:.3}};
export function xH(w,r,c,v,f,col){const x=w.getCell(r,c);x.value=v;x.fill=fl(f);x.font={name:XL.F,size:11,bold:true,color:{argb:col}};x.alignment={horizontal:'center',vertical:'middle',wrapText:true};x.border=XL.bd}
export function xT(w,t,n){w.mergeCells(1,1,1,n);const c=w.getCell(1,1);c.value=t;c.font={name:XL.F,size:18,bold:true,color:{argb:'FF0F2A5C'}};w.getRow(1).height=36}
export async function expXlsx(){const ExcelJS=await loadExcel();if(!ExcelJS){toast('Excelライブラリを読み込めませんでした');return}
 const wb=new ExcelJS.Workbook(),D=dim(),N=D+3,F=XL.F;
 const ws=wb.addWorksheet('シフト表',{pageSetup:pg,views:[{state:'frozen',xSplit:1,ySplit:3}]});
 ws.getColumn(1).width=16;for(let c=2;c<=D+1;c++)ws.getColumn(c).width=D<=14?9:7.5;ws.getColumn(D+2).width=10;ws.getColumn(D+3).width=12;
 xT(ws,ptitle()+' シフト表',N);ws.mergeCells(2,1,2,N);const lg=ws.getCell(2,1);lg.value='凡例　'+[...S.shifts,PL].map(x=>x.name+(x.time?' '+x.time:'')).join('　/　');lg.font={name:F,size:10,color:{argb:'FF475569'}};ws.getRow(3).height=36;
 xH(ws,3,1,'スタッフ',XL.navy,'FFFFFFFF');
 for(let d=1;d<=D;d++){const r=holSun(d),b=dow(d)===6;xH(ws,3,d+1,`${dlabel(d)}\n${isHol(d)?'祝':WD[dow(d)]}`,r?'FFFFD1D1':b?'FFC7DEFF':XL.navy,r?'FF991B1B':b?'FF1E3A8A':'FFFFFFFF')}
 xH(ws,3,D+2,'出勤日数',XL.navy,'FFFFFFFF');xH(ws,3,D+3,'総労働時間',XL.navy,'FFFFFFFF');
 const st=stats();
 S.staff.forEach((s,i)=>{const row=ws.getRow(4+i);row.height=34;const n=row.getCell(1);n.value=s.name;n.font={name:F,size:12,bold:true};n.alignment={vertical:'middle',indent:1};n.border=XL.bd;
  for(let d=1;d<=D;d++){const id=gv(s,d),x=sh(id),col=isWork(id)||isPL(id),m=S.memo[s.id+'_'+dk(d)],c=row.getCell(d+1),fg=col?'FF1E293B':'FF64748B',tn=holSun(d)?'FFFFE4E4':dow(d)===6?'FFDCEBFF':'FFFFFFFF',nm=x?x.name:'';
   c.value=m?{richText:[{text:nm,font:{name:F,size:11,bold:true,color:{argb:fg}}},{text:(nm?'\n':'')+m,font:{name:F,size:8,color:{argb:fg}}}]}:nm;
   c.fill=fl(col?ar(x.color):tn);c.font={name:F,size:11,bold:true,color:{argb:fg}};c.alignment={horizontal:'center',vertical:'middle',wrapText:true};c.border=XL.bd}
  [[D+2,st[i].days],[D+3,+st[i].h.toFixed(1)]].forEach(([k,v])=>{const c=row.getCell(k);c.value=v;c.font={name:F,size:12};c.alignment={horizontal:'center',vertical:'middle'};c.border=XL.bd})});
 const w2=wb.addWorksheet('人件費・公平性',{pageSetup:pg});xT(w2,ptitle()+' 人件費・公平性',7);
 [18,12,12,10,10,10,14].forEach((v,i)=>w2.getColumn(i+1).width=v);['スタッフ','出勤日数','労働時間','深夜(h)','土日休み','有給','支給見込(円)'].forEach((v,i)=>xH(w2,3,i+1,v,XL.navy,'FFFFFFFF'));
 st.forEach((x,i)=>{const r=w2.getRow(4+i);[x.st.name,x.days,+x.h.toFixed(1),+x.night.toFixed(1),x.wend,x.pl,Math.round(x.cost)].forEach((v,k)=>{const c=r.getCell(k+1);c.value=v;c.font={name:F,size:11};c.border=XL.bd;if(k===6)c.numFmt='#,##0'})});
 const buf=await wb.xlsx.writeBuffer();dl(`shift_${curStart}_${S.span}.xlsx`,new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))}
export async function expPL(){const ExcelJS=await loadExcel();if(!ExcelJS){toast('Excelライブラリを読み込めませんでした');return}
 const wb=new ExcelJS.Workbook(),w=wb.addWorksheet('年次有給休暇管理簿',{pageSetup:pg});xT(w,'年次有給休暇管理簿（'+fmtY(iso(new Date()))+'時点）',9);
 const H=['氏名','入社日','基準日','付与日数','繰越・調整','取得日数','残日数','年5日義務','取得日'];[14,12,12,10,10,10,10,16,50].forEach((v,i)=>w.getColumn(i+1).width=v);H.forEach((v,i)=>xH(w,3,i+1,v,XL.navy,'FFFFFFFF'));
 S.staff.forEach((s,i)=>{const p=plInfo(s),days=Object.entries(S.grid[s.id]||{}).filter(([d,v])=>isPL(v)&&p.base&&d>=p.base&&d<=p.end).sort().map(([d,v])=>fmtY(d)+(v==='PLH'?'(半)':''));
  const r=w.getRow(4+i);[s.name,fmtY(s.hire),p.base?fmtY(p.base):'未付与',p.grant,+s.plAdj||0,p.used,p.remain,!p.obl?'対象外':p.need5>0?`あと${p.need5}日（${fmtY(p.end)}まで）`:'達成',days.join('、')].forEach((v,k)=>{const c=r.getCell(k+1);c.value=v;c.font={name:XL.F,size:11};c.border=XL.bd;c.alignment={vertical:'middle',wrapText:k===8}})});
 const nr=4+S.staff.length+1;w.mergeCells(nr,1,nr,9);const nc=w.getCell(nr,1);nc.value=NOTE;nc.font={name:XL.F,size:10,color:{argb:'FF64748B'}};
 const buf=await wb.xlsx.writeBuffer();dl(`有給管理簿_${iso(new Date())}.xlsx`,new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))}
