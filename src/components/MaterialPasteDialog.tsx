import {useMemo,useRef,useState} from 'react';
import type {Doc,Point} from '../core/types';
import {hasMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import type {MaterialClipboard,MaterialPasteIntent} from '../app/materialClipboard';
import {inspectMaterialCurveModel} from '../core/materialCurveModel';
import {editMaterialFaces,type MaterialFaceEditIntent} from '../core/materialFaceEdit';
import {NumberField} from './Fields';
import {TessDialog} from './TessellationEditor';
import MaterialTopologyPlot from './MaterialTopologyPlot';
import {materialViewFrame} from '../app/materialFrame';

export default function MaterialPasteDialog({doc,clipboard:sessionClipboard,offset=[0,0],group,onApply,onClose}:{doc:Doc;clipboard?:MaterialClipboard;offset?:Point;group?:string;onApply:(doc:Doc,intent:MaterialFaceEditIntent,ids:Set<string>)=>boolean;onClose:()=>void}){
 const original=useRef(doc),checked=useMemo(()=>group?inspectMaterialCurveModel(doc):null,[]),index=checked?.ok?checked.model.groups.findIndex(g=>g.id===group):-1,saved=index>=0&&checked?.ok?checked.model.groups[index].recipe:null,recipe=saved?.kind==='material-clipboard-paste'?saved:null,sourceDoc=index>=0&&checked?.ok?checked.stages[index]:doc,clipboard=recipe?.clipboard??sessionClipboard,proof=useRef<MaterialFaceEditIntent|null>(null);
 const [dx,setDx]=useState(recipe?.offset[0]??offset[0]),[dy,setDy]=useState(recipe?.offset[1]??offset[1]),[cpOnly,setCpOnly]=useState(recipe?.cpOnly??false),[splitTarget,setSplitTarget]=useState(recipe?.splitTarget??false),[record,setRecord]=useState(true),[view,setView]=useState<'cp'|'ff'>('cp'),[preview,setPreview]=useState<ReturnType<typeof editMaterialFaces>|null>(null),[error,setError]=useState('');
 const controls=useRef<HTMLDivElement>(null),source=clipboard?inspectMaterialTopology(clipboard.doc):{ok:false as const,reason:'没有已保存的材料源快照。'},invalidate=()=>{setPreview(null);proof.current=null;setError('');};
 if(doc!==original.current||group&&!recipe)return <TessDialog title="粘贴材料部件" onClose={onClose}><p role="alert">工程或参数组已变化，请重新打开。</p></TessDialog>;
 if(!source.ok)return <TessDialog title="粘贴材料部件" onClose={onClose}><p role="alert">{source.reason}</p></TessDialog>;
 const request=():MaterialFaceEditIntent=>{const r:MaterialPasteIntent={kind:'material-clipboard-paste',clipboard:clipboard!,offset:[dx,dy],cpOnly,splitTarget};return group?{kind:'material-curve-group-edit',group,recipe:r}:{...r,parametric:record};};
 const calculate=()=>{const invalid=controls.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]');if(invalid){invalid.focus();setError('请先修正粘贴偏移。');return;}try{const intent=request();setPreview(editMaterialFaces(doc,intent));proof.current=structuredClone(intent);setError('');}catch(e){invalidate();setError(e instanceof Error?e.message:String(e));}};
 const result=preview?inspectMaterialTopology(preview.doc):null,display=result?.ok?result:source;
 const frame=materialViewFrame(result?.ok?preview!.doc:clipboard!.doc),base=view==='ff'&&display.foldedVertices?display.foldedVertices.map(frame.toView):display.graph.vertices_coords,coords=preview?base:base.map(([x,y]):Point=>[x+dx,y+dy]),graph={...display.graph,vertices_coords:coords},incoming=result?.ok?preview!.paste!.pastedIds.flatMap(id=>{const e=result.edgeSegmentIds.indexOf(id);return e<0?[]:[e];}):source.edgeSegmentIds.map((_,e)=>e),existing=result?.ok?result.edgeSegmentIds.flatMap((_,e)=>incoming.includes(e)?[]:[e]):[],stats=preview?.paste;
 return <TessDialog title="粘贴材料部件" onClose={onClose} className="material-face-dialog material-paste-dialog">
  <p className="note">紫色是目标材料，青色虚线是待粘贴部件；毫米偏移同时作用于CP和已有FF，不缩放或焊接。点击预览查看合并结果，取消不会改动工程。</p>
  <div className="material-face-toolbar"><button aria-pressed={view==='cp'} onClick={()=>setView('cp')}>展开 CP</button><button disabled={!display.foldedVertices||cpOnly} aria-pressed={view==='ff'} onClick={()=>setView('ff')}>折后 FF</button><span>{source.components.length} 个剪贴板部件 · {clipboard!.doc.segments.length} 条线 · mm</span></div>
  <MaterialTopologyPlot graph={graph} first={existing} second={incoming} navigation fitWide label={view==='cp'?'材料粘贴展开预览，坐标单位毫米':'材料粘贴折后预览，坐标单位毫米'}/>
  <div className="material-copy-controls" ref={controls}>
   <NumberField label="粘贴偏移 X" value={dx} min={-1e6} max={1e6} suffix="mm" preservePrecision onDraftChange={invalidate} onChange={n=>{setDx(n);invalidate();}}/>
   <NumberField label="粘贴偏移 Y" value={dy} min={-1e6} max={1e6} suffix="mm" preservePrecision onDraftChange={invalidate} onChange={n=>{setDy(n);invalidate();}}/>
  </div>
  <label className="note"><input type="checkbox" checked={cpOnly} onChange={e=>{setCpOnly(e.target.checked);setView('cp');invalidate();}}/>仅粘贴 CP（清除合并工程的折后位置）</label>
  {!hasMaterialTopology(sourceDoc)&&sourceDoc.segments.some(s=>s.assignment!=='A')&&<label className="note"><input type="checkbox" checked={splitTarget} onChange={e=>{setSplitTarget(e.target.checked);invalidate();}}/>允许按已有交点分段目标（保留原端点，不合并重复线）</label>}
  {!group?<label><input aria-label="粘贴保存参数" type="checkbox" checked={record} onChange={e=>{setRecord(e.target.checked);invalidate();}}/>保存参数组</label>:<span>使用已保存源快照，修改此组并重算后续构造</span>}
  {preview&&stats&&<p role="status">材料部件 {stats.componentsBefore} → {stats.componentsAfter}；{preview.placement==='preserved'?'保留已有FF，相同毫米偏移': '未保存FF，仍可编辑和导出CP'}{stats.derivedTargetFF?'；目标普通纸面已生成并校验FF':''}{stats.targetSegmentsAfter!==stats.targetSegmentsBefore?`；目标线段 ${stats.targetSegmentsBefore} → ${stats.targetSegmentsAfter}`:''}。</p>}
  {error&&<p role="alert">{error}</p>}
  <footer><button onClick={onClose}>取消</button><button onClick={calculate}>预览材料粘贴</button><button className="primary" disabled={!preview} onClick={()=>{const intent=request();if(!preview||!proof.current||JSON.stringify(intent)!==JSON.stringify(proof.current)){invalidate();setError('输入已变化，请重新预览。');return;}if(onApply(preview.doc,intent,new Set(preview.paste!.pastedIds)))onClose();else{invalidate();setError('工程或预览已变化，请重新预览。');}}}>应用材料粘贴</button></footer>
 </TessDialog>;
}
