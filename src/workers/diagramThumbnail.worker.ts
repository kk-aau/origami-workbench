import {importDiagramProject} from '../app/diagramProject';
import {diagramLibraryThumbnail} from '../app/diagramLibrary';
import {setPreferenceService} from '../app/preferenceStorage';
import type {DiagramThumbnailReply,DiagramThumbnailRequest} from '../app/diagramThumbnailTask';

const scope=globalThis as unknown as {onmessage:((event:MessageEvent<DiagramThumbnailRequest>)=>void)|null;postMessage(reply:DiagramThumbnailReply):void};
scope.onmessage=event=>{
  try{
    if(!event.data||typeof event.data.storedText!=='string')throw new Error('绘图缩略图记录无效。');
    const record=JSON.parse(event.data.storedText);
    if(!record||typeof record!=='object'||record.format!=='zhezhi-diagram-library-document'||record.version!==1||!record.project
      ||record.thumbnail!==null&&(typeof record.thumbnail!=='string'||record.thumbnail.length>120_000))throw new Error('绘图内容格式损坏。');
    const project=importDiagramProject(JSON.stringify(record.project));
    const entries=event.data.preferences??[];
    if(!Array.isArray(entries)||entries.some(entry=>!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string'||entry[1]!==null&&typeof entry[1]!=='string'))throw new Error('缩略图显示偏好格式无效。');
    const preferences=new Map(entries);
    setPreferenceService({getItem:key=>preferences.get(key)??null,setItem(){throw new Error('缩略图线程不能修改设置。');}});
    // The old getThumbnail fallback intentionally returns image-rich SVGs
    // larger than its 120k on-disk cache limit. Keep the complete preview.
    scope.postMessage({type:'result',thumbnail:record.thumbnail??diagramLibraryThumbnail(project)});
  }catch(error){scope.postMessage({type:'error',message:error instanceof Error?error.message:String(error)});}
  finally{setPreferenceService(undefined);}
};
