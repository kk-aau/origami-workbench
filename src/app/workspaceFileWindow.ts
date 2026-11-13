import {useEffect,useRef} from 'react';
import type {DesktopDocumentWorkspace} from '../desktop';
import type {Doc} from '../core/types';
import type {DesignKind} from './baseDesign';
import type {BaseDesignSummary} from './baseDesignLibrary';
import type {DiagramBasicSettings} from './diagramBasicSettings';
import type {PreparedDiagramImage} from './diagramImageImport';
import {browserMutate} from './browserStorage';

export interface CPReturnTarget {origin:string;session:string;stepId:string;stateId:string;revision:number;generation:number;label:string}
export function libraryFileKey(workspace:DesktopDocumentWorkspace,id:string){
  const library=workspace==='diagram'?'diagram':workspace==='design'?'design':'crease';
  return library+':'+id;
}
// A newly launched view may still be loading its reserved identity.
export function useLibraryFileIdentity(workspace:DesktopDocumentWorkspace|null,id:string|null){
  const previous=useRef<string|null>(null);
  useEffect(()=>{
    const documents=window.desktop?.documents;
    if(!workspace||!documents||!id&&!previous.current)return;
    const key=id?libraryFileKey(workspace,id):null;
    if(key===previous.current)return;
    previous.current=key;
    void documents.setLibraryIdentity(key).catch(error=>window.dispatchEvent(new CustomEvent('zhezhi-library-error',{detail:String(error)})));
  },[workspace,id]);
}
export type WorkspaceFile =
  | {kind:'workspace-source';doc:Doc|null}
  | {kind:'blank';example?:string}
  | {kind:'stored';id:string}
  | {kind:'file';file:File}
  | {kind:'cp';doc:Doc;returnTarget?:CPReturnTarget}
  | {kind:'diagram-new';name:string;settings:DiagramBasicSettings;paper?:Doc}
  | {kind:'diagram-source';doc:Doc;name:string;settings:DiagramBasicSettings}
  | {kind:'design-new';design:DesignKind;example:boolean}
  | {kind:'design-stored';item:BaseDesignSummary}
  | {kind:'image';image:PreparedDiagramImage};
export type LaunchWorkspaceFile=(file:WorkspaceFile)=>Promise<void>;

export async function launchWorkspaceFile(workspace:DesktopDocumentWorkspace,file:WorkspaceFile){
  const service=window.desktop?.documents;
  if(!service)throw Error('无法打开工作区窗口。');
  const token=crypto.randomUUID(),key='workspace-launch:'+token;
  await browserMutate(key,()=>({value:file,result:undefined}));
  const id=file.kind==='stored'?file.id:file.kind==='design-stored'?file.item.id:null;
  try{
    const opened=await service.openWorkspace(workspace,undefined,token,id?libraryFileKey(workspace,id):undefined,file.kind==='cp'&&!!file.returnTarget);
    if(opened.alreadyOpen){
      await browserMutate(key,()=>({value:undefined,result:undefined}));
      window.dispatchEvent(new Event('zhezhi-file-already-open'));
    }
    window.dispatchEvent(new Event('zhezhi-workspace-file-opened'));
    return opened;
  }
  catch(error){await browserMutate(key,()=>({value:undefined,result:undefined}));throw error;}
}
export function takeWorkspaceFile(token:string){
  return browserMutate<WorkspaceFile,WorkspaceFile|undefined>('workspace-launch:'+token,file=>({value:undefined,result:file}));
}
