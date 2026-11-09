import {emptyFoldResult} from '../core/flatFold';
import type {FlatFoldResult} from '../core/types';
import type {TessFlatInput,TessFlatFrame} from './tessellationFlat';
import type {FlatSide} from './flatPresentation';

/** A warm geometry worker: finish the current frame, then compute only the newest input. */
export function createTessFlatClient(onFrame:(frame:TessFlatFrame)=>void,side:()=>FlatSide=()=> 'front'){
  let worker:Worker|undefined,pending:TessFlatInput|null=null,active:{id:number;input:TessFlatInput}|null=null;
  let serial=0,closed=false,timer:ReturnType<typeof setTimeout>|undefined;
  const fail=(message:string)=>{
    const job=active;active=null;worker?.terminate();worker=undefined;clearTimeout(timer);
    if(job&&!closed)onFrame({...job,result:emptyFoldResult('error',message)});
    pump();
  };
  function pump(){
    if(closed||active||!pending)return;
    active={id:++serial,input:pending};pending=null;
    try{
      if(!worker){
        worker=new Worker(new URL('../workers/tessellationFlat.worker.ts',import.meta.url),{type:'module'});
        const origin=worker;
        worker.onmessage=({data}:{data:Pick<TessFlatFrame,'id'|'result'|'surface'>})=>{
          if(closed||worker!==origin||data.id!==active?.id)return;
          const job=active;active=null;clearTimeout(timer);onFrame({...job,result:data.result,surface:data.surface});pump();
        };
        worker.onerror=()=>{if(worker===origin)fail('平折预览线程异常，请暂停后继续。');};
      }
      worker.postMessage({...active,side:side()});
      timer=setTimeout(()=>fail('平折几何更新超时，请减小镶嵌规模。'),10000);
    }catch{fail('无法启动平折预览线程，请暂停后继续。');}
  }
  return {
    update(input:TessFlatInput){if(closed)return;pending=input;pump();},
    rememberLayers(result:FlatFoldResult){if(!closed&&result.layers.status==='solved')worker?.postMessage({type:'layers',result});},
    dispose(){closed=true;pending=null;active=null;clearTimeout(timer);worker?.terminate();worker=undefined;},
  };
}
