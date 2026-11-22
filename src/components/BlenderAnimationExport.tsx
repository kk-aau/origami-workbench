import {useEffect,useRef,useState} from 'react';
import type {BlenderAnimationSource,BlenderRenderRequest} from '../app/blenderAnimation';
import {blenderStepKey,sendAnimationToBlender} from '../app/api';
import HeaderMenu from './HeaderMenu';

type Target={documentId:string;stepId:string};
type Job={worker:Worker;controller:AbortController;committing:boolean};

export default function BlenderAnimationExport({source,target,position}:{source:BlenderAnimationSource|null;target?:Target;position?:{stepIndex:number;progress:number}}){
  const job=useRef<Job|null>(null);
  const [phase,setPhase]=useState<'idle'|'sending'|'committing'>('idle');
  const [link,setLink]=useState<{key:string;open:boolean}|null>(null),[notice,setNotice]=useState('');
  const documentId=target?.documentId,stepId=target?.stepId;
  const available=!!window.desktop?.sendAnimationToBlender;
  const status=window.desktop?.blenderStepIsOpen,linkable=!!target&&!!status;

  useEffect(()=>{
    if(!available||!documentId||!stepId||!status||phase!=='idle')return;
    let active=true,version=0;
    const key=blenderStepKey(documentId,stepId),isOpen=status;
    async function refresh(){
      if(job.current)return;
      const request=++version;
      try{
        const id=await key,open=await isOpen(id);
        if(active&&request===version&&!job.current)setLink({key:id,open});
      }catch(error){
        if(active&&request===version&&!job.current){
          setLink(null);setNotice(error instanceof Error?error.message:'无法读取 Blender 联动状态。');
        }
      }
    }
    void refresh();
    window.addEventListener('focus',refresh);
    return ()=>{active=false;window.removeEventListener('focus',refresh);};
  },[available,documentId,stepId,status,phase]);

  useEffect(()=>()=>{const current=job.current;job.current=null;current?.worker.terminate();if(!current?.committing)current?.controller.abort();},[]);
  if(!available)return null;

  function finish(current:Job,message:string){
    if(job.current!==current)return;
    current.worker.terminate();job.current=null;setPhase('idle');setNotice(message);
  }
  function cancel(){
    const current=job.current;
    if(current&&!current.committing){current.controller.abort();finish(current,'已取消动画导出。');}
  }
  function start(render?:BlenderRenderRequest){
    if(!source||job.current||linkable&&!link)return;
    try{
      const current:Job={worker:new Worker(new URL('../workers/blenderAnimation.worker.ts',import.meta.url),{type:'module'}),controller:new AbortController(),committing:false};
      job.current=current;setPhase('sending');setNotice('正在准备动画…');
      current.worker.onerror=()=>finish(current,'动画导出线程出错，请重试。');
      current.worker.onmessage=async({data})=>{
        if(job.current!==current)return;
        if(data.error){finish(current,data.error);return;}
        if(!data.blob){setNotice(data.message);return;}
        current.worker.terminate();setNotice('正在发送动画…');
        try{
          const result=await sendAnimationToBlender(data.blob,{step:link?.key,signal:current.controller.signal,onCommit:()=>{
            if(job.current!==current)return;
            current.committing=true;setPhase('committing');setNotice('等待 Blender 接收动画…');
          }});
          if(job.current!==current)return;
          if(result.status==='cancelled'){finish(current,'已取消动画导出。');return;}
          if(result.status==='linked'||result.status==='updated'){
            if(link)setLink({...link,open:true});
          }
          if(render)finish(current,'请在 Blender 窗口选择保存位置并开始渲染。');
          else finish(current,result.status==='updated'?'当前步骤已在 Blender 中更新。':result.status==='linked'?'当前步骤已连接到 Blender。':'已启动 Blender，正在载入动画。');
        }catch(error){finish(current,error instanceof Error?error.message:String(error));}
      };
      current.worker.postMessage(render?{...source,render}:source);
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      if(job.current)finish(job.current,message);else setNotice(message);
    }
  }
  const idle=phase==='idle';
  const label=idle?(link?.open?'更新到 Blender':'发送动画到 Blender'):(phase==='committing'?'正在载入…':'取消导出');
  const canSend=!!source&&(!linkable||!!link);
  return <><div className="diagram-blender-actions"><button type="button" disabled={phase==='committing'||idle&&!canSend} onClick={idle?()=>start():cancel}>{label}</button>
    <HeaderMenu label="最终渲染" align="left">
      <button type="button" disabled={!idle||!canSend||!position} onClick={()=>position&&start({kind:'png',...position})}>当前帧 PNG…</button>
      <button type="button" disabled={!idle||!canSend} onClick={()=>start({kind:'mp4'})}>动画 MP4…</button>
    </HeaderMenu>
  </div>{notice&&<small role="status">{notice}</small>}</>;
}
