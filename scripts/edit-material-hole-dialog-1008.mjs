import fs from 'node:fs';
const file='src/components/MaterialFaceEditDialog.tsx';let s=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
const pairs=[
 ["import MaterialTopologyPlot from './MaterialTopologyPlot';","import MaterialTopologyPlot from './MaterialTopologyPlot';\nimport {materialFaceEdges} from '../core/materialRings';\nimport {materialRoot} from '../core/materialFaceCommon';"],
 ["const controls=useRef<HTMLDivElement>(null);","const controls=useRef<HTMLDivElement>(null),previewMaterial=useMemo(()=>preview?inspectMaterialTopology(preview.doc):null,[preview]);"],
 [":graph.faces_edges![face],indices=new Map(ids.map((id,e)=>[id,e]));",":materialFaceEdges(graph,face),indices=new Map(ids.map((id,e)=>[id,e])),plotGraph=mode==='remove'&&previewMaterial?.ok?previewMaterial.graph:graph,plotIds=mode==='remove'&&previewMaterial?.ok?previewMaterial.edgeSegmentIds:ids;"],
 ['F{f+1} · {row.length} 角</option>','F{f+1} · {row.length} 角{graph.faces_holes?.[f]?.length?` / ${graph.faces_holes[f].length} 孔`:""}</option>'],
 ['仅在该面内构造直线折痕。原坐标不移动，共享边同步细分；','仅在该面内构造直线折痕，带孔面按实际材料分段，不补孔内线；'],
 [":'点击青色高亮的内部折痕可取消选择。删除后合并相邻面，纸边和切口边保留；闭环不相容或无法形成简单面时明确拒绝。'",":preview?'图中为合并后的实际材料面，孔洞保持空白；修改下方选择可重新预览。':'点击青色高亮的内部折痕可取消选择。删除后合并相邻面，纸边、孔洞和切口边保留；闭环不相容、自接或断开区域明确拒绝。'"],
 ['<MaterialTopologyPlot graph={graph}', '<MaterialTopologyPlot graph={plotGraph}'],
 ["face={mode==='insert'?face:undefined}","face={mode==='insert'?face:mode==='remove'&&preview&&previewMaterial?.ok?materialRoot(preview.doc,previewMaterial):undefined}"],
 ["pickEdges={mode==='trace'?edges:undefined}","pickEdges={mode!=='remove'?edges:undefined}"],
 ["cut={mode==='remove'?removeIDs.map(id=>indices.get(id)!):[]}","cut={mode==='remove'?removeIDs.map(id=>plotIds.indexOf(id)).filter(e=>e>=0):[]}"],
 ["onPick={mode==='remove'?toggle:undefined}","onPick={mode==='remove'?e=>{const original=indices.get(plotIds[e]);if(original!==undefined)toggle(original);}:undefined}"],
 ['<option value="0">保持起点沿面边到终点一侧</option><option value="1">保持另一侧</option>', '<option value="0">{graph.faces_holes?.[face]?.length?"保持直线左侧":"保持起点沿面边到终点一侧"}</option><option value="1">{graph.faces_holes?.[face]?.length?"保持直线右侧":"保持另一侧"}</option>'],
 ['材料面 {preview.facesBefore} → {preview.facesAfter}，', '材料面 {preview.facesBefore} → {preview.facesAfter}{previewMaterial?.ok&&previewMaterial.graph.faces_holes?.some(r=>r.length)?`，孔洞 ${previewMaterial.graph.faces_holes.reduce((n,r)=>n+r.length,0)}`:""}，'],
];for(const [from,to]of pairs){if(!s.includes(from))throw Error('Missing '+from.slice(0,100));s=s.replace(from,to);}fs.writeFileSync(file,s);console.log('Added real merged-face preview, hole/inner-edge controls and explicit hole fixed-side wording.');
