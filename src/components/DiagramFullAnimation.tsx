import {appAsset} from '../app/webRuntime';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {DiagramProject} from '../app/diagramProject';
import {diagramBranchNumbering} from '../app/diagramBranches';
import {readPaperPatterns} from '../app/paperPatterns';
import type {DiagramFullAnimationEntry} from '../app/diagramFullAnimation';
import type {DiagramStepAnimationProps} from './DiagramStepAnimation';
import {startDiagramFullAnimation} from '../app/diagramFullAnimationTask';
import {sinkMotionProgress} from '../app/diagramPlaybackProgress';
import {SimulatorBridge,type SimulatorStatus} from '../engine/simulator';
import AppDialog from './AppDialog';
import BlenderAnimationExport from './BlenderAnimationExport';
import './DiagramStepAnimation.css';
import './DiagramFullAnimation.css';

type Failure={index:number;message:string};
type Playback={opening:DiagramFullAnimationEntry;closing?:DiagramFullAnimationEntry;span:number;duration:number};
type Prefetch={index:number;start:number;promise:Promise<DiagramFullAnimationEntry>};
function meshProgress(bundle:Playback,value:number){
  if(!bundle.closing)return value;
  return value<.5?sinkMotionProgress(bundle.opening.sinkPoseClock,2*value)/2:
    (1+sinkMotionProgress(bundle.closing.sinkPoseClock,2*value-1))/2;
}
type SinkPlayback={first:number;last:number;step:DiagramStepAnimationProps;operationIndex?:number;entries?:DiagramFullAnimationEntry[]};

