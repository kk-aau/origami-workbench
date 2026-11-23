import {useEffect,useRef,useState,type PointerEvent} from 'react';
import type {CPPreviewData,CPPreviewEdit} from './DiagramCPPreviewWindow';
import type {DiagramCPHit} from './DiagramCPInteractive';

export function useCPPopout(phase:'before'|'after',lookup:(stepId:string,previous?:CPPreviewData|null)=>CPPreviewData|null,onError:(s:string)=>void,applyEdit:(stepId:string,edit:CPPreviewEdit)=>number,onScopeHover:(stateId:string,hit:DiagramCPHit|null,selected?:boolean)=>void){
  const hoverHandler=useRef(onScopeHover);hoverHandler.current=onScopeHover;
  function clearFeedback(stateId:string){hoverHandler.current(stateId,null);hoverHandler.current(stateId,null,true);}
  const connection=useRef<{token:string;stepId:string;channel:BroadcastChannel;ready:boolean;popup:Window|null;last:CPPreviewData|null}|null>(null);
  const [detachedStep,setDetachedStep]=useState<string|null>(null);
  useEffect(()=>{
    const closed=(event:Event)=>{
      const c=connection.current;
      if(c&&(event as CustomEvent).detail===c.token){if(c.last)clearFeedback(c.last.stateId);c.ready=false;c.last=null;setDetachedStep(null);}
    };
    window.addEventListener('cp-preview-closed',closed);
    return ()=>window.removeEventListener('cp-preview-closed',closed);
  },[]);
  const editHandler=useRef(applyEdit);editHandler.current=applyEdit;
  const source=useRef(lookup);source.current=lookup;
  function publish(){
    const c=connection.current;if(!c?.ready)return;
    const data=source.current(c.stepId,c.last);
    const old=c.last;
    if(old&&(!data||(!old.scopeReason&&data.scopeReason)||old.stepId!==data.stepId||old.stateId!==data.stateId||old.sourceRevision!==data.sourceRevision||
      old.revision!==data.revision||old.generation!==data.generation))clearFeedback(old.stateId);
    if(!data){c.channel.postMessage('unavailable');c.last=null;return;}
    if(old&&old.junctions===data.junctions&&old.spatial===data.spatial&&old.scopeFaces.length===data.scopeFaces.length&&old.scopeFaces.every((face,i)=>face===data.scopeFaces[i])&&old.scopeReason===data.scopeReason&&old.sinkDrawing===data.sinkDrawing&&old.sourceRevision===data.sourceRevision&&old.historyVersion===data.historyVersion&&old.stepId===data.stepId&&old.stateId===data.stateId&&old.revision===data.revision&&old.generation===data.generation&&old.reason===data.reason&&old.doc===data.doc&&old.title===data.title&&old.adaptive===data.adaptive&&old.presentation.before===data.presentation.before&&old.presentation.pose===data.presentation.pose&&old.presentation.precreases===data.presentation.precreases){
      if(old.drawingFaceRegions!==data.drawingFaceRegions){
        c.channel.postMessage({type:'drawing-face-regions',regions:data.drawingFaceRegions,stepId:data.stepId,stateId:data.stateId,generation:data.generation,revision:data.revision});c.last=data;
      }
      return;
    }
    c.channel.postMessage({type:'preview',data});c.last=data;
  }
  useEffect(publish);
  useEffect(()=>()=>{const c=connection.current;if(c){c.channel.postMessage('close');c.channel.close();c.popup?.close();connection.current=null;}},[]);
  async function open(stepId:string){
    try{
      if(!connection.current){
        const token=crypto.randomUUID(),channel=new BroadcastChannel('diagram-cp-'+token);
        const c={token,stepId,channel,ready:false,last:null as CPPreviewData|null,popup:null as Window|null};
        channel.onmessage=({data:msg})=>{
          if(msg?.type==='preview-hover'||msg?.type==='scope-hover'||msg?.type==='preview-selection'){
            const data=source.current(c.stepId,c.last);
            const hit=msg.type==='scope-hover'?(msg.face===null?null:{kind:'face',index:msg.face}):msg.hit;
            if(c.ready&&data&&msg.stepId===c.stepId&&msg.stateId===data.stateId&&msg.revision===data.revision&&msg.sourceRevision===data.sourceRevision&&msg.generation===data.generation&&
              (hit===null||hit&&['face','edge','vertex'].includes(hit.kind)&&Number.isSafeInteger(hit.index)&&hit.index>=0))hoverHandler.current(data.stateId,hit,msg.type==='preview-selection');
            return;
          }
          if(msg?.type==='edit'||msg?.type==='undo'||msg?.type==='redo'||msg?.type==='scope'||msg?.type==='sink'){
            let error='',revision:number|undefined;
            try{if(!c.ready||msg.stepId!==c.stepId)throw Error('来源步骤已变化。');revision=editHandler.current(c.stepId,msg);}
            catch(e){error=e instanceof Error?e.message:String(e);}
            channel.postMessage({type:'edit-result',request:msg.request,error,revision});
          }
          if(msg==='ready'){c.ready=true;c.last=null;setDetachedStep(c.stepId);publish();}
          if(msg==='closed'){if(c.last)clearFeedback(c.last.stateId);c.ready=false;setDetachedStep(null);}
        };
        connection.current=c;
      }
      const c=connection.current;
      c.stepId=stepId;if(c.ready)setDetachedStep(stepId);publish();
      if(window.desktop?.documents){
        await window.desktop.documents.openCPPreview(phase,c.token);
      }else{
        if(c.popup&&!c.popup.closed){c.popup.focus();return;}
        const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('cpPreview',c.token);
        c.popup=window.open(url,'cp-'+c.token,'popup,width=620,height=640');
        if(!c.popup)throw Error('浏览器阻止了 CP 窗口，请允许此页面打开弹窗。');
      }
    }catch(error){onError(error instanceof Error?error.message:String(error));}
  }
  return {open,detachedStep};
}

export default function DiagramCPPopout({title,open}:{title:string;open:()=>void}){
  const start=useRef<{x:number;y:number;id:number}|null>(null),dragged=useRef(false);
  function release(e:PointerEvent<HTMLButtonElement>){
    if(start.current?.id===e.pointerId)start.current=null;
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  }
  return <button type="button" className="diagram-cp-popout" aria-label={'独立打开'+title} title="点击或拖出打开独立 CP 窗口"
    onPointerDown={e=>{if(e.button!==0)return;dragged.current=false;start.current={x:e.clientX,y:e.clientY,id:e.pointerId};e.currentTarget.setPointerCapture(e.pointerId);}}
    onPointerMove={e=>{const p=start.current;if(p?.id===e.pointerId&&Math.hypot(e.clientX-p.x,e.clientY-p.y)>=12){dragged.current=true;release(e);void open();}}}
    onPointerUp={release} onPointerCancel={release} onLostPointerCapture={()=>{start.current=null;}}
    onClick={e=>{if(e.detail===0||!dragged.current)void open();dragged.current=false;}}>↗</button>;
}
