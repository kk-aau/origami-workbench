import {appAsset} from '../app/webRuntime';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {DiagramProject} from '../app/diagramProject';
import type {DiagramFullAnimationEntry} from '../app/diagramFullAnimation';
import {startDiagramFullAnimation} from '../app/diagramFullAnimationTask';
import {SimulatorBridge,type SimulatorStatus} from '../engine/simulator';
import AppDialog from './AppDialog';
import './DiagramStepAnimation.css';
import './DiagramFullAnimation.css';

type Failure={index:number;message:string};
type Prefetch={index:number;start:number;promise:Promise<DiagramFullAnimationEntry>;settled:boolean};

/** One persistent viewport and an isolated, cancellable planning session. */
export default function DiagramFullAnimation({project,initialIndex,onClose}:{project:DiagramProject;initialIndex:number;onClose:()=>void}){
  const iframe=useRef<HTMLIFrameElement>(null),bridge=useRef<SimulatorBridge|null>(null);
  const trigger=useRef(document.activeElement instanceof HTMLElement?document.activeElement:null);
  const task=useRef<ReturnType<typeof startDiagramFullAnimation>|null>(null),prefetch=useRef<Prefetch|null>(null);
  const ticket=useRef(0),alive=useRef(false),closeRef=useRef(onClose);
  const position=useRef(0),running=useRef(false),startRef=useRef(0),indexRef=useRef(0),loadingRef=useRef(false);
  const desiredProgress=useRef(0),revisionRef=useRef(''),frameRef=useRef<{center:[number,number,number];radius:number}|null>(null);
  const [index,setIndex]=useState(0),[progress,setProgress]=useState(0),[playing,setPlaying]=useState(false),[loaded,setLoaded]=useState(false);
  const [preparing,setPreparing]=useState('正在准备第 1 步…'),[failure,setFailure]=useState<Failure|null>(null);
  const [entry,setEntry]=useState<DiagramFullAnimationEntry|null>(null),[status,setStatus]=useState<SimulatorStatus|null>(null);
  const [speed,setSpeed]=useState(1),[pauseSeconds,setPauseSeconds]=useState(1),[waiting,setWaiting]=useState(false);
  const [continuityNote,setContinuityNote]=useState(''),[seekValue,setSeekValue]=useState<number|null>(null);
  const seekTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  closeRef.current=onClose;
  const pause=useCallback(()=>{running.current=false;setPlaying(false);setWaiting(false);bridge.current?.send({type:'zhezhi-sim-pause'});},[]);
  const cancelWork=useCallback(()=>{ticket.current++;task.current?.cancel();task.current=null;prefetch.current=null;loadingRef.current=false;},[]);

  const openStep=useCallback(async(target:number,play=false,at=0,start=startRef.current)=>{
    if(target<0||target>=project.steps.length)return;
    // A new navigation supersedes an unfinished request. Do not queue a whole
    // project behind rapid slider gestures or an irrelevant prefetch.
    const cached=prefetch.current;
    if((loadingRef.current||cached&&!cached.settled)&&!(cached?.index===target&&cached.start===start))cancelWork();
    const current=++ticket.current;
    loadingRef.current=true;running.current=play;setPlaying(play);setLoaded(false);setWaiting(false);setFailure(null);setStatus(null);setEntry(null);
    indexRef.current=target;setIndex(target);position.current=at;desiredProgress.current=at;setProgress(at);setSeekValue(null);
    startRef.current=start;setPreparing(`正在准备第 ${target+1} 步…`);bridge.current?.send({type:'zhezhi-sim-pause'});
    try{
      task.current??=startDiagramFullAnimation(project);
      const result=await (cached?.index===target&&cached.start===start?cached.promise:task.current.prepare(target,start,(i,message)=>{if(alive.current&&ticket.current===current)setPreparing(`第 ${i+1} 步 · ${message}`);}));
      if(!alive.current||ticket.current!==current)return;
      prefetch.current=null;loadingRef.current=false;setEntry(result);setPreparing('正在载入纸面…');
      const revision=`diagram-full:${crypto.randomUUID()}`;revisionRef.current=revision;
      frameRef.current??=result.cameraFrame;
      const connection=bridge.current!;
      connection.send({type:'zhezhi-sim-load',revision,fold:result.plan.fold??result.clip.fold,animation:result.plan.animation});
      connection.send({type:'zhezhi-sim-camera-frame',revision,...frameRef.current});
      connection.send({type:'zhezhi-sim-colors',...result.clip.colors});
      connection.send({type:'zhezhi-sim-view',mode:'paper'});
      const rows=result.plan.animation.layerTimeline?.at(-1)?.faceOrders??[];
      const order=rows.length?{sourceSignature:result.plan.animation.sourceSignature,sourceFaceCount:result.clip.initialGeometry?.geometry.faces.length??result.clip.fold.faces_vertices!.length,faceOrders:rows}:null;
      connection.send({type:'zhezhi-sim-layer-order',revision,state:order?'ready':'unavailable',order});
      if(target+1<project.steps.length){
        const promise=task.current.prepare(target+1,start);
        // Failure belongs to the next step; preserve playback of this step.
        const pending={index:target+1,start,promise,settled:false};
        void promise.then(()=>{pending.settled=true;},()=>{pending.settled=true;});prefetch.current=pending;
      }
    }catch(error){
      if(!alive.current||ticket.current!==current)return;
      loadingRef.current=false;pause();setPreparing('');
      setFailure({index:(error as {stepIndex?:number}).stepIndex??target,message:error instanceof Error?error.message:'未能生成此步骤。'});
    }
  },[project,cancelWork,pause]);
  const openRef=useRef(openStep);openRef.current=openStep;

  useEffect(()=>{
    alive.current=true;
    const frame=iframe.current!;
    const connection=new SimulatorBridge(frame,next=>{
      if(!alive.current)return;setStatus(next);
      if(next.status==='loaded'){
        setLoaded(true);setPreparing('');
        connection.send({type:'zhezhi-sim-progress',value:desiredProgress.current});
      }else if(next.status==='error'){
        pause();setFailure({index:indexRef.current,message:next.error??next.message});setPreparing('');
      }
    });
    bridge.current=connection;
    let frameDocument:Document|null=null;
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();closeRef.current();}
      if(event.key==='Tab'){
        const dialog=frame.closest('dialog'),controls=Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),iframe,summary')??[]),i=controls.indexOf(frame);
        if(i>=0){event.preventDefault();controls[(i+(event.shiftKey?-1:1)+controls.length)%controls.length]?.focus();}
      }
    };
    const attach=()=>{frameDocument?.removeEventListener('keydown',key,true);frameDocument=frame.contentDocument;frameDocument?.addEventListener('keydown',key,true);};
    frame.addEventListener('load',attach);attach();
    const visibility=()=>{if(document.hidden)pause();};document.addEventListener('visibilitychange',visibility);
    void openRef.current(0);
    return()=>{alive.current=false;cancelWork();if(seekTimer.current)clearTimeout(seekTimer.current);frame.removeEventListener('load',attach);frameDocument?.removeEventListener('keydown',key,true);document.removeEventListener('visibilitychange',visibility);connection.dispose();bridge.current=null;requestAnimationFrame(()=>{if(!alive.current&&trigger.current?.isConnected)trigger.current.focus({preventScroll:true});});};
  },[cancelWork,pause]);

  useEffect(()=>{
    if(!playing||!loaded||!entry||failure||progress>=1)return;
    let id=0,last=performance.now(),sent=0;
    const tick=(now:number)=>{
      if(!running.current)return;
      position.current=Math.min(1,position.current+Math.min(100,now-last)*speed/entry.duration);last=now;
      if(now-sent>=32||position.current===1){setProgress(position.current);bridge.current?.send({type:'zhezhi-sim-progress',value:position.current});sent=now;}
      if(position.current<1)id=requestAnimationFrame(tick);
    };
    id=requestAnimationFrame(tick);return()=>cancelAnimationFrame(id);
  },[playing,loaded,entry,speed,failure,progress>=1]);

  useEffect(()=>{
    if(!playing||!loaded||progress<1||status?.status!=='paused'||(status.progress??0)<1||failure)return;
    if((status.strain??0)>.03||(entry?.plan.animation.dynamic?.endAngleError??0)>1){
      pause();setFailure({index,message:'本步数值姿态尚未达到目标折角，已停止连续播放。可返回本步调整，或跳过后从下一步重新开始。'});return;
    }
    if(index===project.steps.length-1){pause();return;}
    setWaiting(true);
    if(pauseSeconds<0){running.current=false;setPlaying(false);return;}
    const timer=setTimeout(()=>void openRef.current(index+1,true),pauseSeconds*1000);
    return()=>clearTimeout(timer);
  },[playing,loaded,progress,status?.status,status?.progress,status?.strain,index,pauseSeconds,failure,entry,pause,project.steps.length]);

  function play(){
    if(failure)return;
    if(progress>=1){void openStep(index===project.steps.length-1?startRef.current:index+1,true);return;}
    running.current=true;setPlaying(true);setWaiting(false);
    if(!loaded&&!preparing)void openStep(index,true,progress);
    else bridge.current?.send({type:'zhezhi-sim-progress',value:progress});
  }
  function seek(value:number){
    pause();setSeekValue(value);if(seekTimer.current)clearTimeout(seekTimer.current);
    const target=Math.min(project.steps.length-1,Math.floor(value)),at=value>=project.steps.length?1:value-target;
    if(target===index&&loaded&&!failure){position.current=at;setProgress(at);setSeekValue(null);bridge.current?.send({type:'zhezhi-sim-progress',value:at});}
    else seekTimer.current=setTimeout(()=>void openStep(target,false,at,Math.min(startRef.current,target)),180);
  }
  function restart(start:number){cancelWork();frameRef.current=null;setContinuityNote('');void openStep(start,true,0,start);}
  function stop(){cancelWork();pause();setPreparing('');setLoaded(false);setFailure(null);setContinuityNote('计算已停止；点击播放可重新准备当前步骤。');}
  function skip(){if(!failure)return;const next=failure.index+1;cancelWork();frameRef.current=null;setContinuityNote(`已跳过第 ${failure.index+1} 步；从第 ${next+1} 步独立开始。`);void openStep(next,true,0,next);}
  const currentStep=project.steps[index],complete=loaded&&progress===1&&index===project.steps.length-1&&!playing&&!failure;
  const stateText=failure?'演示已停止':preparing?preparing:waiting?(pauseSeconds<0?'本步完成，等待继续':'本步完成，稍后继续'):complete?'全程演示结束':playing?'正在播放':loaded?'已暂停':'已停止';
  const warnings=[...(entry?.clip.warnings??[]),...(entry?.plan.warnings??[])];
  return <AppDialog title={`全程折叠演示 · ${project.name}`} onClose={onClose} size="workspace" className="diagram-animation-dialog diagram-full-animation" unwrapped>
    <div className="diagram-full-heading"><div><strong>第 {index+1} / {project.steps.length} 步{currentStep.title?` · ${currentStep.title}`:''}</strong><p role="status" className={failure?'is-error':''}>{stateText}</p></div><div className="diagram-full-views">{(['front','back','isometric'] as const).map((preset,i)=><button key={preset} disabled={!loaded||!!failure} aria-pressed={status?.view===preset} onClick={()=>bridge.current?.send({type:'zhezhi-sim-camera',preset})}>{['正面','背面','立体'][i]}</button>)}</div></div>
    <div className="diagram-animation-stage">
      <iframe ref={iframe} src={appAsset('simulator/index.html')} title="全程折叠演示画布" inert={!loaded||!!failure} tabIndex={!loaded||failure?-1:0}/>
      {preparing&&<div className="diagram-animation-loading"><span/><p>{preparing}</p><button onClick={stop}>停止计算</button></div>}
      {!loaded&&!preparing&&!failure&&<div className="diagram-animation-loading"><p>演示已停止，点击播放可重新准备第 {index+1} 步。</p><button onClick={play}>重新准备</button></div>}
      {failure&&<div className="diagram-full-failure"><div className="diagram-animation-error" role="alert"><strong>第 {failure.index+1} 步暂时无法继续</strong><p>{failure.message}</p><div className="diagram-full-error-actions"><button onClick={()=>{cancelWork();void openStep(index,false,progress);}}>重试</button>{failure.index+1<project.steps.length&&<button onClick={skip}>跳过此步，从下一步开始</button>}</div></div></div>}
      {!preparing&&!failure&&<div className="diagram-animation-viewhint">拖动旋转 · 滚轮缩放 · 切步保留视角</div>}
    </div>
    <footer className="diagram-animation-controls">
      {currentStep.description&&<p className="diagram-full-description">{currentStep.description}</p>}
      <div className="diagram-full-progress"><span>全程进度</span><output>第 {index+1} 步 · {Math.round(progress*100)}%</output></div>
      <input className="diagram-animation-timeline" aria-label="全程折叠进度" aria-valuetext={`第 ${index+1} 步，${Math.round(progress*100)}%`} type="range" min="0" max={project.steps.length} step="0.001" value={seekValue??index+progress} onChange={event=>seek(Number(event.target.value))}/>
      <nav className="diagram-full-steps" aria-label="演示步骤">{project.steps.map((s,i)=><button key={s.id} aria-current={i===index?'step':undefined} title={`第 ${i+1} 步${s.title?` · ${s.title}`:''}`} onClick={()=>void openStep(i,false,0,Math.min(startRef.current,i))}>{i+1}</button>)}</nav>
      <div className="diagram-full-playbar"><div className="diagram-animation-play-buttons"><button disabled={index===0} onClick={()=>void openStep(index-1,false,0,Math.min(startRef.current,index-1))}>上一步</button><button className="diagram-animation-primary" disabled={!!failure} onClick={playing?pause:play}>{playing?'暂停':waiting?'继续下一步':complete?'重播':'播放'}</button><button disabled={index===project.steps.length-1} onClick={()=>void openStep(index+1)}>下一步</button></div><label>速度<select aria-label="全程演示播放速度" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[.5,1,2].map(v=><option key={v} value={v}>{v}×</option>)}</select></label><label>步间停顿<select aria-label="步间停顿" value={pauseSeconds} onChange={e=>setPauseSeconds(Number(e.target.value))}><option value="0">不停顿</option><option value="0.5">0.5 秒</option><option value="1">1 秒</option><option value="2">2 秒</option><option value="-1">手动继续</option></select></label><div className="diagram-full-start"><button onClick={()=>restart(0)}>从头播放</button><button onClick={()=>restart(initialIndex)}>从第 {initialIndex+1} 步播放</button></div></div>
      {continuityNote&&<p className="diagram-full-note" role="status">{continuityNote}</p>}
      {warnings.length>0&&<details className="diagram-animation-warnings"><summary>本步提示 · {warnings.length}</summary><ul>{warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></details>}
    </footer>
  </AppDialog>;
}
