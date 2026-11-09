import {useEffect,useMemo,useRef,useState} from 'react';
import {openAppDialog} from './AppDialog';
import type {Doc,Point} from '../core/types';import {inspectMaterialTopology} from '../core/materialTopology';
import {sampleReshape} from '../app/curvedGenericCylinderReshape';
import {savedDevelopablePaperPreset,validateSavedDevelopablePaperRecipe,prepareSavedDevelopablePaperPreview,savedDevelopablePaperSourceMatches,type SavedDevelopablePaperRecipe} from '../app/savedDevelopablePaper';
import CPConstructionPlot from './CPConstructionPlot';import './SemiGeneralMiuraCPDialog.css';import './SavedDevelopablePaperDialog.css';
type Model=SavedDevelopablePaperRecipe['model'];type Preview=ReturnType<typeof prepareSavedDevelopablePaperPreview>;
type Common={model:Model;end:string;segments:string;unit:string};type ConeDraft=Common&{model:'cone-flatten';angle:string;startV:string;endV:string};type CylinderDraft=Common&{model:'flatten-cylinder'|'curl-plane';width:string};type Draft=ConeDraft|CylinderDraft;
const titles:Record<Model,string>={'cone-flatten':'原圆锥 · 展开纸形','flatten-cylinder':'原柱面 · 展平纸形','curl-plane':'原平面 · 卷柱纸形'};
function draftFor(r:SavedDevelopablePaperRecipe):Draft{const common={end:String(r.parameterEnd),segments:String(r.curveSegments),unit:String(r.unitSizeMm)};return r.model==='cone-flatten'?{...common,model:r.model,angle:String(r.angleDeg),startV:String(r.transverseStart),endV:String(r.transverseEnd)}:{...common,model:r.model,width:String(r.rulingWidth)};}
function number(v:string){if(!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(v.trim())||!Number.isFinite(Number(v)))throw Error('请填写有限数字，空值不会补成 0。');return Number(v);}
function parse(d:Draft):SavedDevelopablePaperRecipe{const common={model:d.model,parameterEnd:number(d.end),curveSegments:number(d.segments),unitSizeMm:number(d.unit)};return validateSavedDevelopablePaperRecipe(d.model==='cone-flatten'?{...common,angleDeg:number(d.angle),transverseStart:number(d.startV),transverseEnd:number(d.endV)}:{...common,rulingWidth:number(d.width)});}
type ConeSamples={outer:{flat:Point;space:[number,number,number]}[];inner:{flat:Point;space:[number,number,number]}[];base:{flat:Point;space:[number,number,number]}[]};
/** This drawing is local display data, never part of the adopted paper document. */
function referenceDoc(preview:Preview,azimuth:number):Doc{
 const r=preview.recipe,angle=azimuth*Math.PI/180,elevation=28*Math.PI/180,project=(p:number[]):Point=>[(Math.cos(angle)*p[0]-Math.sin(angle)*p[2])*r.unitSizeMm,(Math.cos(elevation)*p[1]-Math.sin(elevation)*(Math.sin(angle)*p[0]+Math.cos(angle)*p[2]))*r.unitSizeMm],segments:Doc['segments']=[],all:Point[]=[];
 const edge=(a:Point,b:Point,id:string)=>{if(a[0]===b[0]&&a[1]===b[1])return;segments.push({id,a,b,assignment:'U',angle:null});all.push(a,b);},path=(points:number[][],name:string)=>{const p=points.map(project);for(let i=1;i<p.length;i++)edge(p[i-1],p[i],name+'-'+i);return p;};
 if(r.model==='cone-flatten'){
  const data=preview.sourceSamples as unknown as ConeSamples,outer=path(data.outer.map(p=>p.space),'source-outer'),inner=path(data.inner.map(p=>p.space),'source-inner');path(data.base.map(p=>p.space),'source-base');const step=Math.max(1,Math.round(r.curveSegments/12));for(let i=0;i<outer.length;i++)if(i%step===0||i===outer.length-1)edge(outer[i],inner[i],'source-ruling-'+i);
 }else{
  const samples=sampleReshape({mode:r.model,parameterEnd:r.parameterEnd,rulingWidth:r.rulingWidth,curveSegments:r.curveSegments}),shape=samples.stages[r.model==='flatten-cylinder'?'source':'target'],base=path(shape.crease,'source-base'),outer=path(shape.outerBoundary,'source-outer'),step=Math.max(1,Math.round(r.curveSegments/12));for(let i=0;i<base.length;i++)if(i%step===0||i===base.length-1)edge(base[i],outer[i],'source-ruling-'+i);
 }
 const xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);return {schemaVersion:2,name:'仅显示的原曲面正交投影',paper:{width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)},objects:[],segments};
}

