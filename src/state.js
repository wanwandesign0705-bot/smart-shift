// このファイルの関数・定数は main.js で window に登録され、
// 画面の onclick と他のファイルから名前だけで呼べます（v2.3 の1ファイル版と同じ動き）。
/* ===================== 状態 ===================== */
export function mkShifts(t){return TPL[t].s.map((x,i)=>({id:'s'+i,name:x[0],time:x[1],color:x[2],min:x[3],brk:x[4],ake:!!x[5]}))}
export const HIRE=['2018-04-01','2020-10-01','2022-04-01','2023-06-01','2024-04-01','2025-02-01','2025-04-15','2026-04-01','2021-09-01','2024-10-01','2019-07-01'];
export function build(t){const T=TPL[t];return{industry:t,shifts:mkShifts(t),pats:[...T.p],need:[...T.need],bonus:{...T.bonus},
 staff:T.st.map((x,i)=>{const fix=Object.fromEntries(Object.entries(x[4]||{}).map(([d,k])=>[d,typeof k==='number'?'s'+k:k]));const r=x[1];
  const wd=x[3]==='w'?Math.max(1,Object.keys(fix).length):/パート/.test(r)?4:/アルバイト|学生/.test(r)?3:5;
  return{id:'t'+i,name:x[0],role:r,wage:x[2],mode:x[3],fix,hire:HIRE[i%HIRE.length],wdays:Math.min(5,wd),plAdj:0,plHours:/パート|アルバイト|学生/.test(r)?6:8,student:/学生/.test(r),longEmp:true,fuyo:/パート/.test(r)?1300000:/学生/.test(r)?1360000:0}})}}
export const sampleRes=()=>[[14,'18:30','山本様',6,'歓送迎会・コース'],[14,'19:00','佐々木様',4,''],[20,'18:30','木村様',10,'貸切'],[21,'18:00','加藤様',12,'宴会コース'],[27,'19:00','山口様',6,'忘年会'],[28,'18:30','斎藤様',8,'忘年会']].map((x,i)=>({id:'r'+i,date:'2026-11-'+pad(x[0]),time:x[1],name:x[2],n:x[3],note:x[4]}));
export function def(){return{v:7,...build(Object.keys(TPL)[0]),span:'m1',budget:1500000,wish:{},grid:{},memo:{},apw:'admin',res:sampleRes(),
 plan:{tier:'trial',cycle:'m',trialStart:iso(new Date()),links:{},portal:''},pubUntil:'',pubAt:'',deadline:20,company:'',consent:null,rules:{maxRun:6,interval:11},
 notices:[{id:'n0',date:iso(new Date()),title:'【サンプル】シフト希望の提出について',body:'翌月分の希望休・有給申請は毎月20日までにアプリから提出してください。'}]}}
export function migrate(o){const d=def();o={...d,...o};o.plan={...d.plan,...(o.plan||{})};o.plan.links=o.plan.links||{};o.rules={...d.rules,...(o.rules||{})};
 if(o.trial&&!(o.plan&&o.plan._m)){o.plan.trialStart=o.trial;o.plan._m=1}
 o.staff=(o.staff||[]).map((s,i)=>{const x={hire:HIRE[i%HIRE.length],wdays:5,plAdj:0,plHours:8,fuyo:0,fix:{},student:/学生/.test(s.role||''),longEmp:true,...s};if(FUYO_MAP[x.fuyo])x.fuyo=FUYO_MAP[x.fuyo];return x});
 ['wish','grid','memo'].forEach(k=>o[k]=o[k]||{});o.res=o.res||[];o.notices=o.notices||[];o.v=7;return o}

/* 画面どうしで共有する変数（v2.3 では let で宣言していたもの）。window に置き、どのファイルからも名前で読み書きする */
export function initState(){
 let S=LS.get('ssm7');
 if(!S){const old=LS.get('shiftApp6');S=old?migrate(old):def()}else S=migrate(S);
 Object.assign(window,{S,R:LS.get('ssm7_reqs')||[],DB:null,USER:null,mode:'local',isOwner:false,cfgReady:true,myUid:null,
  me:LS.get('ssm_me'),adminOK:false,showLock:false,tab:LS.get('ssm_tab')||0,sv:0,av:'shift',sel:null,resDay:null,msg:'',cycle:S.plan.cycle||'m',
  curStart:iso(new Date()),page:null,updSeen:LS.get('ssm_seen'),returning:!!LS.get('ssm7')||!!LS.get('shiftApp6')});
 norm();
 if(!updSeen&&!returning)LS.set('ssm_seen',APP_VER);
}
export const isNewUpd=()=>LS.get('ssm_seen')!==APP_VER;

/* ---- 保存（ローカル or 共有DB） ---- */
export function save(){LS.set('ssm7',S)}
export const REQ={
 async add(r){r.id='q'+Date.now()+Math.random().toString(36).slice(2,6);r.createdAt=new Date().toISOString();if(myUid)r.uid=myUid;
  R.push(r);LS.set('ssm7_reqs',R);render();return true},
 async upd(id,p){const r=R.find(x=>x.id===id);if(r)Object.assign(r,p);LS.set('ssm7_reqs',R);render();return true},
 async del(id){R=R.filter(x=>x.id!==id);LS.set('ssm7_reqs',R);render()}};
