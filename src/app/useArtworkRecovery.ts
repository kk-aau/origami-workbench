import {useCallback,useEffect,useRef,useState} from 'react';
import {createArtworkRecoveryStore,type ArtworkRecoverySummary} from './artworkRecovery';
import {nextArtworkRecoveryScope} from './documentRuntime';

/** A separate record for each window/document scope. Never overwrite another
 * window's recovery, or the previous project's snapshot after switching. */
export function useArtworkRecovery({scope,documentId=null,enabled,changeKey,capture,periodic=false}:{scope:number;documentId?:string|null;enabled:boolean;changeKey:unknown;capture:()=>Promise<string|null>;periodic?:boolean}){
  const [store]=useState(createArtworkRecoveryStore);
  const current=useRef({scope,enabled,capture});current.current={scope,enabled,capture};
  const record=useRef(nextArtworkRecoveryScope(undefined,scope,documentId));
  record.current=nextArtworkRecoveryScope(record.current,scope,documentId);
  const task=useRef<Promise<boolean>|null>(null),alive=useRef(true),changed=useRef(0),checkpointed=useRef(-1),captureDeferred=useRef(false);
  const [entries,setEntries]=useState<ArtworkRecoverySummary[]>([]),[warnings,setWarnings]=useState<string[]>([]);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[listing,setListing]=useState(false),[updated,setUpdated]=useState(''),[pending,setPending]=useState(true);
  const listTicket=useRef(0);
  const refresh=useCallback(async(cachedOnly=false)=>{
    const ticket=++listTicket.current;if(!cachedOnly)setListing(true);
    try{const result=await store.list(cachedOnly);if(alive.current&&ticket===listTicket.current){setEntries(result.entries);setWarnings(result.warnings);}}
    catch(error){if(alive.current&&ticket===listTicket.current&&!cachedOnly)setError(error instanceof Error?error.message:String(error));}
    finally{if(alive.current&&ticket===listTicket.current)setListing(false);}
  },[store]);
  const checkpoint=useCallback(async():Promise<boolean>=>{
    // A queued request must capture the latest scope after the old write, not
    // report an unrelated in-flight snapshot as this caller's successful save.
    if(task.current){await task.current;return checkpoint();}
    if(!current.current.enabled)return false;
    const target=record.current,generation=changed.current;
    const work=(async()=>{
      captureDeferred.current=false;
      if(alive.current)setBusy(true);
      try{
        const text=await current.current.capture();
        if(record.current!==target||!alive.current)return false;
        if(text===null){captureDeferred.current=true;return false;}
        if(text===target.owner.text){checkpointed.current=generation;setPending(changed.current!==generation);setError('');return true;}
        const summary=await store.save({id:target.owner.id,expectedRevision:target.owner.revision,text});
        target.owner.revision=summary.revision;target.owner.text=text;checkpointed.current=generation;
        if(alive.current){setEntries(items=>[summary,...items.filter(item=>item.id!==summary.id)]);if(record.current===target){setUpdated(summary.updated);setPending(changed.current!==generation);setError('');}}
        return true;
      }catch(error){if(alive.current&&record.current===target){setError(error instanceof Error?error.message:String(error));setPending(true);}return false;}
      finally{if(alive.current)setBusy(false);}
    })();task.current=work;
    try{return await work;}finally{if(task.current===work)task.current=null;}
  },[store]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{void refresh(true);},[refresh]);
  useEffect(()=>{setUpdated('');setPending(true);setError('');},[scope]);
  useEffect(()=>{
    const generation=++changed.current;setPending(true);
    if(!enabled)return;
    let live=true,timer:ReturnType<typeof setTimeout>;
    const attempt=async()=>{
      if(!live||changed.current!==generation||checkpointed.current===generation)return;
      const saved=await checkpoint();
      // A gesture or running calculation can defer capture. Retry only this
      // pending content event, then stop; static drawings have no polling loop.
      if(live&&!saved&&captureDeferred.current&&changed.current===generation)timer=setTimeout(()=>void attempt(),1000);
    };
    timer=setTimeout(()=>void attempt(),1800);
    return()=>{live=false;clearTimeout(timer);};
  },[enabled,scope,changeKey,checkpoint]);
  useEffect(()=>{
    if(!enabled)return;
    // Only a live simulation changes without a content event. Static drawing
    // browsing must not repeatedly capture the complete project.
    const timer=periodic?setInterval(()=>void checkpoint(),20000):undefined;
    const hide=()=>{if(document.hidden&&(periodic||changed.current!==checkpointed.current))void checkpoint();};document.addEventListener('visibilitychange',hide);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',hide);};
  },[enabled,periodic,checkpoint]);
  const remove=async(entry:ArtworkRecoverySummary)=>{
    if(entry.id===record.current.owner.id)throw new Error('当前窗口的恢复副本正在使用，请先切换作品再删除。');
    await store.remove(entry.id,entry.revision);await refresh();
  };
  return {entries,warnings,error,busy,listing,updated,pending,checkpoint,refresh,remove,load:store.load,currentId:record.current.owner.id};
}
