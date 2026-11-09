import {useMemo,useRef,useState} from 'react';
import type {Doc} from '../core/types';
import {inspectMaterialTopology} from '../core/materialTopology';
import {inspectMaterialCurveModel} from '../core/materialCurveModel';
import {editMaterialFaces,type MaterialFaceEditIntent} from '../core/materialFaceEdit';
import {resolveStartingFace} from '../app/flatFoldSettings';
import {materialViewFrame} from '../app/materialFrame';
import {TessDialog} from './TessellationEditor';
import MaterialTopologyPlot from './MaterialTopologyPlot';

export default function MaterialReferenceFaceDialog({doc,group,onApply,onClose}:{doc:Doc;group?:string;onApply:(doc:Doc,intent:MaterialFaceEditIntent,ids:Set<string>)=>boolean;onClose:()=>void}){
 const original=useRef(doc),checked=useMemo(()=>group?inspectMaterialCurveModel(doc):null,[]),index=checked?.ok?checked.model.groups.findIndex(g=>g.id===group):-1,saved=index>=0&&checked?.ok?checked.model.groups[index].recipe:null,recipe=saved?.kind==='material-reference-face'?saved:null,sourceDoc=index>=0&&checked?.ok?checked.stages[index]:doc,source=useMemo(()=>inspectMaterialTopology(sourceDoc),[]),initial=source.ok?resolveStartingFace(sourceDoc,source.graph):null,proof=useRef<MaterialFaceEditIntent|null>(null);
 const [face,setFace]=useState(recipe?.face??(initial?.stale?source.ok?source.startingFace??0:0:initial?.face??0)),[defaultFace,setDefaultFace]=useState(recipe?.face===null),[record,setRecord]=useState(true),[view,setView]=useState<'cp'|'ff'>('cp'),[preview,setPreview]=useState<ReturnType<typeof editMaterialFaces>|null>(null),[error,setError]=useState('');
 const invalidate=()=>{setPreview(null);proof.current=null;setError('');};
 if(doc!==original.current||group&&!recipe||!source.ok)return <TessDialog title="材料参考面" onClose={onClose}><p role="alert">{!source.ok?source.reason:'工程或参数组已变化，请重新打开。'}</p></TessDialog>;
 const request=():MaterialFaceEditIntent=>{const raw={kind:'material-reference-face' as const,face:defaultFace?null:face};return group?{kind:'material-curve-group-edit',group,recipe:raw}:{...raw,parametric:record};},calculate=()=>{try{const intent=request();setPreview(editMaterialFaces(doc,intent));proof.current=structuredClone(intent);setError('');}catch(e){invalidate();setError((e as Error).message);}},m=inspectMaterialTopology(preview?.doc??sourceDoc),display=m.ok?m:source,current=resolveStartingFace(preview?.doc??sourceDoc,display.graph),canFF=!!display.foldedVertices&&!current.stale&&(!preview||m.ok),frame=view==='ff'&&canFF?materialViewFrame(preview?.doc??sourceDoc):null,graph=frame?{...display.graph,vertices_coords:display.foldedVertices!.map(frame.toView)}:display.graph;
 return <TessDialog title="材料参考面" onClose={onClose} className="material-face-dialog material-reference-dialog">
  <p className="note">点击纸面或选择面编号，设置平折查看的基准。保存后随前面的构造重算；折痕和已保存的折后坐标保持。</p>
  <div className="material-face-toolbar"><button aria-pressed={view==='cp'} onClick={()=>setView('cp')}>CP预览</button><button disabled={!canFF} aria-pressed={view==='ff'&&canFF} onClick={()=>setView('ff')}>FF预览</button><span>{source.graph.faces_vertices!.length} 个纸面</span></div>
  {preview&&!m.ok?<div className="material-cut-plot" role="status">后续构造结果为空，参考面参数历史仍保留。</div>:<MaterialTopologyPlot graph={graph} face={preview&&!current.stale?current.face:defaultFace?source.startingFace??0:face} navigation fitWide label="材料参考面预览，坐标单位毫米" onFacePick={!preview&&view==='cp'?f=>{setFace(f);setDefaultFace(false);invalidate();}:undefined}/>}
  <div className="material-reference-controls"><label>参考面<select aria-label="材料参考面编号" value={face} disabled={defaultFace} onChange={e=>{setFace(Number(e.target.value));invalidate();}}>{source.graph.faces_vertices!.map((_,f)=><option key={f} value={f}>F{f+1}{f===(source.startingFace??0)?' · 默认':''}</option>)}</select></label><label><input aria-label="材料参考面恢复默认" type="checkbox" checked={defaultFace} onChange={e=>{setDefaultFace(e.target.checked);invalidate();}}/>恢复默认基准</label>{!group?<label><input aria-label="材料参考面保存参数" type="checkbox" checked={record} onChange={e=>{setRecord(e.target.checked);invalidate();}}/>保存参数组</label>:<span>修改此组并重算后续构造</span>}</div>
  <div className="material-reference-feedback">{preview&&<p role="status">{!m.ok?'后续构造已移除材料':`当前参考面 F${current.face+1}；${canFF?'保留原折后坐标，可查看FF':'无FF，仍可保存CP'}。`}</p>}{error&&<p role="alert">{error}</p>}</div>
  <footer><button onClick={onClose}>取消</button><button onClick={calculate}>预览参考面</button><button className="primary" disabled={!preview} onClick={()=>{const intent=request();if(!preview||!proof.current||JSON.stringify(intent)!==JSON.stringify(proof.current)){invalidate();setError('输入已变化，请重新预览。');return;}if(onApply(preview.doc,intent,new Set()))onClose();else{invalidate();setError('工程或预览已变化，请重新预览。');}}}>应用参考面</button></footer>
 </TessDialog>;
}
