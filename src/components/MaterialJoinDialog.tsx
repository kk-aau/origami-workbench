import {useMemo,useRef,useState} from 'react';
import type {Doc} from '../core/types';
import {inspectMaterialTopology} from '../core/materialTopology';
import {joinMaterialEdges,type MaterialJoinIntent,type MaterialJoinPair,type MaterialJoinResult} from '../core/materialJoin';
import {inspectMaterialCurveModel,type MaterialCurveModelIntent} from '../core/materialCurveModel';
import {editMaterialFaces} from '../core/materialFaceEdit';
import {TessDialog} from './TessellationEditor';
import MaterialTopologyPlot from './MaterialTopologyPlot';
import {materialFaceRings,materialFaceEdgeRings} from '../core/materialRings';

export default function MaterialJoinDialog({doc,selected,group,onApply,onClose}:{doc:Doc;group?:string;selected:Set<string>;onApply:(doc:Doc,intent:MaterialJoinIntent|MaterialCurveModelIntent,ids:Set<string>)=>boolean;onClose:()=>void}){
 const original=useRef(doc),checked=useMemo(()=>group||Object.hasOwn(doc.metadata??{},'materialCurveModel')?inspectMaterialCurveModel(doc):null,[]),index=checked?.ok?checked.model.groups.findIndex(g=>g.id===group):-1,saved=index>=0&&checked?.ok?checked.model.groups[index].recipe:null,recipe=saved?.kind==='material-join'?saved:null,sourceDoc=index>=0&&checked?.ok?checked.stages[index]:doc,material=useMemo(()=>inspectMaterialTopology(sourceDoc),[]),[record,setRecord]=useState(true);
 const boundaries=material.ok?material.edgeSegmentIds.filter((_,e)=>material.graph.edges_assignment[e]==='B'):[];
 const [pairs,setPairs]=useState<MaterialJoinPair[]>(()=>{if(recipe)return structuredClone([...recipe.pairs]);const ids=boundaries.filter(id=>selected.has(id));return [{first:ids.length===2?ids[0]:'',second:ids.length===2?ids[1]:'',assignment:'F'}];});
 const [preview,setPreview]=useState<MaterialJoinResult|null>(null),[error,setError]=useState('');
 const change=(rows:MaterialJoinPair[])=>{setPairs(rows);setPreview(null);setError('');};
 const request=():MaterialJoinIntent|MaterialCurveModelIntent=>group?{kind:'material-curve-group-edit',group,recipe:{kind:'material-join',pairs}}:{kind:'material-join',pairs,parametric:record};
 const calculate=()=>{try{const intent=request();if(intent.kind==='material-join')setPreview(joinMaterialEdges(doc,intent));else{const r=editMaterialFaces(doc,intent);setPreview({doc:r.doc,descendants:r.descendants,...r.join!});}setError('');}catch(e){setPreview(null);setError(e instanceof Error?e.message:String(e));}};
 if(doc!==original.current||group&&!recipe)return <TessDialog title="粘合材料边界" onClose={onClose}><p role="alert">{checked&&!checked.ok?checked.reason:'工程已变化或粘合参数组不存在。'}</p></TessDialog>;
 if(!material.ok)return <TessDialog title="粘合材料边界" onClose={onClose}><p role="alert">{material.reason}</p></TessDialog>;
 const graph=material.graph,edgeIndex=new Map(material.edgeSegmentIds.map((id,e)=>[id,e]));
 const oriented=(id:string)=>{const e=edgeIndex.get(id)!;if(e===undefined)return null;const f=graph.edges_faces![e][0],rings=materialFaceRings(graph,f),h=materialFaceEdgeRings(graph,f).findIndex(r=>r.includes(e));if(h<0)return null;const k=materialFaceEdgeRings(graph,f)[h].indexOf(e),ring=rings[h];return [graph.vertices_coords[ring[k]],graph.vertices_coords[ring[(k+1)%ring.length]]] as const;};
 const matches=(a:string,b:string)=>{const p=oriented(a),q=oriented(b);return a!==b&&p&&q&&p[0][0]===q[1][0]&&p[0][1]===q[1][1]&&p[1][0]===q[0][0]&&p[1][1]===q[0][1];};
 const name=(id:string)=>{const e=edgeIndex.get(id)!;return `E${e+1} · F${graph.edges_faces![e][0]+1} · ${id}`;};
 const first=pairs.flatMap(p=>edgeIndex.has(p.first)?[edgeIndex.get(p.first)!]:[]),second=pairs.flatMap(p=>edgeIndex.has(p.second)?[edgeIndex.get(p.second)!]:[]);
 return <TessDialog title="粘合材料边界" onClose={onClose} className="material-face-dialog material-topology-dialog material-join-parameters">
  <p className="note">紫色为第一侧，青色虚线为第二侧。只粘合明确选择、CP端点完全重合且方向相反的两侧，不移动或吸附端点；保留第一侧ID与显示色。改变连接线型可能重算折后位置，原固定面保持锚姿。{!group&&record&&checked&&!checked.ok?' 旧配方保留归档，以当前材料为新基底。':''}</p>
  <MaterialTopologyPlot graph={graph} first={first} second={second} label="材料粘合预览，坐标单位毫米"/>
  <div className="material-cut-list" aria-label="材料粘合配对"><table><thead><tr><th>第一侧</th><th>第二侧</th><th>连接线型</th><th/></tr></thead><tbody>{pairs.map((pair,i)=><tr key={i}>
   <td><select aria-label={`粘合 ${i+1} 第一侧`} value={pair.first} onChange={e=>change(pairs.map((p,k)=>k===i?{...p,first:e.target.value,second:''}:p))}><option value="" disabled>选择边界…</option>{boundaries.map(id=><option key={id} value={id}>{name(id)}</option>)}</select></td>
   <td><select aria-label={`粘合 ${i+1} 第二侧`} value={pair.second} onChange={e=>change(pairs.map((p,k)=>k===i?{...p,second:e.target.value}:p))}><option value="" disabled>选择重合的另一侧…</option>{boundaries.filter(id=>matches(pair.first,id)).map(id=><option key={id} value={id}>{name(id)}</option>)}</select></td>
   <td><select aria-label={`粘合 ${i+1} 连接线型`} value={pair.assignment} onChange={e=>change(pairs.map((p,k)=>k===i?{...p,assignment:e.target.value as MaterialJoinPair['assignment']}:p))}><option value="F">平面 F</option><option value="M">山折 M</option><option value="V">谷折 V</option><option value="U">未指定 U</option></select></td>
   <td><button aria-label={`删除粘合 ${i+1}`} disabled={pairs.length===1} onClick={()=>change(pairs.filter((_,k)=>k!==i))}>×</button></td>
  </tr>)}</tbody></table></div>
  <button className="text-button" disabled={pairs.length>=256} onClick={()=>change([...pairs,{first:'',second:'',assignment:'F'}])}>增加粘合对</button>
  {preview&&<p role="status">粘合 {preview.joinedPairs} 对边界，材料部件 {preview.componentsBefore} → {preview.componentsAfter}；CP坐标保持原值，{preview.placement==='preserved'?'折后位置保留':preview.placement==='recomputed'?'折后位置已按固定面重算':'缺少原折后位置，未生成新位置'}。</p>}
  {!group?<label><input type="checkbox" aria-label="粘合保存参数" checked={record} onChange={e=>{setRecord(e.target.checked);setPreview(null);setError('');}}/>保存参数组</label>:<span>修改此组并重算后续构造</span>}
  {error&&<p role="alert">{error}</p>}
  <footer><button onClick={onClose}>取消</button><button disabled={pairs.some(p=>!p.first||!p.second)} onClick={calculate}>预览粘合</button><button className="primary" disabled={!preview} onClick={()=>{if(!preview)return;const intent=request();const ids=new Set(pairs.flatMap(p=>preview.descendants.get(p.first)??[]));if(onApply(preview.doc,intent,ids))onClose();else{setPreview(null);setError('工程或预览已变化，请重新预览后应用。');}}}>应用材料粘合</button></footer>
 </TessDialog>;
}
