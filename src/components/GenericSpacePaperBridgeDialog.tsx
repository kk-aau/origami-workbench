import {useEffect,useMemo,useRef,useState} from 'react';
import {openAppDialog} from './AppDialog';
import type {Doc,Point} from '../core/types';
import {inspectMaterialTopology} from '../core/materialTopology';
import {genericSpacePaperPreset,validateGenericSpacePaperRecipe,prepareGenericSpacePaperPreview,fetchGenericSpacePaperPreview,genericSpacePaperSourceMatches,type GenericSpacePaperRecipe} from '../app/genericSpacePaperBridge';
import CPConstructionPlot from './CPConstructionPlot';
import './SemiGeneralMiuraCPDialog.css';
import './GenericSpacePaperBridgeDialog.css';

type Draft={fold:[string,string,string];gamma:string;orientation:string;start:string;end:string;width:string;segments:string;rulings:string;unit:string};
type Preview=ReturnType<typeof prepareGenericSpacePaperPreview>;
const examples={noncircular:{title:'非圆曲折 · 自由空间源',foldCurve:['sin(s)','s**2/4','1-cos(s)'],foldAngle:'-2*atan(sqrt(4+s**2))',parameterStart:0,parameterEnd:1},circle:{title:'圆弧曲折 · 定折角',foldCurve:['cos(s)','sin(s)','0'],foldAngle:'2*pi/3',parameterStart:0,parameterEnd:1},helix:{title:'空间螺旋 · 变折角',foldCurve:['2*cos(s)','2*sin(s)','s/2'],foldAngle:'1.4+.2*sin(s)',parameterStart:.17,parameterEnd:1}} as const;
type Example=keyof typeof examples|'custom';
function draftFor(r:GenericSpacePaperRecipe):Draft{const q=r.query;return {fold:[...q.foldCurve],gamma:q.foldAngle,orientation:String(q.orientation),start:String(q.parameterStart),end:String(q.parameterEnd),width:String(q.transverseEnd),segments:String(q.segments),rulings:String(q.rulingSegments),unit:String(r.unitSizeMm)};}
function number(v:string){if(!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(v.trim())||!Number.isFinite(Number(v)))throw Error('请填写有限数字；空值不会替换成 0。');return Number(v);}
function parse(d:Draft){return validateGenericSpacePaperRecipe({query:{family:'space-curve-fold-generic-native',foldCurve:[...d.fold],foldAngle:d.gamma,orientation:number(d.orientation),parameterStart:number(d.start),parameterEnd:number(d.end),transverseStart:0,transverseEnd:number(d.width),segments:number(d.segments),rulingSegments:number(d.rulings)},unitSizeMm:number(d.unit)});}
function referenceDoc(p:Preview,angleDeg:number):Doc{
 const a=angleDeg*Math.PI/180,unit=p.recipe.unitSizeMm,project=(v:number[]):Point=>[(Math.cos(a)*v[0]-Math.sin(a)*v[2])*unit,(v[1]+.34*(Math.sin(a)*v[0]+Math.cos(a)*v[2]))*unit],
  center=p.native.grid.map(r=>project(r.sourceLeft[0])),left=p.native.grid.map(r=>project(r.sourceLeft.at(-1)!)),right=p.native.grid.map(r=>project(r.sourceRight.at(-1)!)),segments:Doc['segments']=[];
 const edge=(a:Point,b:Point,id:string)=>segments.push({id,a,b,assignment:'U',angle:null});
 for(let i=0;i<center.length;i++){edge(center[i],left[i],'source-left-ruling-'+i);edge(center[i],right[i],'source-right-ruling-'+i);if(i){edge(center[i-1],center[i],'source-curve-'+i);edge(left[i-1],left[i],'source-left-edge-'+i);edge(right[i-1],right[i],'source-right-edge-'+i);}}
 const all=[...center,...left,...right],xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);return {schemaVersion:2,name:'仅显示的原空间源投影',paper:{width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)},objects:[],segments};
}

