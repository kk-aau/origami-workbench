import {importParsedDocument} from '../core/formats';
import {readProjectFile} from '../app/importFile';
import {prepareProjectImport,prepareSavedProjectImport} from '../app/prepareProjectImport';
import {prepareArtworkProject} from '../app/artworkProject';
import {parseCurveDesign} from '../app/curveDesign';
import {curveDesignDocument,curveDesignFromDocument} from '../app/curveDesignProject';
import {PROJECT_IMPORT_CHUNK,type ProjectImportReply,type ProjectImportRequest,type SavedProjectImportInfo} from '../app/projectImportProtocol';
import type {Doc} from '../core/types';
import {appendImportedSegments} from '../app/appendImport';
import {prepareEditorCommit} from '../app/editorCommit';

const scope=globalThis as unknown as {
  onmessage:((event:MessageEvent<ProjectImportRequest|{type:'continue-crease'}>)=>void)|null;
  postMessage(reply:ProjectImportReply):void;
};
let nextChunk:(()=>void)|undefined;
async function publishCrease(doc:Doc,warnings:string[],savedProject?:SavedProjectImportInfo):Promise<void>{
  const saved=savedProject?{savedProject}:{};
  if(doc.segments.length<PROJECT_IMPORT_CHUNK*4){scope.postMessage({type:'result',result:{kind:'crease',doc,warnings,...saved}});return;}
  // Acknowledged chunks keep the UI responsive while receiving a complete
  // million-line document, with only one serialized chunk queued at a time.
  const send=async(reply:ProjectImportReply)=>{
    const received=new Promise<void>(resolve=>{nextChunk=resolve;});scope.postMessage(reply);await received;
  };
  const {segments,...withoutSegments}=doc;
  // Saved signatures also drive dirty/undo state. Keep the segments key in
  // its original position without sending the large array in this header.
  const header=savedProject?{...doc,segments:[]}:withoutSegments;
  await send({type:'crease-begin',doc:header,count:segments.length,warnings,...saved});
  for(let offset=0;offset<segments.length;offset+=PROJECT_IMPORT_CHUNK){await send({type:'crease-segments',offset,segments:segments.slice(offset,offset+PROJECT_IMPORT_CHUNK)});}
  scope.postMessage({type:'crease-complete'});
}
scope.onmessage=async event=>{
  if('type' in event.data&&event.data.type==='continue-crease'){const resume=nextChunk;nextChunk=undefined;resume?.();return;}
  try {
    if('type' in event.data){
      scope.postMessage({type:'stage',message:'正在读取本地工程并整理完整交点'});
      const result=prepareSavedProjectImport(event.data.text);event.data.text='';
      await publishCrease(result.doc,[],result.savedProject);return;
    }
    const {file,prepare,appendPlacement}=event.data;
    const text=prepare===true&&file.name.toLowerCase().endsWith('.json')?await file.text():null;
    const raw=text===null?null:JSON.parse(text) as {format?:unknown}|null;
    if(raw?.format==='zhezhi-artwork'){
      scope.postMessage({type:'stage',message:'正在检查完整作品与整理交点'});
      const project=prepareArtworkProject(text!);curveDesignFromDocument(project.editor);
      scope.postMessage({type:'result',result:{kind:'artwork',project}});return;
    }
    const result=raw?.format==='zhezhi-curve-design'
      ?{doc:curveDesignDocument(parseCurveDesign(raw)),warnings:[]}
      :text===null?await readProjectFile(file):importParsedDocument(raw,'json',file.name.replace(/\.[^.]+$/,''));
    scope.postMessage({type:'stage',message:'正在整理交点并检查图形'});
    if(typeof prepare==='object'){
      const appended=appendImportedSegments(prepare,result.doc,appendPlacement);
      if(prepare.metadata?.curveDesign&&appended.doc.segments.length)throw new Error('当前为曲面设计，请先新建或打开折痕工程，再追加直线折痕。');
      const ready=appended.appended?prepareEditorCommit(prepare,appended.doc):{doc:prepare,descendants:new Map<string,string[]>()};
      scope.postMessage({type:'result',result:{kind:'append',...ready,appended:appended.appended,warnings:[...result.warnings,...appended.warnings]}});return;
    }
    const doc=prepare?prepareProjectImport(result.doc,text!==null&&raw?.format!=='zhezhi-curve-design'):result.doc;
    if(prepare)curveDesignFromDocument(doc);
    await publishCrease(doc,result.warnings);
  }catch(error){scope.postMessage({type:'error',message:error instanceof Error?error.message:String(error)});}
};
