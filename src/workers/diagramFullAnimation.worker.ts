import {DiagramFullAnimationSession} from '../app/diagramFullAnimation';
import type {DiagramProject} from '../app/diagramProject';
let session:DiagramFullAnimationSession|null=null;
self.onmessage=(event:MessageEvent<{type:'init';project:DiagramProject}|{type:'prepare';id:number;index:number;start:number}>)=>{
  const message=event.data;
  if(message.type==='init'){session=new DiagramFullAnimationSession(message.project);return;}
  try{
    if(!session)throw Error('全程演示尚未初始化。');
    const entry=session.prepare(message.index,message.start,(index,text)=>self.postMessage({id:message.id,type:'progress',index,message:text}));
    self.postMessage({id:message.id,type:'result',entry});
  }catch(error){self.postMessage({id:message.id,type:'error',index:(error as {stepIndex?:number}).stepIndex??message.index,message:error instanceof Error?error.message:'无法准备演示。'});}
};
