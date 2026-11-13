/** Stable document identity belongs to a native Webview, not its current OS
 * parent. Reparenting must never create a new recovery slot or editor scope. */
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export type DocumentWorkspace='edit'|'design'|'tess'|'sim'|'diagram';
const workspaces:readonly string[]=['edit','design','tess','sim','diagram'];

export function nativeDocumentId(desktop:unknown):string|null {
  if(!desktop||typeof desktop!=='object'||(desktop as {role?:unknown}).role!=='document')return null;
  const id=(desktop as {documentId?:unknown}).documentId;
  if(typeof id!=='string'||!UUID.test(id))throw Error('作品窗口编号无效，未启用可能覆盖其他作品的恢复存储。');
  return id;
}
export function documentWorkspaceCommand(command:string):DocumentWorkspace|null {
  const value=command.startsWith('workspace:')?command.slice(10):'';
  return workspaces.includes(value)?value as DocumentWorkspace:null;
}
export interface WorkspaceDocumentStatus {name?:string|null;dirty:boolean;busy:boolean;present:boolean}
export function artworkDocumentStatus(input:{name:string;workspace:DocumentWorkspace;creaseDirty:boolean;modelDirty:boolean;simulationDirty:boolean;constructionDirty:boolean;busy:boolean;saving:boolean;ready:boolean;diagram?:WorkspaceDocumentStatus;design?:WorkspaceDocumentStatus}) {
  const dirty=input.creaseDirty||input.modelDirty||input.simulationDirty||input.constructionDirty||!!input.diagram?.dirty||!!input.design?.dirty;
  const name=input.workspace==='diagram'?input.diagram?.name:input.workspace==='design'?input.design?.name:null;
  return {title:name||input.name,workspace:input.workspace,dirty,busy:input.busy||!!input.diagram?.busy||!!input.design?.busy,saving:input.saving,ready:input.ready};
}

export interface ArtworkRecoveryOwner {id:string;revision:string|null;text:string}
export interface ArtworkRecoveryScope {scope:number;documentId:string|null;owner:ArtworkRecoveryOwner}
/** Native reparenting retains this scope token. Replacing content rotates the
 * recovery owner so the preceding complete artwork remains recoverable. */
export function nextArtworkRecoveryScope(previous:ArtworkRecoveryScope|undefined,scope:number,documentId:string|null,idFactory:()=>string=()=>crypto.randomUUID()):ArtworkRecoveryScope {
  if(documentId!==null&&!UUID.test(documentId))throw Error('完整作品恢复编号无效。');
  if(previous?.scope===scope&&previous.documentId===documentId)return previous;
  const id=documentId!==null&&(!previous||previous.documentId!==documentId)?documentId:idFactory();
  const owner={id,revision:null,text:''};
  return {scope,documentId,owner};
}

export function documentWorkingPreferenceKey(key:string,documentId?:string):string {
  if(key!=='zhezhi.diagram-project.v1'||documentId===undefined)return key;
  if(!UUID.test(documentId))throw Error('作品工作槽编号无效。');
  const encoded=documentId.replace(/-/g,'').replace(/[0-9a-f]/g,digit=>'abcdefghijklmnop'[parseInt(digit,16)]);
  return `zhezhi.document-${encoded}-diagram-project.v1`;
}

export interface ArtworkSaveStamp {content:number;simulation:number}
/** Only immutable root identity and a small live-simulation epoch are needed.
 * Never walk a geometry bank just to paint a document tab or close guard. */
export function createArtworkSaveTracker(initial:unknown){
  let key=initial,content=0,simulation=0,savedContent=0,savedSimulation=0;
  return {
    observe(next:unknown){if(!Object.is(next,key)){key=next;content++;}},
    simulationChanged(){simulation++;},
    capture:():ArtworkSaveStamp=>({content,simulation}),
    acknowledge(stamp:ArtworkSaveStamp){if(stamp.content!==content||stamp.simulation!==simulation)return false;savedContent=content;savedSimulation=simulation;return true;},
    dirty:()=>content!==savedContent||simulation!==savedSimulation,
  };
}
