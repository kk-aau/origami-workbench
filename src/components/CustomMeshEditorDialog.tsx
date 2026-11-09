import {useMemo,useRef,useState} from 'react';
import type {XY} from '../app/tessellation';
import {addCustomDraftPoint,addOrderedCustomDraftFace,connectCustomDraftPoints,customDraftEdgeFaces,customDraftTemporaryEdgeCount,customMeshDraftFromParams,customMeshParamsFromDraft,moveCustomDraftPoint,removeCustomDraftEdge,removeCustomDraftFace,removeCustomDraftPoint,type CustomMeshDraft,type CustomMeshParams} from '../app/customMeshDraft';
import {TessDialog} from './TessellationEditor';
import WovenGraphCanvas from './WovenGraphCanvas';
import './WovenGraphDialog.css';
import './CustomMeshEditorDialog.css';

export type CustomMeshEditorDialogProps={initial:CustomMeshParams;onApply:(params:CustomMeshParams)=>void|boolean;onClose:()=>void};
type Tool='move'|'add'|'connect'|'face';
type Snapshot={draft:CustomMeshDraft;vertex:number;edge:number;face:number};
const copy=<T,>(v:T):T=>structuredClone(v),numberText=(n:number)=>Object.is(n,-0)?'-0':String(n);
/** Local source draft only. Applying parameters still requires the existing backend CP checks. */
export default function CustomMeshEditorDialog({initial,onApply,onClose}:CustomMeshEditorDialogProps){
 const baseline=useRef(customMeshDraftFromParams(initial)).current;
 const [draft,setDraft]=useState<CustomMeshDraft>(()=>copy(baseline)),[vertex,setVertex]=useState(0),[edge,setEdge]=useState(-1),[face,setFace]=useState(0);
 const [tool,setTool]=useState<Tool>('move'),[pending,setPending]=useState<number[]>([]),[connectStart,setConnectStart]=useState<number|null>(null),[numbers,setNumbers]=useState(true),[error,setError]=useState('');
 const [coordinates,setCoordinates]=useState<[string,string]>(()=>baseline.vertices[0].map(numberText) as [string,string]),[coordinateDirty,setCoordinateDirty]=useState(false);
 const [past,setPast]=useState<Snapshot[]>([]),[future,setFuture]=useState<Snapshot[]>([]),[focus,setFocus]=useState<{key:number;vertices:number[]}>();
 const current=useRef<Snapshot>({draft,vertex,edge,face});current.current={draft,vertex,edge,face};
 const drag=useRef<Snapshot|null>(null);
 const parsed=useMemo(()=>{try{return {params:customMeshParamsFromDraft(initial,draft),problem:''};}catch(e){return {params:null,problem:e instanceof Error?e.message:String(e)};}},[draft,initial]);
 const temporary=customDraftTemporaryEdgeCount(draft),owners=customDraftEdgeFaces(draft,edge);
 const syncPoint=(d:CustomMeshDraft,v:number)=>{setCoordinates(d.vertices[v]?.map(numberText) as [string,string]??['','']);setCoordinateDirty(false);};
 const checkpoint=(s=current.current)=>{setPast(p=>[...p.slice(-49),copy(s)]);setFuture([]);};
 const update=(next:CustomMeshDraft,v=vertex,e=edge,f=face,record=true)=>{if(record)checkpoint();const vv=Math.max(0,Math.min(v,next.vertices.length-1)),ee=e<next.edges.length?e:-1,ff=Math.max(0,Math.min(f,next.faces.length-1));current.current={draft:next,vertex:vv,edge:ee,face:ff};setDraft(next);setVertex(vv);setEdge(ee);setFace(ff);syncPoint(next,vv);setError('');};
 const run=(action:()=>void)=>{if(coordinateDirty){setError('请先按 Enter 提交或还原坐标草稿。');return;}try{action();}catch(e){setError(e instanceof Error?e.message:String(e));}};
 const pick=(v:number)=>run(()=>{setVertex(v);syncPoint(current.current.draft,v);setError('');if(tool==='connect'){if(connectStart===null)setConnectStart(v);else{update(connectCustomDraftPoints(current.current.draft,connectStart,v),v);setConnectStart(null);}}else if(tool==='face'){if(pending.includes(v)){setError('面环中的点不可重复；用“完成有序面”闭合。');return;}if(pending.length>=24){setError('每面最多24点。');return;}setPending(p=>[...p,v]);}});
 const switchTool=(next:Tool)=>run(()=>{setTool(next);setConnectStart(null);});
 const coordinate=(axis:0|1,text:string)=>{setCoordinates(c=>c.map((v,i)=>i===axis?text:v) as [string,string]);setCoordinateDirty(true);setError('');};
 const commitCoordinates=()=>{if(!coordinateDirty)return;const p=coordinates.map(v=>v.trim()?Number(v):NaN) as XY;if(p.some(v=>!Number.isFinite(v))){setError('坐标须为两个有限数值；没有使用旧值或默认值。');return;}try{update(moveCustomDraftPoint(current.current.draft,vertex,p));}catch(e){setError(String(e));}};
 const undo=(redo=false)=>{const list=redo?future:past;if(!list.length)return;const next=copy(list[list.length-1]),now=copy(current.current);if(redo){setFuture(list.slice(0,-1));setPast(p=>[...p,now]);}else{setPast(list.slice(0,-1));setFuture(p=>[...p,now]);}update(next.draft,next.vertex,next.edge,next.face,false);setPending([]);setConnectStart(null);};
 const finishDrag=(cancel:boolean)=>{const before=drag.current;drag.current=null;if(!before)return;if(cancel)update(before.draft,before.vertex,before.edge,before.face,false);else if(JSON.stringify(before.draft)!==JSON.stringify(current.current.draft))checkpoint(before);};
 const apply=()=>{if(coordinateDirty||pending.length||!parsed.params)return;try{if(onApply(copy(parsed.params))===false){setError('主工作区未接受源参数；草稿仍保留。');return;}onClose();}catch(e){setError(e instanceof Error?e.message:String(e));}};
 const problem=coordinateDirty?'坐标正在编辑；按 Enter 提交后才能应用。':pending.length?'面环正在编辑；完成有序面或取消此面环后才能应用。':parsed.problem;
 return <TessDialog title="编辑自定义母网源" className="custom-mesh-modal" onClose={onClose}><div className="custom-mesh-editor" data-testid="custom-mesh-editor" data-source-state={problem?'draft-invalid':'structure-ready'}>
  <div className="custom-mesh-toolbar" role="toolbar" aria-label="母网源编辑工具">
   {([['move','移动点'],['add','新增点'],['connect','连接两点'],['face','有序建面']] as [Tool,string][]).map(([t,label])=><button key={t} aria-pressed={tool===t} onClick={()=>switchTool(t)}>{label}</button>)}
   <button disabled={!past.length} onClick={()=>undo()}>撤销</button><button disabled={!future.length} onClick={()=>undo(true)}>重做</button>
   <label><input type="checkbox" checked={numbers} onChange={e=>setNumbers(e.target.checked)}/>点边编号</label><span>黑色现有源 · 紫色草稿 · 青色选中</span>
  </div>
  <div className="custom-mesh-body">
   <div className="custom-mesh-canvas" data-testid="custom-mesh-source-plot"><WovenGraphCanvas points={draft.vertices} edges={draft.edges} baseline={baseline} label="自定义母网源坐标编辑图" numbers={numbers} editable tool={tool==='face'?'connect':tool} minimumLabelPixels={12.1} selectedVertex={vertex} selectedEdge={edge} face={draft.faces[face]} focus={focus}
    onEdgePick={e=>run(()=>{setEdge(e);setError('');})} onVertexPick={pick}
    onVertexStart={()=>{if(!coordinateDirty)drag.current=copy(current.current);}}
    onVertexMove={(v,p)=>{if(!coordinateDirty)try{update(moveCustomDraftPoint(current.current.draft,v,p),v,edge,face,false);}catch(e){setError(String(e));}}}
    onVertexEnd={finishDrag} onAddPoint={p=>run(()=>update(addCustomDraftPoint(current.current.draft,p),current.current.draft.vertices.length))}/></div>
   <aside className="custom-mesh-inspector">
    <section><h3>源点坐标</h3><label>选择源点<select aria-label="选择源点" value={vertex} onChange={e=>pick(Number(e.target.value))}>{draft.vertices.map((_,v)=><option key={v} value={v}>点 {v}</option>)}</select></label>
     {([0,1] as const).map(axis=><label key={axis}>源点 {axis?'Y':'X'}<input aria-label={`源点 ${axis?'Y':'X'}`} type="text" inputMode="decimal" value={coordinates[axis]} aria-invalid={coordinateDirty&&(!coordinates[axis].trim()||!Number.isFinite(Number(coordinates[axis])))} onChange={e=>coordinate(axis,e.target.value)} onBlur={commitCoordinates} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commitCoordinates();}if(e.key==='Escape'){e.preventDefault();syncPoint(draft,vertex);setError('');}}}/></label>)}
     <button onClick={()=>run(()=>update(removeCustomDraftPoint(current.current.draft,vertex),Math.max(0,vertex-1)))}>删除未引用点</button><p>源坐标 −10…10。拖动不裁剪；Enter 提交精确数值。</p></section>
    <section><h3>草图连线</h3><label>选择源边<select aria-label="选择源边" value={edge} onChange={e=>run(()=>setEdge(Number(e.target.value)))}><option value={-1}>未选择</option>{draft.edges.map(([a,b],e)=><option key={e} value={e}>E{e} · {a} → {b}</option>)}</select></label>
     <button disabled={edge<0||owners.length>0} onClick={()=>run(()=>update(removeCustomDraftEdge(current.current.draft,edge),vertex,-1))}>删除临时连线</button>
     <p>{connectStart===null?'连接两点：依次点击端点。':`已选点 ${connectStart}，点击另一端。`}</p><p>面内边须先明确删面。临时连线 {temporary} 条，只作草图，不保存。</p></section>
    <section><h3>有序面环</h3><label>选择源面<select aria-label="选择源面" value={draft.faces.length?face:-1} onChange={e=>run(()=>{setFace(Number(e.target.value));setError('');})}>{!draft.faces.length&&<option value={-1}>尚无面</option>}{draft.faces.map((f,i)=><option key={i} value={i}>面 {i} · {f.join(' → ')}</option>)}</select></label>
     <div className="custom-mesh-face-actions"><button disabled={!draft.faces.length} onClick={()=>run(()=>update(removeCustomDraftFace(current.current.draft,face),vertex,edge,Math.max(0,face-1)))}>删除此面</button><button disabled={!draft.faces.length} onClick={()=>setFocus({key:(focus?.key??0)+1,vertices:draft.faces[face]})}>查看此面</button></div>
     <output data-testid="custom-mesh-face-order">{pending.length?pending.join(' → '):'选择“有序建面”，按轮廓顺序点击点。'}</output>
     <button disabled={pending.length<3} onClick={()=>run(()=>{update(addOrderedCustomDraftFace(current.current.draft,pending),vertex,edge,current.current.draft.faces.length);setPending([]);})}>完成有序面并建立轮廓边</button>
     <div className="custom-mesh-face-actions"><button disabled={!pending.length} onClick={()=>setPending(p=>p.slice(0,-1))}>撤回末点</button><button disabled={!pending.length} onClick={()=>{setPending([]);setError('');}}>取消此面环</button></div><p>不从闭合连线猜面；保存采用上述编号顺序。</p></section>
   </aside>
  </div>
  <div className={`custom-mesh-status${error||problem?' error':''}`} role="status" data-testid="custom-mesh-source-status">{error||problem||`源结构可应用：${draft.vertices.length} 点 / ${draft.edges.length} 草图边 / ${draft.faces.length} 面。仍须后台检查非重叠、纸域与 CP。`}</div>
  <footer><span>修改源后按原规则清除过期逐面来源；凹面使用平铺输出。此图尚非生成 CP。</span><button onClick={()=>{update(copy(baseline),0,-1,0);setPending([]);setConnectStart(null);}}>还原本次修改</button><button onClick={onClose}>取消</button><button className="primary" disabled={!!problem||!parsed.params} onClick={apply}>应用母网源参数</button></footer>
 </div></TessDialog>;
}
