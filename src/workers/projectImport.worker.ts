import {importParsedDocument} from '../core/formats';
import {readProjectFile} from '../app/importFile';
import {prepareProjectImport,prepareSavedProjectImport} from '../app/prepareProjectImport';
import {prepareArtworkImport,type PreparedArtworkImport} from '../app/artworkImportPreparation';
import {artworkTransferChunks} from '../app/artworkImportTransfer';
import {parseCurveDesign} from '../app/curveDesign';
import {curveDesignDocument,curveDesignFromDocument} from '../app/curveDesignProject';
import {type ProjectImportReply,type ProjectImportRequest,type SavedProjectImportInfo} from '../app/projectImportProtocol';
import type {Doc} from '../core/types';
import {appendImportedSegments} from '../app/appendImport';
import {prepareEditorCommit} from '../app/editorCommit';
import {createDiagramProjectSaveBlob} from '../app/diagramProjectTransport';
import {decodeArtworkArchive} from '../app/artworkArchive';
import type {PreparedEditorImportData} from '../app/editorImportPreparation';

const scope=globalThis as unknown as {
  onmessage:((event:MessageEvent<ProjectImportRequest|{type:'continue-crease'}|{type:'continue-artwork'}|{type:'continue-editor'}>)=>void)|null;
  postMessage(reply:ProjectImportReply):void;
};
let nextChunk:(()=>void)|undefined;
let nextArtworkChunk:(()=>void)|undefined;
let nextEditorChunk:(()=>void)|undefined;
async function publishArtwork(value:PreparedArtworkImport):Promise<void>{
  const send=async(reply:ProjectImportReply)=>{const received=new Promise<void>(resolve=>{nextArtworkChunk=resolve;});scope.postMessage(reply);await received;};
  // A Blob crosses workers as immutable backing bytes. The UI can forward it
  // to its save Worker without stringifying or cloning this large graph again.
  const diagramSaveBlob=value.project.diagram?createDiagramProjectSaveBlob(value.project.diagram):undefined;
  await send({type:'artwork-begin',...(diagramSaveBlob?{diagramSaveBlob}:{})});let chunks=0;
  for(const operations of artworkTransferChunks(value))await send({type:'artwork-chunk',index:chunks++,operations});
  scope.postMessage({type:'artwork-complete',chunks});
}
async function publishCrease(doc:Doc,warnings:string[],savedProject?:SavedProjectImportInfo):Promise<void>{
  // Segments alone are not the large part of every file. Metadata, warnings
  // and saved baselines need the same bounded protocol, preserving key order.
  // Saved data already owns its exact prepared signature: do not send it twice.
  const value:PreparedEditorImportData={doc,warnings,...(savedProject?{savedProject}:{signature:JSON.stringify(doc)})};
  const send=async(reply:ProjectImportReply)=>{const received=new Promise<void>(resolve=>{nextEditorChunk=resolve;});scope.postMessage(reply);await received;};
  await send({type:'editor-begin'});let chunks=0;
  for(const operations of artworkTransferChunks(value))await send({type:'editor-chunk',index:chunks++,operations});
  scope.postMessage({type:'editor-complete',chunks});
}
scope.onmessage=async event=>{
  if('type' in event.data&&event.data.type==='continue-crease'){const resume=nextChunk;nextChunk=undefined;resume?.();return;}
  if('type' in event.data&&event.data.type==='continue-artwork'){const resume=nextArtworkChunk;nextArtworkChunk=undefined;resume?.();return;}
  if('type' in event.data&&event.data.type==='continue-editor'){const resume=nextEditorChunk;nextEditorChunk=undefined;resume?.();return;}
  try {
    if('type' in event.data){
      if(event.data.type==='prepare-artwork'){
        const prepared=prepareArtworkImport(event.data.text,message=>scope.postMessage({type:'stage',message}));event.data.text='';
        await publishArtwork(prepared);return;
      }
      scope.postMessage({type:'stage',message:'正在读取本地工程并整理完整交点'});
      const result=prepareSavedProjectImport(typeof event.data.text==='string'?event.data.text:await event.data.text.text());event.data.text='';
      await publishCrease(result.doc,[],result.savedProject);return;
    }
    const {file,prepare,appendPlacement}=event.data;
    if(file.name.toLowerCase().endsWith('.oriw')){
      if(prepare!==true)throw Error('ORIW 包含多个工作区，请使用“打开文件”恢复完整作品。');
      scope.postMessage({type:'stage',message:'正在解包 ORIW 完整作品'});
      const raw=decodeArtworkArchive(new Uint8Array(await file.arrayBuffer()));
      await publishArtwork(prepareArtworkImport(raw,message=>scope.postMessage({type:'stage',message})));return;
    }
    let text=prepare===true&&file.name.toLowerCase().endsWith('.json')?await file.text():null;
    let raw=text===null?null:JSON.parse(text) as {format?:unknown}|null;
    if(raw?.format==='zhezhi-artwork'){
      const prepared=prepareArtworkImport(raw,message=>scope.postMessage({type:'stage',message}));
      raw=null;text=null;
      await publishArtwork(prepared);return;
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