/** One persistent viewport and an isolated, cancellable planning session. */
export default function DiagramFullAnimation({project,initialIndex,onClose,sink}:{project:DiagramProject;initialIndex:number;onClose:()=>void;sink?:SinkPlayback}){
  const first=sink?.first??0,last=sink?.last??project.steps.length-1;
  const authored=sink?.step.project??project;
  const numbering=useMemo(()=>authored.branchSteps?.length?diagramBranchNumbering(authored):undefined,[authored]);
  const stepLabel=(i:number)=>numbering?.stepLabels.get(authored.steps[i]?.id)??String(i+1);
  const cpLabel=(i:number)=>numbering?.cpLabels.get(authored.states[i]?.id)??'CP'+i;
  const [quality,setQuality]=useState<'standard'|'fine'>(sink?'fine':'standard');
  const qualityRef=useRef(quality);qualityRef.current=quality;
  const iframe=useRef<HTMLIFrameElement>(null),bridge=useRef<SimulatorBridge|null>(null);
  const trigger=useRef(document.activeElement instanceof HTMLElement?document.activeElement:null);
  const task=useRef<ReturnType<typeof startDiagramFullAnimation>|null>(null),prefetch=useRef<Prefetch|null>(null);
  const ticket=useRef(0),alive=useRef(false),closeRef=useRef(onClose);
  const position=useRef(0),running=useRef(false),startRef=useRef(first),indexRef=useRef(first),loadingRef=useRef(false);
  const desiredProgress=useRef(0),frameRef=useRef<{center:[number,number,number];radius:number}|null>(null);
  const [index,setIndex]=useState(first),[progress,setProgress]=useState(0),[playing,setPlaying]=useState(false),[loaded,setLoaded]=useState(false);
  const [preparing,setPreparing]=useState(`正在准备第 ${stepLabel(sink?.operationIndex??first)} 步…`),[failure,setFailure]=useState<Failure|null>(null);
  const [bundle,setBundle]=useState<Playback|null>(null),[status,setStatus]=useState<SimulatorStatus|null>(null);
  const [speed,setSpeed]=useState(1),[pauseSeconds,setPauseSeconds]=useState(sink?0:1),[waiting,setWaiting]=useState(false);
  const entry=bundle?.closing&&progress>=.5?bundle.closing:bundle?.opening;
  const [continuityNote,setContinuityNote]=useState(''),[seekValue,setSeekValue]=useState<number|null>(null);
  const [coloredCreases,setColoredCreases]=useState(false),[fixedInactive,setFixedInactive]=useState(false);
  const modes=useRef({coloredCreases,fixedInactive});modes.current={coloredCreases,fixedInactive};
  const captureTask=useRef<AbortController|null>(null),[capturing,setCapturing]=useState(false);
  const seekTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  closeRef.current=onClose;
  const pause=useCallback(()=>{running.current=false;setPlaying(false);setWaiting(false);bridge.current?.send({type:'zhezhi-sim-pause'});},[]);
  const cancelWork=useCallback(()=>{ticket.current++;task.current?.cancel();task.current=null;prefetch.current=null;loadingRef.current=false;},[]);

  const openStep=useCallback(async(target:number,play=false,at=0,start=startRef.current)=>{
    if(target<first||target>last||captureTask.current)return;
    const requestedPosition=target+at;
    const cached=prefetch.current;
    if(loadingRef.current||cached&&(cached.index!==target||cached.start!==start))cancelWork();
    prefetch.current=null;
    const current=++ticket.current;
    loadingRef.current=true;running.current=play;setPlaying(play);setLoaded(false);setWaiting(false);setFailure(null);setStatus(null);setBundle(null);
    indexRef.current=target;setIndex(target);setSeekValue(null);setProgress(0);position.current=0;
    startRef.current=start;setPreparing(sink?'正在准备完整沉折动画…':`正在准备第 ${stepLabel(target)} 步…`);bridge.current?.send({type:'zhezhi-sim-pause'});
    try{
      const prepare=(i:number,phase=0)=>{
        const saved=sink?.entries?.[i-first];
        if(saved)return Promise.resolve(saved);
        task.current??=startDiagramFullAnimation(project,sink?{first,last}:undefined);
        return task.current.prepare(i,start,(_,message)=>{if(alive.current&&ticket.current===current)setPreparing(message);},phase);
      };
      let beginning=sink?first:target;
      let opening=cached?.index===beginning&&cached.start===start?await cached.promise:await prepare(beginning);
      if(!alive.current||ticket.current!==current)return;
      // A request for the authored second step still opens the complete sink.
      if(!sink&&opening.opensSink===false&&opening.automaticSinkPhase===undefined&&beginning>0){
        beginning--;start=Math.min(start,beginning);startRef.current=start;opening=await prepare(beginning);
      }
      const automatic=opening.automaticSinkPhase===0;
      const closing=sink?await prepare(last):automatic?await prepare(beginning,.5):opening.opensSink?await prepare(beginning+1):undefined;
      if(!alive.current||ticket.current!==current)return;
      const span=closing&&!automatic?2:1;
      const nextBundle={opening,closing,span,duration:opening.duration+(closing?.duration??0)};
      const local=Math.min(1,Math.max(0,(requestedPosition-beginning)/span));
      position.current=local;desiredProgress.current=meshProgress(nextBundle,local);setProgress(local);
      indexRef.current=beginning;setIndex(beginning);setBundle(nextBundle);setPreparing('正在载入纸面…');
      const revision=`diagram-full:${crypto.randomUUID()}`;
      const firstCamera=!frameRef.current;frameRef.current??=opening.cameraFrame;
      const connection=bridge.current!;
      connection.send({type:'zhezhi-sim-load',revision,fold:opening.plan.fold??opening.clip.fold,animation:opening.plan.animation,
        ...(closing?{sinkContinuation:{fold:closing.plan.fold??closing.clip.fold,animation:closing.plan.animation},initialProgress:desiredProgress.current}:{})});
      connection.send({type:'zhezhi-sim-render-quality',quality:qualityRef.current});
      if(sink){
        connection.send({type:'zhezhi-sim-fixed-inactive-layers',enabled:modes.current.fixedInactive});
        connection.send({type:'zhezhi-sim-crease-style',style:modes.current.coloredCreases?'assignment':'crease'});
      }
      if(firstCamera&&opening.clip.camera)connection.send({type:'zhezhi-sim-camera-pose',view:opening.clip.camera});
      connection.send({type:'zhezhi-sim-camera-frame',revision,...frameRef.current});
      connection.send({type:'zhezhi-sim-paper-print',patterns:project.basicSettings?.paperPatterns??readPaperPatterns(project.states.find(s=>s.id===project.steps[beginning].beforeId)?.doc.metadata?.paperPatterns)});
      connection.send({type:'zhezhi-sim-colors',...opening.clip.colors});
      connection.send({type:'zhezhi-sim-view',mode:'paper'});
      const rows=opening.plan.animation.layerTimeline?.at(-1)?.faceOrders??[];
      const order=rows.length?{sourceSignature:opening.plan.animation.sourceSignature,sourceFaceCount:opening.clip.initialGeometry?.geometry.faces.length??opening.clip.fold.faces_vertices!.length,faceOrders:rows}:null;
      connection.send({type:'zhezhi-sim-layer-order',revision,state:order?'ready':'unavailable',order});
      const next=beginning+span;
      if(!sink&&task.current&&next<=last){
        const promise=task.current.prepare(next,start);void promise.catch(()=>{});
        prefetch.current={index:next,start,promise};
      }
    }catch(error){
      if(!alive.current||ticket.current!==current)return;
      loadingRef.current=false;pause();setPreparing('');
      setFailure({index:(error as {stepIndex?:number}).stepIndex??target,message:error instanceof Error?error.message:'未能生成此步骤。'});
    }
  },[project,cancelWork,pause,first,last,sink]);
  const openRef=useRef(openStep);openRef.current=openStep;

  useEffect(()=>{
    alive.current=true;
    const frame=iframe.current!;
    const connection=new SimulatorBridge(frame,next=>{
      if(!alive.current)return;setStatus(next);
      if(next.status==='loaded'){
        loadingRef.current=false;setLoaded(true);setPreparing('');
        connection.send({type:'zhezhi-sim-progress',value:desiredProgress.current});
      }else if(next.status==='error'){
        loadingRef.current=false;
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
    void openRef.current(first);
    return()=>{alive.current=false;captureTask.current?.abort();cancelWork();if(seekTimer.current)clearTimeout(seekTimer.current);frame.removeEventListener('load',attach);frameDocument?.removeEventListener('keydown',key,true);document.removeEventListener('visibilitychange',visibility);connection.dispose();bridge.current=null;requestAnimationFrame(()=>{if(!alive.current&&trigger.current?.isConnected)trigger.current.focus({preventScroll:true});});};
  },[cancelWork,pause,first]);

  useEffect(()=>{
    if(!playing||!loaded||!bundle||failure||progress>=1)return;
    let id=0,lastTick=performance.now(),sent=0;
    const tick=(now:number)=>{
      if(!running.current)return;
      position.current=Math.min(1,position.current+Math.min(100,now-lastTick)*speed/bundle.duration);lastTick=now;
      if(now-sent>=32||position.current===1){setProgress(position.current);bridge.current?.send({type:'zhezhi-sim-progress',value:meshProgress(bundle,position.current)});sent=now;}
      if(position.current<1)id=requestAnimationFrame(tick);
    };
    id=requestAnimationFrame(tick);return()=>cancelAnimationFrame(id);
  },[playing,loaded,bundle,speed,failure,progress>=1]);

  useEffect(()=>{
    if(!playing||!loaded||!bundle||progress<1||status?.status!=='paused'||(status.progress??0)<1||failure)return;
    if((status.strain??0)>.03||[bundle.opening,bundle.closing].some(e=>(e?.plan.animation.dynamic?.endAngleError??0)>1)){
      pause();setFailure({index,message:sink?'当前轨迹尚未达到保存的沉折姿态，请核对该步的目标折角与固定纸面。':'本步数值姿态尚未达到目标折角，已停止连续播放。可返回本步调整，或跳过后从下一步重新开始。'});return;
    }
    const next=index+bundle.span;
    if(next>last){pause();return;}
    setWaiting(true);
    if(pauseSeconds<0){running.current=false;setPlaying(false);return;}
    const timer=setTimeout(()=>void openRef.current(next,true),pauseSeconds*1000);
    return()=>clearTimeout(timer);
  },[playing,loaded,progress,status?.status,status?.progress,status?.strain,index,pauseSeconds,failure,bundle,pause,last,sink]);

  function showPosition(value:number){
    if(!bundle)return;
    position.current=value;setProgress(value);setSeekValue(null);
    bridge.current?.send({type:'zhezhi-sim-progress',value:meshProgress(bundle,value)});
  }
  function play(){
    if(failure)return;
    if(progress>=1&&bundle){
      const next=index+bundle.span;
      if(next>last&&index===startRef.current){showPosition(0);}
      else {void openStep(next>last?startRef.current:next,true);return;}
    }
    running.current=true;setPlaying(true);setWaiting(false);
    if(!loaded&&!preparing)void openStep(index,true);
  }
  function seek(value:number){
    if(running.current)pause();if(seekTimer.current)clearTimeout(seekTimer.current);
    if(loaded&&!failure&&bundle&&value>=index&&(value<index+bundle.span||value===last+1)){showPosition((value-index)/bundle.span);return;}
    setSeekValue(value);
    const target=Math.min(last,Math.floor(value)),at=value>=last+1?1:value-target;
    seekTimer.current=setTimeout(()=>void openStep(target,false,at,Math.min(startRef.current,target)),180);
  }
  function restart(start:number){cancelWork();frameRef.current=null;setContinuityNote('');void openStep(start,true,0,start);}
  function stop(){cancelWork();pause();setPreparing('');setLoaded(false);setFailure(null);setContinuityNote('计算已停止；点击播放可重新准备当前步骤。');}
  function skip(){if(!failure)return;const next=failure.index+1;cancelWork();frameRef.current=null;setContinuityNote(`已跳过第 ${stepLabel(failure.index)} 步；从第 ${stepLabel(next)} 步独立开始。`);void openStep(next,true,0,next);}
  async function capture(save:DiagramStepAnimationProps['onCapture']){
    const connection=bridge.current;
    if(!save||!loaded||failure||!connection||captureTask.current)return;
    const controller=new AbortController();captureTask.current=controller;
    pause();setCapturing(true);setContinuityNote('');
    try{
      const frame=await connection.captureImage({signal:controller.signal,trimTransparent:true,vectorFrame:true});
      if(controller.signal.aborted)return;
      await save(frame,`沉折 · 第 ${displayedStep} 步 · ${displayPercent}%`,controller.signal);
      if(!controller.signal.aborted)onClose();
    }catch(error){if(!controller.signal.aborted)setContinuityNote(error instanceof Error?error.message:'无法截取当前画面。');}
    finally{captureTask.current=null;if(alive.current)setCapturing(false);}
  }
  const secondHalf=!!bundle?.closing&&progress>=.5;
  const splitSteps=bundle?.span===2;
  const displayedIndex=index+(splitSteps&&secondHalf?1:0),sourceProgress=splitSteps?(progress*2-(secondHalf?1:0)):progress;
  const currentStep=project.steps[displayedIndex],complete=loaded&&progress===1&&index+(bundle?.span??1)>last&&!playing&&!failure;
  const stateText=failure?'演示已停止':preparing?preparing:waiting?(pauseSeconds<0?'本步完成，等待继续':'本步完成，稍后继续'):complete?(sink?'沉折完成':'全程演示结束'):playing?'正在播放':loaded?'已暂停':'已停止';
  const warnings=[...(entry?.clip.warnings??[]),...(entry?.plan.warnings??[])];
  const timelineLabel=sink?'沉折进度':'全程折叠进度';
  const phase=progress===1?'沉折完成':progress===.5?'撑开姿态':secondHalf?'向内沉折':'撑开纸层';
  const automaticLabel=bundle?.closing?` · ${phase}`:'';
  const displayedStep=stepLabel(sink?.operationIndex??displayedIndex),fromCP=sink?.operationIndex??first,toCP=sink?.operationIndex!==undefined?fromCP+1:last+1;
  const displayPercent=Math.round(100*(sink?progress:sourceProgress));
  const timelinePosition=seekValue??index+progress*(bundle?.span??1);
  return <AppDialog title={sink?`步骤动画 · 沉折（${cpLabel(fromCP)} → ${cpLabel(toCP)}）`:`全程折叠演示 · ${project.name}`} onClose={onClose} size="workspace" className="diagram-animation-dialog diagram-full-animation" unwrapped>
    <div className="diagram-full-heading"><div><strong>{sink?`第 ${displayedStep} 步 · ${phase}`:`第 ${displayedStep} / ${project.steps.length} 步${currentStep.title?' · '+currentStep.title:''}${automaticLabel}`}</strong><p role="status" className={failure?'is-error':''}>{stateText}</p></div><div className="diagram-full-views">
      {sink&&<><button aria-pressed={coloredCreases} disabled={!loaded} onClick={()=>{setColoredCreases(!coloredCreases);bridge.current?.send({type:'zhezhi-sim-crease-style',style:coloredCreases?'crease':'assignment'});}}>折痕样式</button>
        <button aria-pressed={fixedInactive} disabled={!loaded} onClick={()=>{setFixedInactive(!fixedInactive);bridge.current?.send({type:'zhezhi-sim-fixed-inactive-layers',enabled:!fixedInactive});}}>固定未参与纸层</button></>}
      {(['front','back','isometric'] as const).map((preset,i)=><button key={preset} disabled={!loaded||!!failure} aria-pressed={status?.view===preset} onClick={()=>bridge.current?.send({type:'zhezhi-sim-camera',preset})}>{['正面','背面','立体'][i]}</button>)}</div></div>
    <div className="diagram-animation-stage">
      <iframe ref={iframe} src={appAsset('simulator/index.html')} title={sink?'沉折步骤动画画布':'全程折叠演示画布'} inert={!loaded||!!failure} tabIndex={!loaded||failure?-1:0}/>
      {preparing&&<div className="diagram-animation-loading"><span/><p>{preparing}</p><button onClick={stop}>停止计算</button></div>}
      {!loaded&&!preparing&&!failure&&<div className="diagram-animation-loading"><p>演示已停止，点击播放可重新准备第 {displayedStep} 步。</p><button onClick={play}>重新准备</button></div>}
      {failure&&<div className="diagram-full-failure"><div className="diagram-animation-error" role="alert"><strong>第 {(sink?.operationIndex??failure.index)+1} 步暂时无法继续</strong><p>{failure.message}</p><div className="diagram-full-error-actions"><button onClick={()=>{cancelWork();void openStep(displayedIndex,false,sourceProgress);}}>重试</button>{!sink&&failure.index<last&&<button onClick={skip}>跳过此步，从下一步开始</button>}</div></div></div>}
      {!preparing&&!failure&&<div className="diagram-animation-viewhint">拖动旋转 · 滚轮缩放 · 切步保留视角</div>}
    </div>
    <footer className="diagram-animation-controls">
      {currentStep.description&&<p className="diagram-full-description">{currentStep.description}</p>}
      <div className="diagram-full-progress"><span>{sink?'沉折进度':'全程进度'}</span><output>第 {displayedStep} 步 · {displayPercent}%</output></div>
      <input className="diagram-animation-timeline" aria-label={timelineLabel} aria-valuetext={`第 ${displayedStep} 步，${displayPercent}%`} type="range" min={first} max={last+1} step="0.001" disabled={capturing||!!sink&&!loaded} value={timelinePosition} onChange={event=>seek(Number(event.target.value))}/>
      {sink?<nav className="diagram-full-steps" aria-label="沉折关键姿态">
        {[[first,'起始'],[last,'撑开姿态'],[last+1,'沉折完成']].map(([at,label])=><button key={at} aria-current={timelinePosition===at?'step':undefined} disabled={capturing||!loaded} onClick={()=>seek(Number(at))}>{label}</button>)}
      </nav>:<nav className="diagram-full-steps" aria-label="演示步骤">{project.steps.map((s,i)=><button key={s.id} aria-current={i===displayedIndex?'step':undefined} title={`第 ${stepLabel(i)} 步${s.title?` · ${s.title}`:''}`} onClick={()=>seek(i)}>{stepLabel(i)}</button>)}</nav>}
      <div className="diagram-full-playbar">
        <div className="diagram-animation-play-buttons">
          {!sink&&<button disabled={displayedIndex===first} onClick={()=>seek(displayedIndex-1)}>上一步</button>}
          <button className="diagram-animation-primary" disabled={!!failure||capturing||!!sink&&!!preparing} onClick={playing?pause:play}>{playing?'暂停':waiting?'继续下一步':complete?'重播':'播放'}</button>
          {sink?<>{!complete&&<button disabled={capturing||!loaded} onClick={()=>{showPosition(0);running.current=true;setPlaying(true);}}>重播</button>}
            {sink.step.onCapture&&<button disabled={!loaded||!!failure||capturing} onClick={()=>void capture(sink.step.onCapture)}>截取本步图片</button>}
            {sink.step.onCaptureFigure&&<button disabled={!loaded||!!failure||capturing} onClick={()=>void capture(sink.step.onCaptureFigure)}>存为过程图</button>}</>
            :<button disabled={displayedIndex===last} onClick={()=>{if(splitSteps&&!secondHalf)showPosition(.5);else void openStep(displayedIndex+1);}}>下一步</button>}
        </div>
        {!sink&&<label>渲染<select aria-label="全程演示渲染方式" value={quality} onChange={e=>{const mode=e.target.value==='fine'?'fine':'standard';setQuality(mode);qualityRef.current=mode;bridge.current?.send({type:'zhezhi-sim-render-quality',quality:mode});}}><option value="standard">标准渲染</option><option value="fine">精细渲染</option></select></label>}
        <label>速度<select aria-label={sink?'沉折动画播放速度':'全程演示播放速度'} value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[.5,1,2].map(v=><option key={v} value={v}>{v}×</option>)}</select></label>
        {!sink&&<label>步间停顿<select aria-label="步间停顿" value={pauseSeconds} onChange={e=>setPauseSeconds(Number(e.target.value))}><option value="0">不停顿</option><option value="0.5">0.5 秒</option><option value="1">1 秒</option><option value="2">2 秒</option><option value="-1">手动继续</option></select></label>}
        {!sink&&<div className="diagram-full-start"><button onClick={()=>restart(0)}>从头播放</button><button onClick={()=>restart(initialIndex)}>从第 {stepLabel(initialIndex)} 步播放</button></div>}
      </div>
      <BlenderAnimationExport source={{project,speed,pauseSeconds,...(sink?{range:{first,last},viewStep:last,view:sink.entries?.[0]?.clip.camera,operationIndex:sink.operationIndex}:{})}} position={loaded&&!failure?{stepIndex:displayedIndex,progress:sourceProgress}:undefined} target={sink?{documentId:sink.step.blenderDocumentId,stepId:sink.step.stepId}:undefined}/>
      {continuityNote&&<p className="diagram-full-note" role="status">{continuityNote}</p>}
      {warnings.length>0&&<details className="diagram-animation-warnings"><summary>本步提示 · {warnings.length}</summary><ul>{warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></details>}
    </footer>
  </AppDialog>;
}
