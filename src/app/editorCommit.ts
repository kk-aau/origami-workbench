import {validateDoc,type Doc} from '../core/types';
import {reconcileMaterialEdit,type MaterialTransformIntent} from './materialEdit';
import {splitEditableSegmentsWithMap,type EditableSplitResult} from './planarize';
import {cutMaterialEdges,type MaterialCutIntent} from '../core/materialCut';
import {joinMaterialEdges,type MaterialJoinIntent} from '../core/materialJoin';
import {editMaterialFaces,type MaterialFaceEditIntent} from '../core/materialFaceEdit';
import {copyMaterialComponents,type MaterialCopyIntent} from '../core/materialCopy';
import {constructMaterialCopy,type MaterialConstructionCopyIntent} from './materialConstructionCopy';
import {constructMaterialMove,type MaterialConstructionMoveIntent} from './materialConstructionMove';
import {pasteMaterialSelection,cutMaterialSelection,type MaterialPasteIntent,type MaterialClipboardCutIntent} from './materialClipboard';
import {applyMaterialGeneratedSwap,type MaterialGeneratedSwapIntent} from './materialGeneratedSwap';
export type EditorMaterialIntent=MaterialTransformIntent|MaterialCutIntent|MaterialJoinIntent|MaterialFaceEditIntent|MaterialCopyIntent|MaterialConstructionCopyIntent|MaterialConstructionMoveIntent|MaterialPasteIntent|MaterialClipboardCutIntent|MaterialGeneratedSwapIntent;

/** Prepare one complete history frame. A rejected material edit never reaches
 * ordinary coordinate splitting, and no partial contract reaches history. */
export function prepareEditorCommit(previous:Doc,next:Doc,transform?:EditorMaterialIntent):EditableSplitResult {
  validateDoc(next);
  if(transform?.kind==='material-generated-swap'){
    if(Object.keys(transform).sort().join(',')!=='construction,kind')throw new Error('材料生成线段山谷互换意图无效。');
    const result=applyMaterialGeneratedSwap(previous,transform.construction);
    if(JSON.stringify(result.doc)!==JSON.stringify(next))throw new Error('材料生成线段山谷互换提案与构造及输出边身份的独立重放不一致，未修改工程。');
    return {doc:result.doc,descendants:result.descendants};
  }
  if(transform?.kind==='material-clipboard-paste'||transform?.kind==='material-clipboard-cut'){
    const result=transform.kind==='material-clipboard-paste'?pasteMaterialSelection(previous,transform):cutMaterialSelection(previous,transform);
    if(JSON.stringify(result.doc)!==JSON.stringify(next))throw new Error('材料剪贴板提案与来源快照及当前部件身份的独立重放不一致，未修改工程。');
    return {doc:result.doc,descendants:result.descendants};
  }
  if(transform?.kind==='material-construction-move'){
    const result=constructMaterialMove(previous,transform);
    if(JSON.stringify(result.doc)!==JSON.stringify(next))throw new Error('材料定位移动提案与参考点及部件身份的独立重放不一致，未修改工程。');
    return {doc:result.doc,descendants:result.descendants};
  }
  if(transform?.kind==='material-construction-copy'){
    const result=constructMaterialCopy(previous,transform);
    if(JSON.stringify(result.doc)!==JSON.stringify(next))throw new Error('材料构造复制提案与参考点及部件身份的独立重放不一致，未修改工程。');
    return {doc:result.doc,descendants:result.descendants};
  }
  if(transform?.kind==='material-copy'){
    const result=copyMaterialComponents(previous,transform);
    if(JSON.stringify(result.doc)!==JSON.stringify(next))throw new Error('材料复制提案与当前部件身份的独立重放不一致，未修改工程。');
    return {doc:result.doc,descendants:result.descendants};
  }
  if(transform?.kind==='material-auxiliary'||transform?.kind==='material-reference-face'||transform?.kind==='material-line-properties'||transform?.kind==='material-transform'||transform?.kind==='material-face-insert'||transform?.kind==='material-face-remove'||transform?.kind==='material-face-trace'||transform?.kind==='material-face-ray'||transform?.kind==='material-face-network'||transform?.kind==='material-face-curves'||transform?.kind==='material-curve-group-edit'||transform?.kind==='material-curve-group-remove'||transform?.kind==='material-curves-rebase'||transform?.kind==='material-face-traces'||transform?.kind==='material-edge-reflect'){
    const result=editMaterialFaces(previous,transform);
    if(JSON.stringify(result.doc)!==JSON.stringify(next))throw new Error('材料面编辑提案与原边面身份的独立重放不一致，未修改工程。');
    return {doc:result.doc,descendants:result.descendants};
  }
  if(transform?.kind==='material-cut'){
    const result=cutMaterialEdges(previous,transform);
    // Replay the complete operation rather than trusting a replacement blob.
    if(JSON.stringify(result.doc)!==JSON.stringify(next))throw new Error('材料切开提案与当前边身份的独立重放不一致，未修改工程。');
    return {doc:result.doc,descendants:result.descendants};
  }
  if(transform?.kind==='material-join'){
    const result=joinMaterialEdges(previous,transform);
    if(JSON.stringify(result.doc)!==JSON.stringify(next))throw new Error('材料粘合提案与当前两侧边身份的独立重放不一致，未修改工程。');
    return {doc:result.doc,descendants:result.descendants};
  }
  const reconciled=reconcileMaterialEdit(previous,next,transform);
  const result=splitEditableSegmentsWithMap(reconciled);
  validateDoc(result.doc);
  return result;
}
