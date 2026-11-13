import {createArtworkSerializer} from '../app/artworkSerialization';
import {ARTWORK_ARCHIVE_MIME,encodeArtworkArchive} from '../app/artworkArchive';
import type {ArtworkSerializationRequest,ArtworkSerializationReply} from '../app/artworkSerializationTask';

const serialize=createArtworkSerializer();
const scope=globalThis as unknown as {onmessage:((event:MessageEvent<ArtworkSerializationRequest>)=>void)|null;postMessage(reply:ArtworkSerializationReply):void};
scope.onmessage=event=>{
 const {id}=event.data;
 try{
  const project='editorText' in event.data?{...event.data.project,editor:JSON.parse(event.data.editorText)}:event.data.project;
  const text=serialize(project);
  if(event.data.format==='archive'){
   const bytes=encodeArtworkArchive(text);
   // Build the immutable Blob in the worker; the UI receives its handle and
   // does not construct another complete byte array for saving.
   scope.postMessage({id,type:'archive',blob:new Blob([bytes],{type:ARTWORK_ARCHIVE_MIME})});
  }else scope.postMessage({id,type:'result',text});
 }
 catch(error){scope.postMessage({id,type:'error',message:error instanceof Error?error.message:String(error)});}
};
