import {useMemo,useRef,useState} from 'react';
import type {Doc} from '../core/types';
import {inspectMaterialTopology} from '../core/materialTopology';
import {cutMaterialEdges,type MaterialCutIntent,type MaterialCutResult} from '../core/materialCut';
import {inspectMaterialCurveModel,type MaterialCurveModelIntent} from '../core/materialCurveModel';
import {editMaterialFaces} from '../core/materialFaceEdit';
import MaterialTopologyPlot from './MaterialTopologyPlot';
import {TessDialog} from './TessellationEditor';
import './materialCutDialog.css';

export default function MaterialCutDialog({doc,selected,group,onApply,onClose}:{doc:Doc;group?:string;selected:Set<string>;onApply:(doc:Doc,intent:MaterialCutIntent|MaterialCurveModelIntent,ids:Set<string>)=>boolean;onClose:()=>void}){
 const original=useRef(doc),checked=useMemo(()=>group||Object.hasOwn(doc.metadata??{},'materialCurveModel')?inspectMaterialCurveModel(doc):null,[]),index=checked?.ok?checked.model.groups.findIndex(g=>g.id===group):-1,saved=index>=0&&checked?.ok?checked.model.groups[index].recipe:null,recipe=saved?.kind==='material-cut'?saved:null,sourceDoc=index>=0&&checked?.ok?checked.stages[index]:doc,material=useMemo(()=>inspectMaterialTopology(sourceDoc),[]),[record,setRecord]=useState(true);
 const eligible=material.ok?material.edgeSegmentIds.filter((_,e)=>material.graph.edges_assignment[e]!=='B'):[];
 const [ids,setIDs]=useState(()=>new Set(eligible.filter(id=>recipe?recipe.segmentIds.includes(id):selected.has(id)))),[preview,setPreview]=useState<MaterialCutResult|null>(null),[error,setError]=useState('');
 const change=(id:string)=>{setIDs(old=>{const next=new Set(old);next.has(id)?next.delete(id):next.add(id);return next;});setPreview(null);setError('');};
 const rawIntent=():MaterialCutIntent=>({kind:'material-cut',segmentIds:eligible.filter(id=>ids.has(id))});
 const intent=():MaterialCutIntent|MaterialCurveModelIntent=>group?{kind:'material-curve-group-edit',group,recipe:rawIntent()}:{...rawIntent(),parametric:record};
 const calculate=()=>{try{const request=intent();if(request.kind==='material-cut')setPreview(cutMaterialEdges(doc,request));else{const r=editMaterialFaces(doc,request);setPreview({doc:r.doc,descendants:r.descendants,...r.cut!});}setError('');}catch(e){setPreview(null);setError(e instanceof Error?e.message:String(e));}};
 if(doc!==original.current||group&&!recipe)return <TessDialog title="切开材料折痕" onClose={onClose}><p role="alert">{checked&&!checked.ok?checked.reason:'工程已变化或切开参数组不存在。'}</p></TessDialog>;
 if(!material.ok)return <TessDialog title="切开材料折痕" onClose={onClose}><p role="alert">{material.reason}</p></TessDialog>;
 const graph=material.graph;
 return <TessDialog title="切开材料折痕" onClose={onClose} className="material-face-dialog material-topology-dialog material-cut-parameters">
  <p className="note">按材料边编号选择；青色为待切边。应用后生成两侧独立边界，坐标与已有折后位置保持不变，可撤销。{!group&&record&&checked&&!checked.ok?' 旧配方保留归档，以当前材料为新基底。':''}</p>
  <MaterialTopologyPlot graph={graph} cut={material.edgeSegmentIds.flatMap((id,e)=>ids.has(id)?[e]:[])} onPick={e=>change(material.edgeSegmentIds[e])} label="材料切口预览，坐标单位毫米"/>
  <div className="material-cut-list" aria-label="可切开的材料内边"><table><thead><tr><th>选择</th><th>内边</th><th>两侧面</th><th>长度 mm</th></tr></thead><tbody>{material.edgeSegmentIds.flatMap((id,e)=>graph.edges_assignment[e]==='B'?[]:[<tr key={id}><td><input type="checkbox" id={`material-cut-${e}`} aria-label={`切开内边 E${e+1}`} checked={ids.has(id)} onChange={()=>change(id)}/></td><td><label htmlFor={`material-cut-${e}`}>E{e+1} · {graph.edges_assignment[e]}</label></td><td>{graph.edges_faces![e].map(f=>`F${f+1}`).join(' / ')}</td><td>{Math.hypot(graph.vertices_coords[graph.edges_vertices[e][0]][0]-graph.vertices_coords[graph.edges_vertices[e][1]][0],graph.vertices_coords[graph.edges_vertices[e][0]][1]-graph.vertices_coords[graph.edges_vertices[e][1]][1]).toPrecision(6)}</td></tr>])}</tbody></table>{!eligible.length&&<p>当前材料没有可切开的内部折痕。</p>}</div>
  {preview&&<p role="status">切开 {preview.cutEdges} 条内边，材料部件 {preview.componentsBefore} → {preview.componentsAfter}，新增 {preview.addedVertices} 个独立顶点；坐标保持原值。</p>}
  {!group?<label><input type="checkbox" aria-label="切开保存参数" checked={record} onChange={e=>{setRecord(e.target.checked);setPreview(null);setError('');}}/>保存参数组</label>:<span>修改此组并重算后续构造</span>}
  {error&&<p role="alert">{error}</p>}
  <footer><button onClick={onClose}>取消</button><button disabled={!ids.size} onClick={calculate}>预览切口</button><button className="primary" disabled={!preview} onClick={()=>{if(!preview)return;if(onApply(preview.doc,intent(),new Set([...ids].flatMap(id=>preview.descendants.get(id)??[]))))onClose();else{setPreview(null);setError('工程或预览已变化，请重新预览后应用。');}}}>应用材料切口</button></footer>
 </TessDialog>;
}
