import type {DiagramProject} from './diagramProject';

// The import Worker creates these immutable JSON blobs. Only the exact received
// project object is associated on the UI; a property read from disk grants no
// readiness and a later immutable edit cannot accidentally reuse stale bytes.
const preparedSaveBlobs=new WeakMap<DiagramProject,Blob>();

/** Run only in a Worker, after the ordinary complete artwork preparation. */
export function createDiagramProjectSaveBlob(project:DiagramProject):Blob {
  return new Blob([JSON.stringify(project)],{type:'application/json'});
}

/** Called after the owned import Worker has completed its acknowledged tree. */
export function registerDiagramProjectSaveBlob(project:DiagramProject,blob:Blob):void {
  if(!(blob instanceof Blob)||blob.type!=='application/json'||!blob.size)throw Error('绘图后台保存数据不完整，当前作品未替换。');
  preparedSaveBlobs.set(project,blob);
}

/** Blob structured cloning shares immutable backing bytes instead of walking
 * the geometry graph a second time. It can also be retried without detaching. */
export function getDiagramProjectSaveBlob(project:DiagramProject):Blob|undefined {
  return preparedSaveBlobs.get(project);
}