/** Only a current successful backend snapshot can create a new adopted document. */
export default function GenericSpacePaperBridgeDialog({initial,onAdoptCP,onClose}:{initial?:GenericSpacePaperRecipe;onAdoptCP:(doc:Doc)=>boolean;onClose:()=>void}){
 const seed=useRef(initial??{...genericSpacePaperPreset(),unitSizeMm:100}),dialog=useRef<HTMLDialogElement>(null),generation=useRef(0),cache=useRef<{queryKey:string;preview:Preview}|null>(null),
  [draft,setDraft]=useState(()=>draftFor(seed.current)),[example,setExample]=useState<Example>(initial?'custom':'noncircular'),[prepared,setPrepared]=useState<Preview|null>(null),[failure,setFailure]=useState<{key:string;message:string}|null>(null),[adoptError,setAdoptError]=useState(''),[angle,setAngle]=useState(-35);
 const draftKey=JSON.stringify(draft),input=useMemo(()=>{try{const recipe=parse(draft);return {recipe,key:JSON.stringify(recipe),error:''};}catch(e){return {recipe:null,key:undefined,error:(e as Error).message};}},[draftKey]),
  current=input.recipe&&prepared?.key===input.key?prepared:null,error=adoptError||input.error||(failure&&failure.key===input.key?failure.message:''),ghost=prepared&&!current,
  reference=useMemo(()=>prepared?referenceDoc(prepared,angle):undefined,[prepared,angle]),topology=useMemo(()=>prepared?inspectMaterialTopology(prepared.doc):null,[prepared]),
  update=(field:Exclude<keyof Draft,'fold'>,value:string)=>{setExample('custom');setAdoptError('');setDraft(d=>({...d,[field]:value}));};
 useEffect(()=>openAppDialog(dialog.current),[]);
 useEffect(()=>{
  const id=++generation.current,controller=new AbortController();let timeout:ReturnType<typeof setTimeout>|undefined;setFailure(null);
  if(!input.recipe)return()=>{++generation.current;controller.abort();};
  const recipe=input.recipe,key=input.key!,queryKey=JSON.stringify(recipe.query),timer=setTimeout(async()=>{
   timeout=setTimeout(()=>controller.abort(Error('原二维恢复超时，请缩小参数域或采样数量再试。')),70000);
   try{const next=cache.current?.queryKey===queryKey?prepareGenericSpacePaperPreview(recipe,cache.current.preview.native):await fetchGenericSpacePaperPreview(recipe,controller.signal);
    if(id!==generation.current||controller.signal.aborted)return;cache.current={queryKey,preview:next};setPrepared(next);
   }catch(e){if(id===generation.current)setFailure({key,message:(e as Error).message});}finally{if(timeout)clearTimeout(timeout);}
  },150);
  return()=>{++generation.current;clearTimeout(timer);if(timeout)clearTimeout(timeout);controller.abort();};
 },[input.key]);
 const numeric=(label:string,value:string,field:Exclude<keyof Draft,'fold'>,unit?:string)=><label key={field}>{label}{unit&&<small>{unit}</small>}<input type="text" inputMode="decimal" aria-label={label} value={value} onChange={e=>update(field,e.target.value)}/></label>;
 function choose(value:Example){setAdoptError('');setExample(value);if(value==='custom')return;const e=examples[value],base=genericSpacePaperPreset();setDraft({...draftFor({...base,query:{...base.query,foldCurve:[...e.foldCurve],foldAngle:e.foldAngle,parameterStart:e.parameterStart,parameterEnd:e.parameterEnd}}),unit:draft.unit});}
 return <dialog ref={dialog} className="sgm-dialog gsp-dialog ui-dialog" aria-labelledby="gsp-title" onCancel={e=>{e.preventDefault();onClose();}}>
  <header><div><span>ORIGAMICA · FINITE CHORD PAPER</span><h2 id="gsp-title">空间曲折 · 有限弦纸张 CP</h2></div><button aria-label="关闭空间曲折纸张构造" onClick={onClose}>×</button></header>
  <div className="sgm-workspace gsp-workspace"><aside>
   <label className="sgm-mode">空间曲折构造示例<select aria-label="空间曲折构造示例" value={example} onChange={e=>choose(e.target.value as Example)}>{Object.entries(examples).map(([key,v])=><option key={key} value={key}>{v.title}</option>)}<option value="custom">自定义四源函数</option></select></label>
   <div className="gsp-functions"><strong>原空间曲线与折角</strong>{(['X','Y','Z'] as const).map((axis,i)=><label key={axis}><span>{axis}(s)</span><input aria-label={`空间曲线 ${axis}(s)`} type="text" spellCheck={false} value={draft.fold[i]} onChange={e=>{setExample('custom');setAdoptError('');setDraft(d=>{const fold=[...d.fold] as Draft['fold'];fold[i]=e.target.value;return {...d,fold};});}}/></label>)}<label><span>Γ(s)</span><input aria-label="原折角 Γ(s)" type="text" spellCheck={false} value={draft.gamma} onChange={e=>update('gamma',e.target.value)}/></label><p>角度用弧度，变量为 s；直接修改示例函数创作。</p></div>
   <div className="sgm-fields gsp-fields">
    {numeric('参数起点',draft.start,'start')}{numeric('参数终点',draft.end,'end')}
    {numeric('左右带宽',draft.width,'width','源单位')}{numeric('每源单位',draft.unit,'unit','mm')}
    {numeric('沿曲线分段',draft.segments,'segments','8–128')}{numeric('源横向采样',draft.rulings,'rulings','2–64')}
    <label>方向 σ<select aria-label="方向 σ" value={draft.orientation} onChange={e=>update('orientation',e.target.value)}><option value="1">＋1</option><option value="-1">−1</option></select></label><div className="gsp-fixed-width">从曲折 w=0<br/>向两侧生成纸面</div>
   </div>
   <label className="gsp-angle">原空间参考视角<input aria-label="原空间参考视角" type="range" min="-180" max="180" value={angle} onChange={e=>setAngle(Number(e.target.value))}/><output>{angle}°</output></label>
   <button className="sgm-restore" onClick={()=>{setAdoptError('');setExample(initial?'custom':'noncircular');setDraft(draftFor(seed.current));}}>还原本次参数</button>
   <p className="sgm-hint">紫色为原空间参考，青色为有限曲折弦，黑色为纸边。缩放、拖动和视角只改变查看方式。</p>
  </aside><main data-preview-current={!!current} data-source-key={current?.key} data-source-unit-mm={current?.recipe.unitSizeMm}>
   <div className="sgm-plots paired gsp-plots"><div className="gsp-cp-pane" data-current={!!current}>{prepared?<CPConstructionPlot label="可采用有限弦 CP" doc={prepared.doc}/>:<div className="sgm-empty">填写有效源参数后生成 CP</div>}</div><div className="gsp-space-pane" data-current={!!current}>{reference?<CPConstructionPlot label="原空间带投影（参考）" doc={reference} axes={['X′','Y′']}/>:<div className="sgm-empty">等待原空间曲折…</div>}</div></div>
   <div className="gsp-metrics" data-current={!!current}>{prepared&&topology?.ok?<><span>{topology.graph.vertices_coords.length} 顶点</span><span>{prepared.doc.segments.length} 条边</span><span>{topology.graph.faces_vertices?.length??0} 纸面</span><span>{prepared.doc.segments.filter(s=>s.assignment==='U').length} 条待赋型曲折</span>{ghost&&<strong>上次有效预览</strong>}</>:<span>原固定初值展开 · 未改变源坐标</span>}</div>
   <div className="sgm-state gsp-state" role={error?'alert':'status'} data-state={error?'error':current?'ready':'checking'}>{error||(current?'当前有限纸面通过单次覆盖与交叉检查，可以采用。':'正在进行原二维恢复与有限纸面检查…')}{ghost?' 当前显示上次有效构形，不能采用。':''}</div>
   <p className="gsp-scope">此 CP 为有限弦采样近似，曲折保留为 U／未赋型，采用后请设置山谷。原空间投影仅供参考，没有平折、层序或连续曲面等距认证。</p>
   <details className="gsp-source"><summary>原式与采用范围</summary><p>沿原 FoldSpaceCurve3D／NSpaceCurveFold3D 与 NFlattenFold2D 恢复完整源域，再按原二维采样生成有限纸张；原初值为 (1,0)、切向 (0,1)。只乘一次显式毫米单位，不移动端点、不缩放归一化网格、不把校验母线或三角当折痕。焦点、未完成域及自交不能采用；Γ 保留为原连续函数，未冒充有限弦目标角。</p></details>
  </main></div><footer><span>{current?`1 源单位 = ${current.recipe.unitSizeMm} mm`:'原纸面未变 · 仅当前有效参数可采用'}</span><button onClick={onClose}>取消</button><button className="primary" aria-label="采用空间曲折有限弦 CP" disabled={!current||!!error} onClick={()=>{if(!current||!input.recipe)return;try{setAdoptError('');const doc=current.build(input.recipe);if(!genericSpacePaperSourceMatches(doc))throw Error('当前纸面与原来源不一致，请重新生成。');if(onAdoptCP(doc))onClose();else setAdoptError('当前工程尚未接受纸面，可以继续调整或取消。');}catch(e){setAdoptError((e as Error).message);}}}>采用有限弦 CP →</button></footer>
 </dialog>;
}
