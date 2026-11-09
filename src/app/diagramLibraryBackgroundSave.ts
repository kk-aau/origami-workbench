import {createDiagramLibrary,diagramLibraryThumbnail,DIAGRAM_LIBRARY_KEY,DIAGRAM_LEGACY_DRAFT_KEY,type DiagramLibraryIndex,type DiagramLibraryBackgroundRequest,type DiagramLibraryBackgroundResult} from './diagramLibrary';
import {exportDiagramProject} from './diagramProject';
import type {Preferences} from './preferenceStorage';

/** Runs entirely in the save worker. Reuse the ordinary complete validator,
 * immutable staged payload, index CAS and exact-byte cleanup transaction. */
export function runDiagramLibraryBackgroundSave(request:DiagramLibraryBackgroundRequest,storage:Preferences):DiagramLibraryBackgroundResult {
  const warnings:string[]=[],openedHeads=request.settings.id&&request.openedHead!==undefined?new Map([[request.settings.id,request.openedHead]]):undefined;
  let committedIndex:DiagramLibraryIndex|undefined;
  const captured:Preferences={...storage,compareAndSet:(key,expected,value)=>{
    const accepted=storage.compareAndSet?storage.compareAndSet(key,expected,value):storage.getItem(key)===expected&&(storage.setItem(key,value),storage.getItem(key)===value);
    if(accepted&&key===DIAGRAM_LIBRARY_KEY)committedIndex=JSON.parse(value) as DiagramLibraryIndex;
    return accepted;
  }};
  const library=createDiagramLibrary(captured,{openedHeads,onWarning:warning=>warnings.push(warning)});
  const entry='project' in request?library.save(request.project,request.settings):request.settings.id?library.promoteDraft(request.settings.id,request.promoteDraftKey):(()=>{throw Error('手动保存标记缺少绘图编号。');})();
  if(request.legacyDraft&&'project' in request){
    try{storage.setItem(DIAGRAM_LEGACY_DRAFT_KEY,exportDiagramProject(request.project));}
    catch(error){warnings.push('绘图已保存到文档库，兼容恢复副本暂未更新：'+(error instanceof Error?error.message:String(error)));}
  }
  // Receipt refers to the exact committed index. A later external edit or a
  // failed optional reread must not claim a different revision as our own.
  if(!committedIndex)throw Error('后台保存未取得目录提交回执。');
  return {entry,index:committedIndex,thumbnail:'project' in request?library.getCachedThumbnail(entry.draftKey)??diagramLibraryThumbnail(request.project):null,warnings};
}
