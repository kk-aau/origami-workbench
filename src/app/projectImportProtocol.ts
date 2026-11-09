import type {Doc,Segment} from '../core/types';
import type {ArtworkProject} from './artworkProject';

export const PROJECT_IMPORT_CHUNK=4096;
export interface SavedProjectImportInfo {
  draft:boolean;revision:string;sourceSignature:string;preparedSignature:string;upgraded:boolean;
}
export type ProjectImportRequest={file:File;prepare:boolean|Doc;appendPlacement?:'beside'}
  |{type:'prepare-saved-project';text:string};
export type ProjectImportResult = {kind:'crease';doc:Doc;warnings:string[];savedProject?:SavedProjectImportInfo}|{kind:'artwork';project:ArtworkProject}
  |{kind:'append';doc:Doc;descendants:Map<string,string[]>;appended:number;warnings:string[]};
export type ProjectImportReply = {type:'stage';message:string}|{type:'result';result:ProjectImportResult}|{type:'error';message:string}
  |{type:'crease-begin';doc:Omit<Doc,'segments'>;count:number;warnings:string[];savedProject?:SavedProjectImportInfo}
  |{type:'crease-segments';offset:number;segments:Segment[]}|{type:'crease-complete'};
