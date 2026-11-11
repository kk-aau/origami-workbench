import {appAsset} from '../app/webRuntime';
import {useCallback, useEffect, useId, useRef, useState, type KeyboardEvent} from 'react';
import type {DiagramStepAnimationClip} from '../app/diagramStepAnimation';
import {startFlatLayerReanalysis, type FlatFoldTask} from '../core/workerClient';
import {SimulatorBridge, type SimulatorStatus, type SimulationImageCapture} from '../engine/simulator';
import {simulationLayerOrder} from '../engine/simLayerOrder';
import {startSimulationStepPlanning,type SimulationStepPlanningTask} from '../engine/simStepPlanningClient';
import type {SimulationCameraPreset} from '../engine/simDisplay';
import type {SimulationStepMotion} from '../engine/simStepPath';
import './DiagramStepAnimation.css';

export interface DiagramStepAnimationProps {
  clip: DiagramStepAnimationClip;
  revision: string;
  title: string;
  onClose: () => void;
  onCapture?: (capture:SimulationImageCapture,name:string,signal?:AbortSignal) => Promise<void>;
}

const DURATION_MS = 4000;
const STABLE_STRAIN = .03;
const FOCUSABLE = 'button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,iframe,[tabindex="0"]';

function PlaybackIcon({kind}:{kind:'play'|'pause'|'replay'}) {
  return <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {kind==='play'?<path d="m7 4 9 6-9 6Z" fill="currentColor" stroke="none"/>:kind==='pause'?<><path d="M6 4v12M14 4v12" strokeWidth="3"/></>:<><path d="M4 7a6.5 6.5 0 1 1-.2 5M4 3v4h4"/></>}
  </svg>;
}

