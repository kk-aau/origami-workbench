import type {Doc,Segment} from '../core/types';
import type {ArtworkProject} from './artworkProject';
import type {ArtworkTransferOperation} from './artworkImportTransfer';

export const PROJECT_IMPORT_CHUNK=4096;
export interface SavedProjectImportInfo {
  draft:boolean;revision:string|null;sourceSignature:string;preparedSignature:string;upgraded:boolean;
  workspaceDraft?:boolean;workspaceDraftConflict?:boolean;
}
/** A new document's private draft has no shared library revision yet. */
export function validSavedProjectHead(value:{revision?:unknown;draft?:unknown;workspaceDraft?:unknown;workspaceDraftConflict?:unknown}):boolean{
  return (typeof value.revision==='string'&&!!value.revision.trim()||value.revision===null&&value.draft===true&&value.workspaceDraft===true)
    &&(value.workspaceDraft===undefined||typeof value.workspaceDraft==='boolean')&&(value.workspaceDraftConflict===undefined||typeof value.workspaceDraftConflict==='boolean');
}
export type ProjectImportRequest={file:File;prepare:boolean|Doc;appendPlacement?:'beside'}
  |{type:'prepare-saved-project';text:string|Blob}|{type:'prepare-artwork';text:string};
export type ProjectImportResult = {kind:'crease';doc:Doc;warnings:string[];savedProject?:SavedProjectImportInfo}|{kind:'artwork';project:ArtworkProject}
  |{kind:'append';doc:Doc;descendants:Map<string,string[]>;appended:number;warnings:string[]};
export type ProjectImportReply = {type:'stage';message:string}|{type:'result';result:ProjectImportResult}|{type:'error';message:string}
  |{type:'crease-begin';doc:Omit<Doc,'segments'>;count:number;warnings:string[];savedProject?:SavedProjectImportInfo}
  |{type:'crease-segments';offset:number;segments:Segment[]}|{type:'crease-complete'}
  |{type:'editor-begin'}|{type:'editor-chunk';index:number;operations:ArtworkTransferOperation[]}|{type:'editor-complete';chunks:number}
  |{type:'artwork-begin';diagramSaveBlob?:Blob}|{type:'artwork-chunk';index:number;operations:ArtworkTransferOperation[]}|{type:'artwork-complete';chunks:number};
