import {createArtworkSerializer} from '../app/artworkSerialization';
import type {ArtworkSerializationRequest,ArtworkSerializationReply} from '../app/artworkSerializationTask';

const serialize=createArtworkSerializer();
const scope=globalThis as unknown as {onmessage:((event:MessageEvent<ArtworkSerializationRequest>)=>void)|null;postMessage(reply:ArtworkSerializationReply):void};
scope.onmessage=event=>{
 const {id}=event.data;
 try{
  const project='editorText' in event.data?{...event.data.project,editor:JSON.parse(event.data.editorText)}:event.data.project;
  scope.postMessage({id,type:'result',text:serialize(project)});
 }
 catch(error){scope.postMessage({id,type:'error',message:error instanceof Error?error.message:String(error)});}
};