export default function SavedDevelopablePaperDialog({initial,onAdoptCP,onClose}:{initial?:SavedDevelopablePaperRecipe;onAdoptCP:(doc:Doc)=>boolean;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),seed=useRef(initial),[model,setModel]=useState<Model>(initial?.model??'cone-flatten'),[drafts,setDrafts]=useState<Record<Model,Draft>>(()=>Object.fromEntries((Object.keys(titles) as Model[]).map(m=>[m,draftFor(initial?.model===m?initial:savedDevelopablePaperPreset(m))])) as Record<Model,Draft>),
  [prepared,setPrepared]=useState<{key:string;preview:Preview}|null>(null),[failure,setFailure]=useState<{key:string;message:string}|null>(null),[adoptError,setAdoptError]=useState(''),[azimuth,setAzimuth]=useState(-35);
 const draft=drafts[model],key=JSON.stringify(draft),shown=prepared?.preview.recipe.model===model?prepared.preview:null,current=prepared?.key===key?shown:null,error=adoptError||(failure&&failure.key===key?failure.message:''),
  reference=useMemo(()=>shown?referenceDoc(shown,azimuth):undefined,[shown,azimuth]),topology=useMemo(()=>shown?inspectMaterialTopology(shown.doc):null,[shown]),
  update=(f:(d:Draft)=>Draft)=>{setAdoptError('');setDrafts(prev=>({...prev,[model]:f(prev[model])}));},common=(field:'end'|'segments'|'unit',value:string)=>update(d=>({...d,[field]:value}));
 useEffect(()=>openAppDialog(dialog.current),[]);
 useEffect(()=>{setFailure(null);const id=requestAnimationFrame(()=>{try{setPrepared({key,preview:prepareSavedDevelopablePaperPreview(parse(draft))});}catch(e){setFailure({key,message:(e as Error).message});}});return()=>cancelAnimationFrame(id);},[key]);
 const numeric=(label:string,value:string,onChange:(v:string)=>void,unit?:string)=><label key={label}>{label}{unit&&<small>{unit}</small>}<input type="text" inputMode="decimal" aria-label={label} value={value} onChange={e=>onChange(e.target.value)}/></label>;
 const r=shown?.recipe,dimension=shown?`${Number(shown.doc.paper.width.toPrecision(6))} × ${Number(shown.doc.paper.height.toPrecision(6))} mm`:'—';
 return <dialog ref={dialog} className="sgm-dialog sdp-dialog ui-dialog" aria-labelledby="sdp-title" onCancel={e=>{e.preventDefault();onClose();}}><header><div><span>ORIGAMICA · SAVED PAPER OUTLINE</span><h2 id="sdp-title">原圆锥／柱面 · 展开纸形</h2></div><button aria-label="关闭原展开纸形构造" onClick={onClose}>×</button></header>
  <div className="sgm-workspace sdp-workspace"><aside>
   <label className="sgm-mode">原展开纸形构造<select aria-label="原展开纸形构造" value={model} onChange={e=>{setAdoptError('');setModel(e.target.value as Model);}}>{(Object.keys(titles) as Model[]).map(m=><option key={m} value={m}>{titles[m]}</option>)}</select></label>
   <p className="sdp-intro">展开纸形，不生成新折痕。采用的是一张纸的 B/0 边界，三维图只作原面参考。</p>
   <div className="sgm-fields sdp-fields">{draft.model==='cone-flatten'?<>
    {numeric('原锥半角',draft.angle,v=>update(d=>d.model==='cone-flatten'?{...d,angle:v}:d),'°')}{numeric('原参数终点',draft.end,v=>common('end',v),'rad')}
    {numeric('母线起点 v₀',draft.startV,v=>update(d=>d.model==='cone-flatten'?{...d,startV:v}:d),'−1…1')}{numeric('母线终点 v₁',draft.endV,v=>update(d=>d.model==='cone-flatten'?{...d,endV:v}:d),'−1…1')}
   </>:<>{numeric('原参数终点',draft.end,v=>common('end',v),'rad')}{numeric('柱面带宽',draft.width,v=>update(d=>d.model!=='cone-flatten'?{...d,width:v}:d),'源单位')}</>}
    {numeric('曲线显示分段',draft.segments,v=>common('segments',v),'16–256')}{numeric('每源单位',draft.unit,v=>common('unit',v),'mm')}
   </div>
   {draft.model==='cone-flatten'&&<><label className="sdp-slider">原锥半角<input aria-label="原锥半角滑块" type="range" min="15" max="60" step=".25" value={Number.isFinite(Number(draft.angle))?Math.max(15,Math.min(60,Number(draft.angle))):30} onChange={e=>update(d=>d.model==='cone-flatten'?{...d,angle:e.target.value}:d)}/></label><div className="sdp-crop-actions"><button onClick={()=>update(d=>d.model==='cone-flatten'?{...d,startV:'-1',endV:'1'}:d)}>完整原锥尖</button><button onClick={()=>update(d=>d.model==='cone-flatten'?{...d,endV:'.8'}:d)}>截顶示例</button></div></>}
   <div className="sdp-original-pose">{draft.model==='cone-flatten'?<>原完整域 u∈[0,π]、v∈[−1,1]<br/>v=1 为原锥尖，不按距离焊点。</>:<>原法曲率 κₙ={draft.model==='flatten-cylinder'?'0 · 柱面展为平面':'1 · 平面卷为圆柱'}<br/>参考圆柱半径为一源单位；原曲面阶段固定，无虚构折态插值。</>}</div>
   <label className="sdp-azimuth">原三维参考视角<input aria-label="原纸形三维参考视角" type="range" min="-180" max="180" value={azimuth} onChange={e=>setAzimuth(Number(e.target.value))}/><output>{azimuth}°</output></label>
   <button className="sgm-restore" onClick={()=>{setAdoptError('');setDrafts(prev=>({...prev,[model]:draftFor(seed.current?.model===model?seed.current:savedDevelopablePaperPreset(model))}));}}>还原本次参数</button>
   <p className="sgm-hint">黑色为展开纸边，紫色为原三维参考。毫米刻度、缩放与拖动只改变视图。</p>
  </aside><main data-preview-current={!!current} data-source-key={current?JSON.stringify(current.recipe):undefined} data-source-model={current?.recipe.model} data-source-unit-mm={current?.recipe.unitSizeMm}>
   <div className="sgm-plots paired sdp-plots"><div className="sdp-paper-pane" data-current={!!current}>{shown?<CPConstructionPlot key={'paper-'+model} label="可采用展开纸形" doc={shown.doc}/>:<div className="sgm-empty">等待有效原保存参数…</div>}</div><div className="sdp-source-pane" data-current={!!current}>{reference?<CPConstructionPlot key={'source-'+model} label="原曲面正交投影（参考）" doc={reference} axes={['X′','Y′']}/>:<div className="sgm-empty">原三维仅供参考</div>}</div></div>
   <div className="sdp-metrics" data-current={!!current}>{shown&&topology?.ok?<><span>{topology.graph.vertices_coords.length} 顶点</span><span>{shown.doc.segments.length} 条纸边</span><span>{topology.graph.faces_vertices?.length??0} 纸面</span><strong>{dimension}</strong>{!current&&<span className="sdp-ghost">上次有效预览</span>}</>:<span>一纸面 · 无新增折痕</span>}</div>
   <div className="sgm-state" role={error?'alert':'status'} data-state={error?'error':current?'ready':'checking'}>{error||(current?'当前纸形通过单次覆盖与交叉检查，可以采用。':'正在重新生成原展开纸形…')}{shown&&!current?' 图中为上次有效纸形，不能采用。':''}</div>
   <p className="sdp-scope">{model==='cone-flatten'?'曲边采用有限弦近似；完整锥尖保原参数奇异。':'采用原 XY 平面四角，未采用三维投影。'}不输出参考母线、三角或私有接缝；没有连续曲面、刚性平折、层序或运动认证。</p>
   <details className="sdp-source"><summary>原保存来源</summary><p>{model==='cone-flatten'?'NFlattenGeneric2D · In[3886]：原 b=(cos(sinθ·u),sin(sinθ·u))、d=−b；只取原域子范围。':model==='flatten-cylinder'?'ReshapeGeneric3D / NReshapeGeneric3D · In[3891/3896]：采用原 target 平面 [u,v,0]。':'ReshapeGeneric3D / NReshapeGeneric3D · In[3892/3897]：采用原 source 平面 [u,v,0]，target 圆柱只作参考。'}原单位未规定，使用显式毫米单位一次转换，保原坐标、方向和初值。</p></details>
  </main></div><footer><span>{r?`1 源单位 = ${r.unitSizeMm} mm · 全部 B/0 纸边`:'采用后可保存、重新打开与按源参数重建'}</span><button onClick={onClose}>取消</button><button className="primary" aria-label="采用原展开纸形" disabled={!current||!!error} onClick={()=>{if(!current)return;try{setAdoptError('');const doc=current.build(parse(draft));if(!savedDevelopablePaperSourceMatches(doc))throw Error('纸形与原参数来源不一致，请重新构造。');if(onAdoptCP(doc))onClose();else setAdoptError('当前工程尚未接受纸形，可以继续修改或取消。');}catch(e){setAdoptError((e as Error).message);}}}>采用展开纸形 →</button></footer>
 </dialog>;
}
