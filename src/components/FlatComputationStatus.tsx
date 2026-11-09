import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import type {FlatComputationStatus as Status} from '../app/flatComputationStatus';
import type {FlatComputationProgress} from '../core/flatComputationProgress';
import './FlatComputationStatus.css';

export function formatFlatComputationTime(elapsedMs:number):string{return `${(Math.max(0,elapsedMs)/1000).toFixed(1)} 秒`;}

/** Hold a different stage briefly so a quick certification/learning pass does
 * not replace the search display for a single frame. Same-stage counts remain
 * live; a terminal status never goes through this presentation delay. */
function useStableProgress(progress:FlatComputationProgress|null|undefined,active:boolean,startedAt:number|undefined){
 const [shown,setShown]=useState(progress);
 const current=useRef(progress),latest=useRef(progress);
 const pending=useRef<{stage:string|undefined;timer:ReturnType<typeof setTimeout>}|null>(null);
 const previous=useRef({active,startedAt});
 useLayoutEffect(()=>{
  latest.current=progress;
  const clear=()=>{if(pending.current){clearTimeout(pending.current.timer);pending.current=null;}};
  const show=()=>{current.current=progress;setShown(progress);};
  const newRun=active&&(!previous.current.active||startedAt!==previous.current.startedAt);
  previous.current={active,startedAt};
  if(!active||newRun||!current.current||progress?.stage===current.current.stage){clear();show();return;}
  if(pending.current?.stage===progress?.stage)return;
  clear();
  pending.current={stage:progress?.stage,timer:setTimeout(()=>{
   pending.current=null;current.current=latest.current;setShown(latest.current);
  },200)};
 },[progress,active,startedAt]);
 useEffect(()=>()=>{if(pending.current)clearTimeout(pending.current.timer);},[]);
 return active?shown:progress;
}

/** Keep the timer here so large face/edge trees do not re-render every second. */
export default function FlatComputationStatus({status,onCancel,startedAt,elapsedMs,progress:incomingProgress,children}:{status:Status;onCancel?:()=>void;startedAt?:number;elapsedMs?:number;progress?:FlatComputationProgress|null;children?:ReactNode}){
 const element=useRef<HTMLDivElement>(null);
 const [clock,setClock]=useState(()=>Date.now());
 const timing=useRef<{start?:number;end?:number}>({});
 if(status.active){
  if(timing.current.start===undefined||timing.current.end!==undefined||startedAt!==undefined&&timing.current.start!==startedAt)timing.current={start:startedAt??Date.now()};
 }else if(timing.current.start!==undefined&&timing.current.end===undefined)timing.current.end=Date.now();
 const progress=useStableProgress(incomingProgress,status.active,startedAt);
 const [motionVisible,setMotionVisible]=useState(true);
 useEffect(()=>{
  if(!status.active)return;
  setClock(Date.now());
  const timer=setInterval(()=>setClock(Date.now()),1000);
  return()=>clearInterval(timer);
 },[status.active]);
 useEffect(()=>{
  let intersecting=true;
  const update=()=>setMotionVisible(intersecting&&document.visibilityState!=='hidden');
  const observer=typeof IntersectionObserver==='undefined'?undefined:new IntersectionObserver(entries=>{intersecting=entries.some(entry=>entry.isIntersecting);update();});
  if(element.current)observer?.observe(element.current);
  document.addEventListener('visibilitychange',update);update();
  return()=>{observer?.disconnect();document.removeEventListener('visibilitychange',update);};
 },[]);
 const elapsed=Math.max(0,Math.floor((clock-(timing.current.start??clock))/1000));
 const duration=Number.isFinite(elapsedMs)&&elapsedMs!>=0?elapsedMs:timing.current.start!==undefined&&timing.current.end!==undefined?Math.max(0,timing.current.end-timing.current.start):undefined;
 const measured=status.active&&Number.isFinite(progress?.completed)&&Number.isFinite(progress?.total)&&progress!.total!>0&&progress!.completed!>=0;
 const relations=measured&&progress?.metric==='confirmed-relations';
 const fraction=measured?Math.min(1,progress!.completed!/progress!.total!):status.tone==='ready'?1:0;
 const percent=Math.floor(fraction*100),mode=status.active?(measured?'measured':'indeterminate'):status.tone==='ready'?'complete':'stopped';
 const title=status.active&&progress?.label?`计算中 · ${progress.label}`:status.title;
 const detail=status.active&&progress?.detail?progress.detail:status.detail;
 const numbers=measured?`${Math.min(progress!.completed!,progress!.total!).toLocaleString('zh-CN')} / ${progress!.total!.toLocaleString('zh-CN')}`:'';
 return <div ref={element} className={`flat-result-label flat-computation-status ${status.tone}`} data-flat-computation={status.active?'running':'finished'} data-progress-mode={mode} data-motion={status.active&&motionVisible?'running':'paused'} style={{'--flat-progress':fraction} as CSSProperties}>
  <div className="flat-computation-backdrop" aria-hidden="true"><div className="flat-computation-fill"><span className="flat-computation-sheen"/></div></div>
  <div className="flat-computation-heading"><span className="flat-computation-message" role="status" aria-live="polite">{status.active&&<i className="flat-computation-spinner" aria-hidden="true"/>}<strong>{title}</strong></span>{status.active?<span className="flat-computation-elapsed" aria-hidden="true">已用 {elapsed} 秒</span>:duration!==undefined&&<span className="flat-computation-elapsed">本次用时 {formatFlatComputationTime(duration)}</span>}{status.active&&onCancel&&<button type="button" onClick={onCancel}>停止计算</button>}</div>
  <div className="flat-computation-detail">{detail}</div>
  {children}
  {(status.active||status.tone==='ready')&&<div className="flat-computation-progress" role="progressbar" aria-label={status.active?relations?'已确定层序关系占比':`${progress?.label??'平折计算'}，本阶段进度`:'平折计算完成'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={mode==='indeterminate'?undefined:percent} aria-valuetext={mode==='indeterminate'?'正在计算，当前阶段无法预估进度':status.active?relations?`已确定 ${numbers} 组层序关系，占 ${percent}%；整体计算仍在进行`:`本阶段 ${percent}%，整体计算仍在进行`:'计算完成'}>
   <span>{measured?relations?`已确定 ${numbers} 组`:numbers:status.active?'当前阶段进度待确定':'本次计算已完成'}</span><strong>{measured?`${relations?'关系':'本阶段'} ${percent}%`:status.active?'计算中':'100%'}</strong>
  </div>}
 </div>;
}