/** An isolated preview: progress is a target pose; the solver may still settle after the timeline stops. */
export default function DiagramStepAnimation({clip,revision,title,onClose,onCapture}:DiagramStepAnimationProps) {
  const dialog = useRef<HTMLElement>(null), iframe = useRef<HTMLIFrameElement>(null), bridge = useRef<SimulatorBridge|null>(null);
  const progressRef = useRef(0), playingRef = useRef(false), closeRef = useRef(onClose);
  const durationRef = useRef(DURATION_MS);
  const [progress,setProgress] = useState(0), [playing,setPlaying] = useState(false), [speed,setSpeed] = useState(1);
  const [loaded,setLoaded] = useState(false), [status,setStatus] = useState<SimulatorStatus|null>(null);
  const [camera,setCamera] = useState<SimulationCameraPreset|'free'>('isometric'), [pausedByUser,setPausedByUser] = useState(false);
  const [preparing,setPreparing]=useState('正在计算折叠路径…'),[planningError,setPlanningError]=useState<string|null>(null),[pathMethod,setPathMethod]=useState('');
  const [pathBatches,setPathBatches]=useState<NonNullable<SimulationStepMotion['batches']>>([]);
  const [pressAngle,setPressAngle]=useState<number|null>(null);
  const [pathWarnings,setPathWarnings]=useState<string[]>([]);
  const [endAngleError,setEndAngleError]=useState<number|null>(null);
  const [curvedPreview,setCurvedPreview]=useState(false);
  const [capturingImage,setCapturingImage]=useState(false),[captureError,setCaptureError]=useState('');
  const captureAbort=useRef<AbortController|null>(null);
  const titleId = useId(), descriptionId = useId();
  closeRef.current = onClose;

  const stopTimeline = useCallback(()=>{
    playingRef.current=false;
    setPlaying(false);
  },[]);
  const close = useCallback(()=>{
    captureAbort.current?.abort();captureAbort.current=null;
    stopTimeline();
    bridge.current?.send({type:'zhezhi-sim-pause'});
    closeRef.current();
  },[stopTimeline]);
  const closePreview = useRef(close);
  closePreview.current=close;

  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null, previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    dialog.current?.focus({preventScroll:true});
    const retainFocus=(event:FocusEvent)=>{
      if(event.target instanceof Node&&!dialog.current?.contains(event.target))dialog.current?.focus({preventScroll:true});
    };
    document.addEventListener('focusin',retainFocus);
    return()=>{
      document.removeEventListener('focusin',retainFocus);
      document.body.style.overflow=previousOverflow;
      if(previous?.isConnected)previous.focus({preventScroll:true});
    };
  },[]);

  useEffect(()=>{
    const frame=iframe.current;
    if(!frame)return;
    let disposed=false, frameDocument:Document|null=null, layerJob:FlatFoldTask|null=null,planningJob:SimulationStepPlanningTask|null=null;
    progressRef.current=0;
    playingRef.current=false;
    setProgress(0);setPlaying(false);setLoaded(false);setStatus(null);setPausedByUser(false);setCamera('isometric');
    setPlanningError(null);setPreparing('正在计算折叠路径…');setPathMethod('');setPathBatches([]);setPressAngle(null);setPathWarnings([]);setEndAngleError(null);setCurvedPreview(false);durationRef.current=DURATION_MS;
    captureAbort.current?.abort();captureAbort.current=null;setCapturingImage(false);setCaptureError('');
    const connection=new SimulatorBridge(frame,next=>{
      if(disposed)return;
      setStatus(next);
      if(next.view)setCamera(next.view);
      if(next.status==='loaded')setLoaded(true);
      if(next.status==='error'){
        playingRef.current=false;
        setPlaying(false);
      }
    });
    bridge.current=connection;
    planningJob=startSimulationStepPlanning(clip.fold,{...clip.animation,collisionPolicy:'allow',motionPolicy:'allow-dynamic'},{initialGeometry:clip.initialGeometry,initialContactOrder:clip.initialContactOrder,onProgress:message=>{if(!disposed)setPreparing(message);}});
    void planningJob.promise.then(result=>{
      if(disposed)return;
      setPathMethod(result.method);
      setPathWarnings(result.warnings??[]);
      setEndAngleError(result.animation.dynamic?.endAngleError??null);
      setCurvedPreview(result.animation.materialMode==='bendable');
      setPressAngle(result.animation.flex?Math.max(...result.animation.ranges.map(r=>Math.abs((r.viaAngle??r.fromAngle)-r.fromAngle)))*result.animation.flex.foldLimit:null);
      const batches=result.animation.motion?.batches??result.animation.flex?.batches?.map(batch=>({...batch,apex:(batch.start+batch.end)/2,creases:batch.edges}))??[];
      setPathBatches(batches);
      durationRef.current=DURATION_MS*Math.max(1,batches.length);
      const playbackFold=result.fold??clip.fold;
      connection.send({type:'zhezhi-sim-load',fold:playbackFold,revision,animation:result.animation});
      connection.send({type:'zhezhi-sim-colors',front:clip.colors.front,back:clip.colors.back,line:clip.colors.line});
      connection.send({type:'zhezhi-sim-view',mode:'paper'});
      connection.send(clip.camera?{type:'zhezhi-sim-camera-pose',view:clip.camera}:{type:'zhezhi-sim-camera',preset:'isometric'});
      if(result.animation.layerTimeline){
        const faceOrders=result.animation.layerTimeline.at(-1)!.faceOrders;
        const order=faceOrders.length?{sourceSignature:result.animation.sourceSignature,sourceFaceCount:clip.initialGeometry?.geometry.faces.length??clip.fold.faces_vertices!.length,faceOrders}:null;
        connection.send({type:'zhezhi-sim-layer-order',revision,state:order?'ready':'unavailable',order,
          message:order?(result.warnings?.length?'按当前可用的纸层顺序显示；过程穿模提示见本步提示。':'已沿本步实际折叠路径确认纸层顺序。'):result.animation.dynamic?'数值姿态按实际纸面深度显示，尚未确认终态层序。':'本步终态没有需要分离的重叠纸层。'});
      }else if(clip.finalGeometry){
      connection.send({type:'zhezhi-sim-layer-order',revision,state:'pending',order:null,message:'正在确认操作后的平折层序。'});
      layerJob=startFlatLayerReanalysis(clip.finalGeometry,{solutionIndex:0});
      void layerJob.promise.then(result=>{
        if(disposed)return;
        const order=simulationLayerOrder(clip.fold,result);
        connection.send({type:'zhezhi-sim-layer-order',revision,state:order?'ready':'unavailable',order,
          message:order?'已确认操作后的平折层序。':'本步尚无可用的平折层序，按当前纸面位置显示。'});
      });
      }else connection.send({type:'zhezhi-sim-layer-order',revision,state:'unavailable',order:null,message:'本步尚无对应的平折层序，按当前纸面位置显示。'});
    }).catch(error=>{if(!disposed)setPlanningError(error instanceof Error?error.message:'无法完成本步折叠路径检查。');});

    // Keyboard events inside a same-origin frame do not bubble into the surrounding dialog.
    const frameKeyDown=(event:globalThis.KeyboardEvent)=>{
      if(event.key==='Escape'){
        event.preventDefault();event.stopPropagation();closePreview.current();
      }else if(event.key==='Tab'){
        const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE)??[]),at=controls.indexOf(frame);
        if(at>=0&&controls.length){
          event.preventDefault();
          controls[(at+(event.shiftKey?-1:1)+controls.length)%controls.length]?.focus();
        }
      }
    };
    const attachFrameKeyboard=()=>{
      frameDocument?.removeEventListener('keydown',frameKeyDown,true);
      frameDocument=frame.contentDocument;
      frameDocument?.addEventListener('keydown',frameKeyDown,true);
    };
    frame.addEventListener('load',attachFrameKeyboard);
    attachFrameKeyboard();
    return()=>{
      disposed=true;
      captureAbort.current?.abort();captureAbort.current=null;
      playingRef.current=false;
      planningJob?.cancel();
      layerJob?.cancel();
      frame.removeEventListener('load',attachFrameKeyboard);
      frameDocument?.removeEventListener('keydown',frameKeyDown,true);
      connection.dispose();
      if(bridge.current===connection)bridge.current=null;
    };
  },[clip,revision]);

  useEffect(()=>{
    if(!playing||!loaded)return;
    let frameId=0, previous=performance.now(), lastMessage=0;
    const advance=(now:number)=>{
      if(!playingRef.current)return;
      const elapsed=Math.min(100,Math.max(0,now-previous));
      previous=now;
      progressRef.current=Math.min(1,progressRef.current+elapsed*speed/durationRef.current);
      if(now-lastMessage>=32||progressRef.current===1){
        setProgress(progressRef.current);
        bridge.current?.send({type:'zhezhi-sim-progress',value:progressRef.current});
        lastMessage=now;
      }
      if(progressRef.current===1){
        // Keep the solver running until it reports that this target has settled.
        playingRef.current=false;
        setPlaying(false);
      }else frameId=requestAnimationFrame(advance);
    };
    frameId=requestAnimationFrame(advance);
    const visibilityChanged=()=>{
      if(document.hidden){
        playingRef.current=false;setPlaying(false);setPausedByUser(true);
        bridge.current?.send({type:'zhezhi-sim-pause'});
      }
    };
    document.addEventListener('visibilitychange',visibilityChanged);
    return()=>{cancelAnimationFrame(frameId);document.removeEventListener('visibilitychange',visibilityChanged);};
  },[playing,loaded,speed]);

  function play(fromStart=false) {
    if(!loaded||status?.status==='error')return;
    if(fromStart||progressRef.current>=1){
      bridge.current?.send({type:'zhezhi-sim-reset'});
      progressRef.current=0;setProgress(0);
    }
    setPausedByUser(false);
    bridge.current?.send({type:'zhezhi-sim-resume'});
    playingRef.current=true;
    setPlaying(true);
  }
  function pause() {
    stopTimeline();setPausedByUser(true);
    bridge.current?.send({type:'zhezhi-sim-pause'});
  }
  function seek(value:number) {
    stopTimeline();setPausedByUser(false);
    progressRef.current=value;setProgress(value);
    bridge.current?.send({type:'zhezhi-sim-progress',value});
  }
  async function captureCurrentStep(){
    const connection=bridge.current;
    if(!onCapture||!connection||!loaded||status?.status==='error'||captureAbort.current)return;
    pause();setCaptureError('');setCapturingImage(true);
    const controller=new AbortController();captureAbort.current=controller;
    const current=()=>captureAbort.current===controller&&!controller.signal.aborted&&bridge.current===connection;
    const name=`${title||'本步折叠'} · ${Math.round(progressRef.current*100)}%`;
    try{
      const capture=await connection.captureImage({signal:controller.signal});
      if(!current())return;
      await onCapture(capture,name,controller.signal);
      if(current())close();
    }catch(error){
      if(current())setCaptureError(`截取失败：${error instanceof Error?error.message:'无法截取当前步骤，请重试。'}`);
    }finally{
      if(captureAbort.current===controller){captureAbort.current=null;setCapturingImage(false);}
    }
  }
  function keyDown(event:KeyboardEvent<HTMLElement>) {
    event.stopPropagation();
    if(event.nativeEvent.isComposing)return;
    if(event.key==='Escape'){event.preventDefault();close();}
    if(event.key==='Tab'){
      const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE)??[]),first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){
        event.preventDefault();last?.focus();
      }else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){
        event.preventDefault();first?.focus();
      }
    }
  }

  const failed=!!planningError||status?.status==='error', ready=loaded&&!failed&&!capturingImage;
  const acknowledged=status?.progress!==undefined&&Math.abs(status.progress-progress)<1e-6;
  const stable=acknowledged&&status?.status==='paused'&&typeof status.strain==='number'&&Number.isFinite(status.strain)&&status.strain<=STABLE_STRAIN;
  const targetPending=endAngleError!==null&&endAngleError>1;
  const stateText=capturingImage?'正在截取当前画面…':failed?'未能生成本步动作':!loaded?preparing:playing?'正在折叠':pausedByUser?'已暂停':progress===1?(targetPending?'预览完成（未达目标角）':stable?'本步演示完成':'等待纸面稳定'):acknowledged&&status?.status==='running'?'正在贴合此进度':progress===0?'操作前状态':'已暂停';
  const percent=Math.round(progress*100);
  const batches=pathBatches;
  const nextBatch=batches.findIndex(batch=>progress<batch.end-1e-12);
  const batchIndex=batches.length?(nextBatch<0?batches.length-1:nextBatch):0;
  const currentBatch=batches[batchIndex];
  const batchAction=progress>=1?'已完成':currentBatch?.apex===undefined?'折叠':progress<currentBatch.apex?'折下':'展开';

  return <div className="diagram-animation-backdrop" onPointerDown={event=>event.stopPropagation()}>
    <section ref={dialog} tabIndex={-1} className="diagram-animation-dialog ui-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={keyDown}>
      <header className="diagram-animation-header">
        <div><p>折序绘图 · 步骤动画</p><h2 id={titleId}>{title||'本步折叠'}</h2></div>
        <button type="button" className="diagram-animation-close" aria-label="关闭步骤动画" onClick={close}>×</button>
      </header>
      <div className="diagram-animation-viewbar">
        <span className={'diagram-animation-state'+(failed?' is-error':'')} role="status"><i aria-hidden="true"/>{stateText}{loaded&&!failed&&pathMethod&&<small className="diagram-animation-path">{pathMethod==='dynamic'?(curvedPreview?'曲面预览':'数值折叠'):pathMethod==='local-flex'?`局部柔性压痕${pressAngle===null?'':` · 峰值 ${Number(pressAngle.toFixed(1))}°`}`:pathMethod==='scheduled'?'自定义时序':pathMethod==='batched'?'自动分批':pathMethod==='coupled'?'联动折叠':pathMethod==='sequential'?'分段折叠':'同步折叠'}</small>}</span>
        <div role="group" aria-label="动画视角">{([['front','正面'],['back','背面'],['isometric','立体']] as const).map(([value,label])=><button type="button" key={value} aria-label={`动画${label}视角`} aria-pressed={camera===value} disabled={!ready} onClick={()=>{setCamera(value);bridge.current?.send({type:'zhezhi-sim-camera',preset:value});}}>{label}</button>)}</div>
      </div>
      <div className="diagram-animation-stage">
        <iframe ref={iframe} src={appAsset('simulator/index.html')} title="步骤折叠动画画布"/>
        {!loaded&&!failed&&<div className="diagram-animation-loading"><span aria-hidden="true"/><p>{preparing}</p></div>}
        {failed&&<div className="diagram-animation-error" role="alert"><strong>此步骤暂时无法演示</strong><p>{planningError||status?.error||status?.message}</p></div>}
        <span className="diagram-animation-viewhint">拖动旋转 · 滚轮缩放</span>
      </div>
      <footer className="diagram-animation-controls">
        <div className="diagram-animation-timeline-labels"><span>操作前 <strong>{clip.beforeLabel}</strong></span><output aria-label="当前动画进度">{percent}<small>%</small></output><span>操作后 <strong>{clip.afterLabel}</strong></span></div>
        <input className="diagram-animation-timeline" aria-label="步骤动画进度" aria-valuetext={`${percent}%，${clip.beforeLabel} 至 ${clip.afterLabel}`} type="range" min="0" max="1" step=".001" value={progress} disabled={!ready} onChange={event=>seek(Number(event.target.value))}/>
        {!!clip.animation.timings?.length&&<div className="diagram-animation-batches"><span>按各折痕的启动条件执行，可重叠折叠。</span></div>}
        {batches.length>1&&!clip.animation.timings?.length&&<div className="diagram-animation-batches">
          <output aria-label="当前动画子步骤">第 {batchIndex+1} / {batches.length} 批 · {batchAction}</output>
          <div role="group" aria-label="动画折叠批次">{batches.map((batch,index)=><button type="button" key={index} aria-label={`跳到第${index+1}批折叠`} aria-pressed={index===batchIndex} disabled={!ready} onClick={()=>seek(batch.start)}>{index+1}</button>)}</div>
          <span>批内并行，按批次依次执行</span>
        </div>}
        <div className="diagram-animation-playbar">
          <div className="diagram-animation-play-buttons"><button type="button" className="diagram-animation-primary" aria-label={playing?'暂停步骤动画':progress>=1?'重新播放步骤动画':'播放步骤动画'} disabled={!ready} onClick={()=>playing?pause():play()}><PlaybackIcon kind={playing?'pause':'play'}/>{playing?'暂停':'播放'}</button><button type="button" disabled={!ready} onClick={()=>play(true)} aria-label="从头重播步骤动画"><PlaybackIcon kind="replay"/>重播</button>{onCapture&&<button type="button" aria-label="截取本步图片" aria-busy={capturingImage||undefined} disabled={!ready} onClick={()=>void captureCurrentStep()}>{capturingImage?'正在截取…':'截取本步图片'}</button>}</div>
          <p id={descriptionId}>拖动进度条查看这一步的折叠过程。</p>
          <label className="diagram-animation-speed"><span>速度</span><select aria-label="步骤动画播放速度" value={speed} onChange={event=>setSpeed(Number(event.target.value))}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select></label>
        </div>
        {captureError&&<p className="diagram-animation-collision-note" role="alert">{captureError}</p>}
        {pathMethod==='dynamic'&&endAngleError!==null?<p className="diagram-animation-collision-note" role="status">{curvedPreview?'曲面':'数值'}预览 · 终点最大折角偏差 {endAngleError.toFixed(1)}°。{targetPending?'100% 表示目标进度，实际纸面尚未达到指定折角。':'实际折角已接近目标。'}</p>:pathWarnings.length>0&&<p className="diagram-animation-collision-note" role="status">本步提示见上方说明。</p>}
        {((clip.warnings?.length??0)+pathWarnings.length)>0&&<details className="diagram-animation-warnings"><summary>本步提示 · {(clip.warnings?.length??0)+pathWarnings.length}</summary><ul>{[...(clip.warnings??[]),...pathWarnings].map((warning,index)=><li key={index}>{warning}</li>)}</ul></details>}
      </footer>
    </section>
  </div>;
}
