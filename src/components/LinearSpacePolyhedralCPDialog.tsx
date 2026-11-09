import {useEffect,useMemo,useRef,useState} from 'react';
import {openAppDialog} from './AppDialog';
import type {Doc,Point} from '../core/types';
import {linearSpacePolyhedralCPPreset,prepareLinearSpacePolyhedralCPPreview,linearSpacePolyhedralCPSourceMatches,validateLinearSpacePolyhedralCPRecipe,type LinearSpacePolyhedralCPRecipe} from '../app/linearSpacePolyhedralCP';
import CPConstructionPlot from './CPConstructionPlot';
import './SemiGeneralMiuraCPDialog.css';
import './LinearSpacePolyhedralCPDialog.css';

type Model=LinearSpacePolyhedralCPRecipe['model'];
type Triple=[string,string,string];
type Four=[string,string,string,string];
type Common={leftWidthMm:string;rightWidthMm:string};
type LineDraft=Common&{model:'linear-chain';sectors:Four[];lengths:string[];spineTypes:('M'|'V')[]};
type SpaceDraft=Common&{model:'space-curve';points:Triple[];sigmaLeftDeg:string;sigmaRightDeg:string;initialCPDirectionDeg:string;nearEnabled:boolean;near:Triple};
type Draft=LineDraft|SpaceDraft;
type Preview=ReturnType<typeof prepareLinearSpacePolyhedralCPPreview>;
type Projection='XY'|'XZ'|'YZ';
const axes:Record<Projection,[0|1|2,0|1|2]>={XY:[0,1],XZ:[0,2],YZ:[1,2]};
const axisNames=['X','Y','Z'] as const;
const number=(s:string)=>{if(!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(s.trim())||!Number.isFinite(Number(s)))throw Error('请填写有限数字；空值不会自动替换。');return Number(s);};
const labels:Record<Model,string>={'linear-chain':'线性折链纸带','space-curve':'空间折线纸带'};
function draftFor(r:LinearSpacePolyhedralCPRecipe):Draft{
 const common={leftWidthMm:String(r.leftWidthMm),rightWidthMm:String(r.rightWidthMm)};
 return r.model==='linear-chain'?{...common,model:r.model,sectors:r.sectorsDeg.map(row=>row.map(String) as Four),lengths:r.lengthsMm.map(String),spineTypes:[...r.spineTypes]}:
  {...common,model:r.model,points:r.pointsMm.map(p=>p.map(String) as Triple),sigmaLeftDeg:String(r.sigmaLeftDeg),sigmaRightDeg:String(r.sigmaRightDeg),initialCPDirectionDeg:String(r.initialCPDirectionDeg),nearEnabled:r.osculatingVectorNear!==null,near:(r.osculatingVectorNear??[0,0,1]).map(String) as Triple};
}
function parse(d:Draft):LinearSpacePolyhedralCPRecipe{
 const common={model:d.model,leftWidthMm:number(d.leftWidthMm),rightWidthMm:number(d.rightWidthMm)};
 return validateLinearSpacePolyhedralCPRecipe(d.model==='linear-chain'?{...common,sectorsDeg:d.sectors.map(row=>row.map(number)),lengthsMm:d.lengths.map(number),spineTypes:[...d.spineTypes]}:
  {...common,pointsMm:d.points.map(p=>p.map(number)),sigmaLeftDeg:number(d.sigmaLeftDeg),sigmaRightDeg:number(d.sigmaRightDeg),initialCPDirectionDeg:number(d.initialCPDirectionDeg),osculatingVectorNear:d.nearEnabled?d.near.map(number):null});
}

