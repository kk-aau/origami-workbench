import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {installProjectFileDrop} from '../app/projectFileDrop';

export default function ProjectFileDrop({onOpen,onError}:{onOpen:(file:File,signal:AbortSignal)=>Promise<unknown>;onError:(message:string)=>void}){
  const callbacks=useRef({onOpen,onError});callbacks.current={onOpen,onError};
  const [hover,setHover]=useState(false),[opening,setOpening]=useState('');
  useEffect(()=>{
    const controller=new AbortController(),frames=new Map<HTMLIFrameElement,()=>void>(),windows=new Map<Window,()=>void>();
    let queue=Promise.resolve();
    const report=(message:string)=>{if(!controller.signal.aborted)callbacks.current.onError(message);};
    const receive=(files:File[])=>{
      for(const file of files)queue=queue.then(async()=>{
        if(controller.signal.aborted)return;
        setOpening(file.name);
        try{await callbacks.current.onOpen(file,controller.signal);}
        catch(error){if(!controller.signal.aborted)report(`${file.name}：${error instanceof Error?error.message:String(error)}`);}
        finally{if(!controller.signal.aborted)setOpening('');}
      });
    };
    const attach=(target:Window)=>{
      if(windows.has(target))return;
      try{windows.set(target,installProjectFileDrop(target,receive,setHover,report));}catch{/* Foreign frames do not share the application file entry. */}
    };
    attach(window);
    // Same-origin simulator canvases have their own event tree. Register again
    // after navigation so dropping an app project there also uses this entry.
    const scan=()=>{
      for(const [frame,off] of frames)if(!frame.isConnected){off();frames.delete(frame);}
      for(const frame of document.querySelectorAll('iframe'))if(!frames.has(frame)){
        let cleanup:(()=>void)|undefined;
        const load=()=>{cleanup?.();cleanup=undefined;try{
          const target=frame.contentWindow;if(target&&target.document){cleanup=installProjectFileDrop(target,receive,setHover,report);}
        }catch{/* External frames are intentionally not accessed. */}};
        frame.addEventListener('load',load);load();frames.set(frame,()=>{frame.removeEventListener('load',load);cleanup?.();});
      }
    };
    const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});scan();
    return()=>{controller.abort();observer.disconnect();for(const off of windows.values())off();for(const off of frames.values())off();};
  },[]);
  if(!hover&&!opening)return null;
  return createPortal(<div role="status" aria-live="polite" data-project-file-drop style={{position:'fixed',inset:12,zIndex:10000,pointerEvents:'none',border:hover?'2px dashed #426d59':undefined,background:hover?'#f0f6f0e8':undefined,display:'flex',alignItems:hover?'center':'flex-start',justifyContent:'center',padding:20}}>
    <span style={{padding:'14px 24px',background:'#fff',color:'#293d35',border:'1px solid #bdd0c1',borderRadius:8,boxShadow:'0 2px 12px #0002'}}>{opening?`正在打开 ${opening}…`:'松开即可打开文件，自动进入对应工作区'}</span>
  </div>,document.body);
}
