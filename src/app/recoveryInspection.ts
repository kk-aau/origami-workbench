import {chooseRecovery,type RecoverySnapshot,type RecoverySource} from './recovery';
import {exportDocument} from '../core/formats';

export interface RecoveryCandidate extends Omit<RecoverySnapshot,'doc'> {
 name:string;signature?:string;restore:Blob;backup:Blob;
}
export interface RecoveryInspection {recovery:RecoveryCandidate|null;alternatives:RecoveryCandidate[];warnings:string[];unreadableSources?:RecoverySource[]}
export interface RecoveryInspectionRequest {server:Blob|null;browser:Blob|null}
export type RecoveryInspectionReply={type:'result';choice:RecoveryInspection}|{type:'error';message:string};

/** Worker only: retain the existing source validation, recency, project-id and
 * duplicate choices. Geometry and large signatures never leave this thread. */
export async function inspectRecoveryBlobs(server:Blob|null,browser:Blob|null):Promise<RecoveryInspection>{
 if(server!==null&&!(server instanceof Blob)||browser!==null&&!(browser instanceof Blob))throw new Error('恢复副本检查输入无效。');
 const read=async(blob:Blob|null)=>{
  if(blob===null)return {text:null,unreadable:false};
  try{return {text:await blob.text(),unreadable:false};}
  catch{return {text:null,unreadable:true};}
 };
 // Read each immutable source once and independently. A failed disk Blob must
 // not hide a valid browser draft (or the reverse), nor imply no old draft.
 const [serverRead,browserRead]=await Promise.all([read(server),read(browser)]);
 const unreadableSources:RecoverySource[]=[];
 if(serverRead.unreadable)unreadableSources.push('server');
 if(browserRead.unreadable)unreadableSources.push('browser');
 const choice=chooseRecovery(serverRead.text,browserRead.text);
 const candidate=(snapshot:RecoverySnapshot):RecoveryCandidate=>{
  const {doc,...metadata}=snapshot;
  return {...metadata,name:doc.name.slice(0,160),
   restore:new Blob([JSON.stringify({doc,revision:'recovery',draft:true})],{type:'application/json'}),
   backup:new Blob([exportDocument(doc,'json').text],{type:'application/json'})};
 };
 const warnings=[...choice.warnings,...unreadableSources.map(source=>`${source==='server'?'本机磁盘':'浏览器'}恢复副本尚未读取，原件已保留；请检查后重试。`)];
 return {recovery:choice.recovery?candidate(choice.recovery):null,alternatives:choice.alternatives.map(candidate),warnings,
  ...(unreadableSources.length?{unreadableSources}:{})};
}