/** Drafts remain local; only a validated snapshot for the exact current draft may be adopted. */
export default function LinearSpacePolyhedralCPDialog({initial,onAdoptCP,onClose}:{initial?:LinearSpacePolyhedralCPRecipe;onAdoptCP:(doc:Doc)=>boolean;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[model,setModel]=useState<Model>(initial?.model??'linear-chain'),[drafts,setDrafts]=useState<Record<Model,Draft>>(()=>({
  'linear-chain':draftFor(initial?.model==='linear-chain'?initial:linearSpacePolyhedralCPPreset('linear-chain')),
  'space-curve':draftFor(initial?.model==='space-curve'?initial:linearSpacePolyhedralCPPreset('space-curve')),
 })),[projection,setProjection]=useState<Projection>('XY'),[selected,setSelected]=useState(0),[prepared,setPrepared]=useState<{key:string;preview:Preview}|null>(null),[failure,setFailure]=useState<{key:string;message:string}|null>(null),[adoptError,setAdoptError]=useState('');
 const draft=drafts[model],key=JSON.stringify(draft),current=prepared?.key===key?prepared.preview:null,last=prepared?.preview.recipe.model===model?prepared.preview:null,error=failure?.key===key?failure.message:'',busy=!current&&!error;
 const update=(f:(d:Draft)=>Draft)=>{setAdoptError('');setDrafts(prev=>({...prev,[model]:f(prev[model])}));};
 const field=(name:keyof Common,value:string)=>update(d=>({...d,[name]:value}));
 useEffect(()=>openAppDialog(dialog.current),[]);
 useEffect(()=>{setFailure(null);const id=requestAnimationFrame(()=>{try{const preview=prepareLinearSpacePolyhedralCPPreview(parse(draft));setPrepared({key,preview});}catch(e){setFailure({key,message:(e as Error).message});}});return()=>cancelAnimationFrame(id);},[key]);
 useEffect(()=>{setSelected(i=>Math.min(i,(draft.model==='linear-chain'?draft.sectors.length:draft.points.length)-1));},[model,draft.model==='linear-chain'?draft.sectors.length:draft.points.length]);
 const sourcePoints=useMemo(()=>{if(draft.model==='space-curve'){try{return draft.points.map(p=>[number(p[axes[projection][0]]),number(p[axes[projection][1]])] as Point);}catch{return null;}}return last?.source.stations.map(s=>s.spineCPMm)??null;},[key,last,projection]);
 const [ax,ay]=axes[projection];
 const move=(i:number,p:Point)=>update(d=>{if(d.model!=='space-curve')return d;const points=d.points.map(row=>[...row] as Triple);if(!points[i])return d;points[i][ax]=String(p[0]);points[i][ay]=String(p[1]);return {...d,points};});
 function add(){update(d=>{
  if(d.model==='linear-chain'){if(d.sectors.length>=128)return d;return {...d,sectors:[...d.sectors,['90','90','90','90']],lengths:[...d.lengths,'1'],spineTypes:[...d.spineTypes,'V']};}
  if(d.points.length>=128)return d;
  try{const a=d.points.at(-2)!.map(number),b=d.points.at(-1)!.map(number),dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],length=Math.hypot(dx,dy,dz)||1;
   const p:Triple=(Math.hypot(dx,dy)>0?[b[0]-dy,b[1]+dx,b[2]]:[b[0]+length,b[1],b[2]]).map(String) as Triple;return {...d,points:[...d.points,p]};
  }catch{return d;}
 });setSelected(draft.model==='linear-chain'?draft.sectors.length:draft.points.length);}
 function remove(){update(d=>{
  if(d.model==='space-curve')return d.points.length>3?{...d,points:d.points.filter((_,i)=>i!==selected)}:d;
  if(d.sectors.length<=2)return d;const segment=Math.min(selected,d.lengths.length-1);
  return {...d,sectors:d.sectors.filter((_,i)=>i!==selected),lengths:d.lengths.filter((_,i)=>i!==segment),spineTypes:d.spineTypes.filter((_,i)=>i!==segment)};
 });}
 const numeric=(label:string,v:string,onChange:(v:string)=>void,unit?:string)=><label key={label}>{label}{unit?<span className="lsp-field-unit">{unit}</span>:null}<input type="text" inputMode="decimal" aria-label={label} value={v} onChange={e=>onChange(e.target.value)}/></label>;
 const count=draft.model==='linear-chain'?draft.sectors.length:draft.points.length;
 const shown=last;
 const targetLabel=draft.model==='space-curve'?`目标路径 · ${projection} 投影`:'折链中线 · CP 坐标';
 return <dialog ref={dialog} className="sgm-dialog lsp-dialog ui-dialog" aria-labelledby="lsp-title" onCancel={e=>{e.preventDefault();onClose();}}>
  <header><div><span>ORIGAMICA · FINITE PAPER STRIP</span><h2 id="lsp-title">折链／空间折线纸带 CP</h2></div><button aria-label="关闭折链纸带构造" onClick={onClose}>×</button></header>
  <div className="sgm-workspace lsp-workspace"><aside>
   <label className="sgm-mode">折链纸带构造方式<select aria-label="折链纸带构造方式" value={model} onChange={e=>{setAdoptError('');setModel(e.target.value as Model);setSelected(0);}}><option value="linear-chain">线性折链 · 四扇角逐站构造</option><option value="space-curve">空间折线 · XYZ 路径展开</option></select></label>
   <div className="sgm-fields">{numeric('左侧宽度',draft.leftWidthMm,v=>field('leftWidthMm',v),'mm')}{numeric('右侧宽度',draft.rightWidthMm,v=>field('rightWidthMm',v),'mm')}</div>
   {draft.model==='space-curve'&&<><div className="sgm-fields lsp-space-fields">
    {numeric('初始左子弧',draft.sigmaLeftDeg,v=>update(d=>d.model==='space-curve'?{...d,sigmaLeftDeg:v}:d),'°')}
    {numeric('初始右子弧',draft.sigmaRightDeg,v=>update(d=>d.model==='space-curve'?{...d,sigmaRightDeg:v}:d),'°')}
    {numeric('首 CP 方位',draft.initialCPDirectionDeg,v=>update(d=>d.model==='space-curve'?{...d,initialCPDirectionDeg:v}:d),'°')}
    <label>目标路径投影<select aria-label="目标路径投影" value={projection} onChange={e=>setProjection(e.target.value as Projection)}><option>XY</option><option>XZ</option><option>YZ</option></select></label>
   </div><label className="lsp-near"><input type="checkbox" aria-label="指定初始密切向量" checked={draft.nearEnabled} onChange={e=>update(d=>d.model==='space-curve'?{...d,nearEnabled:e.target.checked}:d)}/>指定初始密切向量</label>{draft.nearEnabled&&<div className="lsp-vector">{axisNames.map((a,i)=>numeric('密切向量 '+a,draft.near[i],v=>update(d=>{if(d.model!=='space-curve')return d;const near=[...d.near] as Triple;near[i]=v;return {...d,near};})))}</div>}</>}
   <section className="sgm-source-editor lsp-editor"><div className="sgm-editor-head"><strong>{draft.model==='linear-chain'?'各站四扇角与脊线':'三维目标点'}</strong><span>{count} {draft.model==='linear-chain'?'站':'点'}</span></div>
    <div className="sgm-list lsp-list" role="group" aria-label={draft.model==='linear-chain'?'折链站点参数':'空间路径点坐标'}>
     {draft.model==='linear-chain'?<><div className="lsp-angle-row lsp-table-head"><span>站</span>{[1,2,3,4].map(i=><span key={i}>α{i} / °</span>)}</div>{draft.sectors.map((row,i)=><div className="lsp-station" key={i} data-selected={selected===i}>
      <div className="lsp-angle-row"><button aria-label={`选择站 ${i+1}`} onClick={()=>setSelected(i)}>{i+1}</button>{row.map((v,j)=><input key={j} aria-label={`站 ${i+1} 扇角 ${j+1}`} type="text" inputMode="decimal" value={v} onFocus={()=>setSelected(i)} onChange={e=>update(d=>{if(d.model!=='linear-chain')return d;const sectors=d.sectors.map(r=>[...r] as Four);sectors[i][j]=e.target.value;return {...d,sectors};})}/>)}</div>
      {i<draft.lengths.length&&<div className="lsp-spine-row"><span>→ {i+2} 站</span><label>长度<input aria-label={`脊线 ${i+1} 长度`} type="text" inputMode="decimal" value={draft.lengths[i]} onChange={e=>update(d=>{if(d.model!=='linear-chain')return d;const lengths=[...d.lengths];lengths[i]=e.target.value;return {...d,lengths};})}/><span>mm</span></label><select aria-label={`脊线 ${i+1} 山谷`} value={draft.spineTypes[i]} onChange={e=>update(d=>{if(d.model!=='linear-chain')return d;const spineTypes=[...d.spineTypes];spineTypes[i]=e.target.value as 'M'|'V';return {...d,spineTypes};})}><option value="M">山折 M</option><option value="V">谷折 V</option></select></div>}
     </div>)}</>:<><div className="lsp-point-row lsp-table-head"><span>点</span>{axisNames.map(a=><span key={a}>{a} / mm</span>)}</div>{draft.points.map((p,i)=><div className="lsp-point-row" key={i} data-selected={i===selected}><button aria-label={`选择目标点 ${i+1}`} onClick={()=>setSelected(i)}>{i+1}</button>{p.map((v,j)=><input key={j} aria-label={`点 ${i+1} ${axisNames[j]}`} type="text" inputMode="decimal" value={v} onFocus={()=>setSelected(i)} onChange={e=>update(d=>{if(d.model!=='space-curve')return d;const points=d.points.map(r=>[...r] as Triple);points[i][j]=e.target.value;return {...d,points};})}/>)}</div>)}</>}
    </div><div className="sgm-list-actions"><button onClick={add} disabled={count>=128||(draft.model==='space-curve'&&!sourcePoints)}>增加末{draft.model==='linear-chain'?'站':'点'}</button><button onClick={remove} disabled={count<=(draft.model==='linear-chain'?2:3)} title="删除选中站或点；相邻站按剩余参数重新构造">删除选中{draft.model==='linear-chain'?'站':'点'}</button></div>
   </section>
   <button className="sgm-restore" onClick={()=>{setAdoptError('');setDrafts(prev=>({...prev,[model]:draftFor(initial?.model===model?initial:linearSpacePolyhedralCPPreset(model))}));setSelected(0);}}>还原本次参数</button>
   <p className="sgm-hint">紫色为目标路径，青色为生成线，黑色为纸边。{draft.model==='space-curve'?`拖点只修改 ${projection} 两轴；第三轴与原毫米坐标保留。`:'扇角、脊线长度与山谷分别保留；不自动修正输入。'}</p>
  </aside><main data-preview-current={!!current} data-source-key={current?JSON.stringify(current.recipe):undefined} data-source-model={current?.recipe.model}><div className="sgm-plots paired lsp-plots">
   {sourcePoints?<CPConstructionPlot key={'target-'+model+'-'+(model==='space-curve'?projection:'cp')} label={targetLabel} points={sourcePoints} selected={selected} onSelect={setSelected} onMove={draft.model==='space-curve'?move:undefined} axes={draft.model==='space-curve'?[axisNames[ax],axisNames[ay]]:['X','Y']}/>:<div className="sgm-empty">填写有效坐标后显示目标路径</div>}
   <div className="lsp-cp-pane" data-current={!!current}>{shown?<CPConstructionPlot key={'cp-'+model} label="生成 CP 纸面" doc={shown.doc}/>:<div className="sgm-empty">等待有效原参数…</div>}</div>
  </div><div className="lsp-metrics" data-current={!!current}>{shown?<><span>{shown.summary.stations} 站</span><span>{shown.summary.vertices} 顶点</span><span>{shown.summary.edges} 条边</span><span>{shown.summary.faces} 纸面</span>{!current&&<strong>上次有效预览</strong>}</>:<span>当前尚无有效 CP</span>}</div>
  <div className="sgm-state lsp-state" data-state={adoptError||error?'error':current?'ready':'checking'} role={error||adoptError?'alert':'status'}>{adoptError||error||(current?'二维纸面已核验，可以采用。':'正在构造并检查纸面…')}{!current&&shown?' 当前图为上一次有效纸面，不能采用。':''}</div>
  {model==='space-curve'&&<details className="lsp-seam"><summary>共享内部缝：原 B/0 → 本地 F/0{shown?` · ${shown.source.boundaryEncoding.length} 处`:''}</summary><p>原末段内部线标为边界 B/0，但两侧纸面仍共享该线。本地明确将它保存为零角连面缝 F/0，并保留原 B/0 记录，不视为裁切边。请使用 JSON、FOLD 或 DXF；普通 CP／OPX 不支持 F 类型。</p></details>}
  <p className="sgm-scope">采用的是二维 CP 与可重建原参数。{model==='space-curve'?(shown?.summary.poseCertified?'原静态姿态通过校验；':'原三维姿态与目标折角未通过完整认证；'):'原入口未提供认证三维姿态；'}运动、碰撞与平折层序未认证。</p>
  </main></div><footer><span>{labels[model]} · 1 原单位 = 1 mm</span><button onClick={onClose}>取消</button><button className="primary" disabled={!current||busy} onClick={()=>{if(!current)return;try{setAdoptError('');const doc=current.build(parse(draft));if(!linearSpacePolyhedralCPSourceMatches(doc))throw Error('当前纸面与原参数不一致，请重新构造。');if(onAdoptCP(doc))onClose();}catch(e){setAdoptError((e as Error).message);}}}>采用折链纸带 CP →</button></footer>
 </dialog>;
}
