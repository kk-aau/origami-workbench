import {useMemo,useRef,useState} from 'react';
import type {Doc} from '../core/types';
import {inspectMaterialTopology} from '../core/materialTopology';
import {inspectMaterialCurveModel} from '../core/materialCurveModel';
import {editMaterialFaces,type MaterialFaceEditIntent} from '../core/materialFaceEdit';
import type {MaterialClipboardCutIntent} from '../app/materialClipboard';
import {TessDialog} from './TessellationEditor';
import MaterialTopologyPlot from './MaterialTopologyPlot';
export default function MaterialClipboardCutDialog({doc,selected,group,lockBoundary=false,onApply,onClose}:{doc:Doc;selected:Set<string>;group?:string;lockBoundary?:boolean;onApply:(doc:Doc,intent:MaterialFaceEditIntent,ids:Set<string>)=>boolean;onClose:()=>void}){
 const original=useRef(doc),checked=useMemo(()=>group?inspectMaterialCurveModel(doc):null,[]),index=checked?.ok?checked.model.groups.findIndex(g=>g.id===group):-1,saved=index>=0&&checked?.ok?checked.model.groups[index].recipe:null,recipe=saved?.kind==='material-clipboard-cut'?saved:null,sourceDoc=index>=0&&checked?.ok?checked.stages[index]:doc,source=useMemo(()=>inspectMaterialTopology(sourceDoc),[]),chosen=new Set(recipe?.segmentIds??selected),proof=useRef<MaterialFaceEditIntent|null>(null);
 const [components,setComponents]=useState<number[]>(()=>source.ok?source.components.flatMap((c,i)=>c.edges.every(e=>chosen.has(source.edgeSegmentIds[e]))?[i]:[]):[]),[protect,setProtect]=useState(recipe?.lockBoundary??lockBoundary),[record,setRecord]=useState(true),[preview,setPreview]=useState<ReturnType<typeof editMaterialFaces>|null>(null),[error,setError]=useState('');
 const auxiliaries=sourceDoc.segments.filter(s=>s.assignment==='A'&&chosen.has(s.id)).map(s=>s.id),invalidate=()=>{setPreview(null);proof.current=null;setError('');};
 if(doc!==original.current||group&&!recipe||!source.ok)return <TessDialog title="剪切材料部件" onClose={onClose}><p role="alert">{!source.ok?source.reason:'工程或参数组已变化，请重新打开。'}</p></TessDialog>;
 const ids=[...components.flatMap(i=>source.components[i].edges.map(e=>source.edgeSegmentIds[e])),...auxiliaries],request=():MaterialFaceEditIntent=>{const r:MaterialClipboardCutIntent={kind:'material-clipboard-cut',segmentIds:ids,lockBoundary:protect};return group?{kind:'material-curve-group-edit',group,recipe:r}:{...r,parametric:record};};
 const calculate=()=>{try{const intent=request();setPreview(editMaterialFaces(doc,intent));proof.current=structuredClone(intent);setError('');}catch(e){invalidate();setError((e as Error).message);}},after=preview?inspectMaterialTopology(preview.doc):null,graph=after?.ok?after.graph:source.graph;
 return <TessDialog title="剪切材料部件" onClose={onClose} className="material-face-dialog material-copy-dialog">
  <p className="note">按完整材料部件剪切，保留其余部件位置。保存参数后可更改选择或删除此组恢复材料。{group?'编辑历史不替换当前剪贴板。':'采用后放入工作台剪贴板，可跨工程粘贴。'}</p>
  <MaterialTopologyPlot graph={graph} first={!preview?components.flatMap(i=>source.components[i].edges):[]} navigation fitWide label="剪切材料展开预览，坐标单位毫米"/>
  <div className="material-cut-list"><table><tbody>{source.components.map((c,i)=><tr key={i}><td><label><input aria-label={`剪切部件 ${i+1}`} type="checkbox" checked={components.includes(i)} onChange={()=>{setComponents(old=>old.includes(i)?old.filter(v=>v!==i):[...old,i].sort((a,b)=>a-b));invalidate();}}/>部件 {i+1}</label></td><td>{c.faces.length} 面 · {c.edges.length} 边</td></tr>)}</tbody></table></div>
  <label><input aria-label="剪切保护边界" type="checkbox" checked={protect} onChange={e=>{setProtect(e.target.checked);invalidate();}}/>保护边界（开启时不允许剪切完整材料）</label>
  {!group?<label><input aria-label="剪切保存参数" type="checkbox" checked={record} onChange={e=>{setRecord(e.target.checked);invalidate();}}/>保存参数组</label>:<span>修改此组并重算后续构造</span>}
  {preview&&<p role="status">移除 {preview.clipboardCut!.removedIds.length} 条线；{preview.clipboardCut!.empty?`全部材料已移除${group||record?'，参数历史保留':''}；图中为剪切前轮廓`:`剩余 ${preview.facesAfter} 个材料面`}。</p>}{error&&<p role="alert">{error}</p>}
  <footer><button onClick={onClose}>取消</button><button disabled={!components.length} onClick={calculate}>预览材料剪切</button><button className="primary" disabled={!preview} onClick={()=>{const intent=request();if(!preview||!proof.current||JSON.stringify(intent)!==JSON.stringify(proof.current)){invalidate();setError('输入已变化，请重新预览。');return;}if(onApply(preview.doc,intent,new Set()))onClose();else{invalidate();setError('工程或预览已变化，请重新预览。');}}}>应用材料剪切</button></footer>
 </TessDialog>;
}
