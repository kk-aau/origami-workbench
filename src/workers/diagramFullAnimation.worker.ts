import {DiagramFullAnimationSession} from '../app/diagramFullAnimation';
import {DiagramPlaybackSequence} from '../app/diagramPlaybackSequence';
import {diagramSinkDisplay} from '../app/diagramSinkDisplay';
import type {DiagramProject} from '../app/diagramProject';
let session:DiagramFullAnimationSession|DiagramPlaybackSequence|null=null;
let sink:{first:number;last:number}|undefined;
let display:ReturnType<typeof diagramSinkDisplay>|undefined;
self.onmessage=(event:MessageEvent<{type:'init';project:DiagramProject;sink?:typeof sink}|{type:'prepare';id:number;index:number;start:number;position?:number}>)=>{
  const message=event.data;
  if(message.type==='init'){sink=message.sink;session=sink?new DiagramFullAnimationSession(message.project):new DiagramPlaybackSequence(message.project);display=undefined;return;}
  try{
    if(!session)throw Error('全程演示尚未初始化。');
    const progress=(index:number,text:string)=>self.postMessage({id:message.id,type:'progress',index,message:text});
    if(sink&&!display){
      const opening=session.prepare(sink.first,sink.first,progress);
      const closing=session.prepare(sink.last,sink.first,progress);
      display=diagramSinkDisplay(opening,closing);
    }
    let entry=session.prepare(message.index,message.start,progress,message.position??0);
    if(display)entry={...entry,cameraFrame:display.cameraFrame,clip:{...entry.clip,camera:display.camera}};
    self.postMessage({id:message.id,type:'result',entry});
  }catch(error){self.postMessage({id:message.id,type:'error',index:(error as {stepIndex?:number}).stepIndex??message.index,message:error instanceof Error?error.message:'无法准备演示。'});}
};
