import {useMemo,useRef,useState} from 'react';
import type {Doc} from '../core/types';
import {inspectMaterialCurveModel,type MaterialCurveModelIntent} from '../core/materialCurveModel';
import {editMaterialFaces,type MaterialFaceEditIntent} from '../core/materialFaceEdit';
import {inspectMaterialTopology} from '../core/materialTopology';
import {materialViewFrame} from '../app/materialFrame';
import {TessDialog} from './TessellationEditor';
import MaterialCurveDialog from './MaterialCurveDialog';
import MaterialTopologyPlot from './MaterialTopologyPlot';
import MaterialNetworkDialog from './MaterialNetworkDialog';
import MaterialRayDialog from './MaterialRayDialog';
import MaterialBatchDialog from './MaterialBatchDialog';
import MaterialFaceEditDialog from './MaterialFaceEditDialog';
import MaterialCutDialog from './MaterialCutDialog';
import MaterialJoinDialog from './MaterialJoinDialog';
import MaterialTransformDialog from './MaterialTransformDialog';
import MaterialCopyDialog from './MaterialCopyDialog';
import MaterialConstructionCopyDialog from './MaterialConstructionCopyDialog';
import MaterialPasteDialog from './MaterialPasteDialog';
import MaterialClipboardCutDialog from './MaterialClipboardCutDialog';
import MaterialReflectDialog from './MaterialReflectDialog';
import MaterialConstructionMoveDialog from './MaterialConstructionMoveDialog';
import MaterialLinePropertiesDialog from './MaterialLinePropertiesDialog';
import MaterialReferenceFaceDialog from './MaterialReferenceFaceDialog';
import MaterialAuxiliaryDialog from './MaterialAuxiliaryDialog';
import type {MaterialGroupRecipe} from '../core/materialCurveModel';
const transformNames={move:'移动',rotate:'旋转',scale:'缩放',mirrorX:'左右镜像',mirrorY:'上下镜像'};
const description=(r:MaterialGroupRecipe)=>r.kind==='material-auxiliary'?`${{create:'创建',update:'编辑',remove:'删除'}[r.operation.kind]}辅助线`:r.kind==='material-reference-face'?(r.face===null?'默认参考面':`参考面 F${r.face+1}`):r.kind==='material-line-properties'?({assignment:'线型修改',angle:'目标折角',swap:'山谷互换',exact:'精确赋值'}[r.operation.kind]):r.kind==='material-construction-move'?(r.transform.kind==='translate'?'定位移动':'四点移动'):r.kind==='material-edge-reflect'?'单线镜像':r.kind==='material-clipboard-paste'?'剪贴板粘贴':r.kind==='material-clipboard-cut'?'剪切部件':r.kind==='material-construction-copy'?{translate:'定位平移',similarity:'四点相似',reflect:'直线镜像'}[r.transform.kind]:r.kind==='material-face-insert'?'单面细分':r.kind==='material-face-remove'?`合并 ${r.segmentIds.length}边`:r.kind==='material-copy'?`复制 ${r.placements.length}份`:r.kind==='material-transform'?transformNames[r.operation.kind]:r.kind==='material-face-curves'?`曲线 ${r.curves.length}`:r.kind==='material-face-network'?`线网 ${r.graph.vertices.length}点/${r.graph.edges.length}边`:r.kind==='material-face-traces'?`批量 ${r.lines.length}直线`:r.kind==='material-face-ray'?'射线':r.kind==='material-cut'?`切开 ${r.segmentIds.length}边`:r.kind==='material-join'?`粘合 ${r.pairs.length}对`:'跨面直线';
const scope=(r:MaterialGroupRecipe)=>r.kind==='material-auxiliary'?'独立参考线':r.kind==='material-reference-face'?'查看基准':r.kind==='material-line-properties'?`明确${r.segmentIds.length}边`:r.kind==='material-construction-move'?'明确部件':r.kind==='material-edge-reflect'?(r.component==='all'?'全部材料':'原部件'):r.kind==='material-clipboard-paste'?'独立源快照':r.kind==='material-clipboard-cut'?'完整部件':r.kind==='material-construction-copy'?'明确原件':r.kind==='material-face-insert'?`F${r.face+1}`:r.kind==='material-face-remove'?'明确内边':r.kind==='material-copy'?'明确原件':r.kind==='material-transform'?`${r.components.length}个部件`:r.kind==='material-cut'||r.kind==='material-join'?'明确选边':'component'in r?r.component==='all'?'全部材料':`部件 ${r.component+1}`:r.scope==='all'?'全部材料':r.scope==='component'?'参考部件':'当前面';
export default function MaterialCurveModelDialog({doc,onApply,onClose}:{doc:Doc;onApply:(doc:Doc,intent:MaterialFaceEditIntent,ids:Set<string>)=>boolean;onClose:()=>void}){
 const original=useRef(doc),checked=useMemo(()=>inspectMaterialCurveModel(doc),[]),[editing,setEditing]=useState<string|null>(null),[removing,setRemoving]=useState<string|null>(null),[preview,setPreview]=useState<ReturnType<typeof editMaterialFaces>|null>(null),[error,setError]=useState(''),[view,setView]=useState<'cp'|'ff'>('cp');
 if(doc!==original.current)return <TessDialog title="参数构造组" onClose={onClose}><p role="alert">工程已变化，请重新打开参数组。</p></TessDialog>;
 if(editing){const apply=(next:Doc,intent:MaterialFaceEditIntent,ids:Set<string>)=>{const accepted=onApply(next,intent,ids);if(accepted)onClose();return accepted;},props={doc,group:editing,onApply:apply,onClose:()=>setEditing(null)},kind=checked.ok?checked.model.groups.find(g=>g.id===editing)?.recipe.kind:null;return kind==='material-auxiliary'?<MaterialAuxiliaryDialog {...props}/>:kind==='material-reference-face'?<MaterialReferenceFaceDialog {...props}/>:kind==='material-line-properties'?<MaterialLinePropertiesDialog {...props} selected={new Set()}/>:kind==='material-construction-move'?<MaterialConstructionMoveDialog {...props} selected={new Set()}/>:kind==='material-edge-reflect'?<MaterialReflectDialog {...props} selected={new Set()}/>:kind==='material-clipboard-paste'?<MaterialPasteDialog {...props}/>:kind==='material-clipboard-cut'?<MaterialClipboardCutDialog {...props} selected={new Set()}/>:kind==='material-construction-copy'?<MaterialConstructionCopyDialog {...props} selected={new Set()}/>:kind==='material-copy'?<MaterialCopyDialog {...props} selected={new Set()}/>:kind==='material-transform'?<MaterialTransformDialog {...props} selected={new Set()}/>:kind==='material-cut'?<MaterialCutDialog {...props} selected={new Set()}/>:kind==='material-join'?<MaterialJoinDialog {...props} selected={new Set()}/>:kind==='material-face-network'?<MaterialNetworkDialog {...props}/>:kind==='material-face-ray'?<MaterialRayDialog {...props}/>:kind==='material-face-traces'?<MaterialBatchDialog {...props}/>:['material-face-trace','material-face-insert','material-face-remove'].includes(kind??'')?<MaterialFaceEditDialog {...props} selected={new Set()}/>:<MaterialCurveDialog {...props}/>;}
 const remove=(id:string)=>{try{const result=editMaterialFaces(doc,{kind:'material-curve-group-remove',group:id});setRemoving(id);setPreview(result);setView('cp');setError('');}catch(e){setRemoving(null);setPreview(null);setError((e as Error).message);}};
 const apply=(intent:MaterialCurveModelIntent,next:Doc)=>{try{if(onApply(next,intent,new Set(preview?.insertedIds??[])))onClose();else throw Error('工程或预览已变化，请重新预览。');}catch(e){setError((e as Error).message);}};
 const m=inspectMaterialTopology(preview?.doc??doc),frame=m.ok?materialViewFrame(preview?.doc??doc):null,graph=m.ok&&view==='ff'&&m.foldedVertices?{...m.graph,vertices_coords:m.foldedVertices.map(frame!.toView)}:m.ok?m.graph:null;
 return <TessDialog title="参数构造组" onClose={onClose} className="material-face-dialog material-curve-model-dialog">
  <p className="note">编辑一组将从原材料顺序重算后续组；删除也须预览。组外材料修改不会被覆盖。</p>
  {checked.ok?<div className="material-cut-list"><table><thead><tr><th>参数组</th><th>构造</th><th>范围</th><th>操作</th></tr></thead><tbody>{checked.model.groups.map((g,i)=><tr key={g.id}><td>组 {i+1}</td><td>{description(g.recipe)}</td><td>{scope(g.recipe)}</td><td><button aria-label={`编辑参数组 ${i+1}`} onClick={()=>setEditing(g.id)}>编辑</button><button aria-label={`预览删除参数组 ${i+1}`} onClick={()=>remove(g.id)}>预览删除</button></td></tr>)}</tbody></table>{!checked.model.groups.length&&<p>当前模型尚无参数组，构造曲线、线网、直线、射线、批量直线、切开、粘合、变换、复制、单面细分或合并时可保存参数。</p>}</div>:<p role="alert">{checked.reason}</p>}
  {!checked.ok&&<button onClick={()=>{try{const intent:MaterialCurveModelIntent={kind:'material-curves-rebase'},result=editMaterialFaces(doc,intent);apply(intent,result.doc);}catch(e){setError((e as Error).message);}}}>从当前材料建立新模型</button>}
  <div className="material-face-toolbar"><button aria-pressed={view==='cp'} onClick={()=>setView('cp')}>CP预览</button><button disabled={!m.ok||!m.foldedVertices} aria-pressed={view==='ff'} onClick={()=>setView('ff')}>FF预览</button>{preview&&<span>删除后 {preview.facesAfter} 面 · 重算剩余组</span>}</div>
  {graph&&<MaterialTopologyPlot graph={graph} label="参数曲线组完整材料预览" navigation originalColor="var(--ink)"/>}
  <p role={error?'alert':'status'}>{error||(preview?'完整材料预览已更新，应用后一次撤销可恢复。':checked.ok?'模型及实际材料独立重算核对通过。':'旧配方可保留归档；新模型保留当前材料全部几何。')}</p>
  <footer><button onClick={onClose}>取消</button><button disabled={!preview||!removing} onClick={()=>{if(preview&&removing)apply({kind:'material-curve-group-remove',group:removing},preview.doc);}}>应用删除</button></footer>
 </TessDialog>;
}
