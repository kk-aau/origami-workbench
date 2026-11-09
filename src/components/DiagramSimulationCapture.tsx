import {appAsset} from '../app/webRuntime';
import {useEffect,useMemo,useRef,useState} from 'react';
import type {Doc} from '../core/types';
import {defaultModelColors,type ModelColors} from '../app/modelColors';
import {startDiagramAngleTask} from '../app/diagramAngleTask';
import {diagramSimulationProgress} from '../app/diagramSimulationGraph';
import {preferenceStorage} from '../app/preferenceStorage';
import type {DiagramSimulationAngleOptions} from '../app/diagramSimulationAngles';
import type {SimulationPose} from '../engine/simPose';
import {SimulatorBridge,type SimulationImageCapture,type SimulatorStatus} from '../engine/simulator';
import {startSimulationEndpointLayers} from '../engine/simEndpointLayersClient';
import AppDialog from './AppDialog';
import SimulationControls from './SimulationControls';
import './DiagramSimulationCapture.css';

const CLOSURE_CHECK_KEY='zhezhi.diagram-simulation-strict-closure.v1';


export interface DiagramSimulationCaptureProps {
  before:Doc;after:Doc;title:string;onClose:()=>void;
  colors?:ModelColors;
  onApplyAngles?:(pose:SimulationPose,signal:AbortSignal,options:DiagramSimulationAngleOptions)=>Promise<void>;
  onApplySurface?:(pose:SimulationPose,signal:AbortSignal,colors:ModelColors)=>Promise<void>;
  onCapture:(capture:SimulationImageCapture,name:string,signal?:AbortSignal)=>Promise<void>;
}

/** This simulator owns its document and camera; it never changes the main CP. */
export default function DiagramSimulationCapture({before,after,title,onClose,onCapture,onApplyAngles,onApplySurface,colors=defaultModelColors()}:DiagramSimulationCaptureProps){
  const iframe=useRef<HTMLIFrameElement>(null),bridge=useRef<SimulatorBridge|null>(null),captureAbort=useRef<AbortController|null>(null);
  const mounted=useRef(false),revision=useRef(0),loadedRef=useRef(false),callbacks=useRef({onClose,onCapture,onApplyAngles,onApplySurface});callbacks.current={onClose,onCapture,onApplyAngles,onApplySurface};
  const capturedColors=useRef(colors);
  const [source,setSource]=useState<'before'|'after'>(onApplyAngles?'after':'before'),[frameKey,setFrameKey]=useState(0),[progress,setProgress]=useState(0);
  const [status,setStatus]=useState<SimulatorStatus|null>(null),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [transparent,setTransparent]=useState(true);
  const [strictClosure,setStrictClosure]=useState(()=>{try{return preferenceStorage.getItem(CLOSURE_CHECK_KEY)!=='false';}catch{return true;}}),[settingNotice,setSettingNotice]=useState('');
  const sourceLabel=source==='before'?'操作前':'操作后';
  // Project updates may clone an unchanged CP while the captured image is
  // being inserted. Only a real source change should abort that insertion.
  const sourceSignature=useMemo(()=>JSON.stringify(source==='before'?before:after),[source,before,after]);

  useEffect(()=>{
    mounted.current=true;
    return()=>{mounted.current=false;captureAbort.current?.abort();};
  },[]);
  useEffect(()=>{
    const frame=iframe.current;if(!frame)return;
    let disposed=false,frameDocument:Document|null=null;
    const connection=new SimulatorBridge(frame,next=>{
      if(disposed)return;
      setStatus(next);
      if(next.status==='loaded'){
        loadedRef.current=true;setLoaded(true);setError('');
      }else if(next.status==='error'){
        loadedRef.current=false;setLoaded(false);setError(next.error||next.message||'三维模型载入失败，请重新载入。');
      }else if(next.status==='ready'&&next.revision===undefined){loadedRef.current=false;setLoaded(false);}
    });
    bridge.current=connection;
    const frameKeyDown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){
        event.preventDefault();event.stopPropagation();
        if(!captureAbort.current)callbacks.current.onClose();
      }
    };
    const attachFrameKeyboard=()=>{
      frameDocument?.removeEventListener('keydown',frameKeyDown,true);frameDocument=frame.contentDocument;
      frameDocument?.addEventListener('keydown',frameKeyDown,true);
    };
    frame.addEventListener('load',attachFrameKeyboard);attachFrameKeyboard();
    return()=>{
      disposed=true;captureAbort.current?.abort();connection.dispose();
      frame.removeEventListener('load',attachFrameKeyboard);frameDocument?.removeEventListener('keydown',frameKeyDown,true);
      if(bridge.current===connection)bridge.current=null;
    };
  },[frameKey]);
  useEffect(()=>{
    captureAbort.current?.abort();captureAbort.current=null;loadedRef.current=false;
    setBusy(false);setLoaded(false);setStatus(null);setProgress(0);setError('');
    const current=++revision.current;
    let layers:ReturnType<typeof startSimulationEndpointLayers>|undefined;
    const solve=startDiagramAngleTask(source==='before'?before:after);
    solve.promise.then(graph=>{
      if(revision.current!==current)return;
      const initial=diagramSimulationProgress(graph);setProgress(initial*100);
      bridge.current?.send({type:'zhezhi-sim-load',fold:graph,revision:current,mesh:'original',limitFoldAngles:false});
      bridge.current?.send({type:'zhezhi-sim-progress',value:initial});
      layers=startSimulationEndpointLayers(graph);
      layers.promise.then(order=>{
        if(revision.current!==current)return;
        bridge.current?.send({type:'zhezhi-sim-layer-order',revision:current,order,state:order?'ready':'unavailable',message:order?'平折显示层序已确认。':'当前目标没有可用的平折显示层序，按实际深度显示。'});
      }).catch(failure=>{
        if(revision.current!==current)return;
        bridge.current?.send({type:'zhezhi-sim-layer-order',revision:current,order:null,state:'unavailable',message:failure instanceof Error?failure.message:'平折显示层序确认失败。'});
      });
    }).catch(failure=>{if(revision.current===current)setError(failure instanceof Error?failure.message:'无法生成三维模型。');});
    return()=>{revision.current++;solve.cancel();layers?.cancel();captureAbort.current?.abort();};
  },[source,sourceSignature,frameKey]);

  function seek(value:number){setProgress(value);bridge.current?.send({type:'zhezhi-sim-progress',value:value/100});}
  function reset(){setProgress(0);bridge.current?.send({type:'zhezhi-sim-reset'});}
  async function capture(){
    const connection=bridge.current;if(!connection||!loadedRef.current||captureAbort.current)return;
    const controller=new AbortController();captureAbort.current=controller;setBusy(true);setError('');
    try{
      const image=await connection.captureImage({scale:1,transparent,signal:controller.signal});
      if(controller.signal.aborted||!mounted.current)return;
      await callbacks.current.onCapture(image,`${title} · ${sourceLabel}三维图`,controller.signal);
      if(!controller.signal.aborted&&mounted.current)callbacks.current.onClose();
    }catch(failure){
      if(!controller.signal.aborted&&mounted.current)setError(failure instanceof Error?failure.message:'截图未能插入，请重试。');
    }finally{
      if(captureAbort.current===controller){captureAbort.current=null;if(mounted.current)setBusy(false);}
    }
  }

  async function applyPose(surface=false){
    const connection=bridge.current;if(!connection||!loadedRef.current||captureAbort.current||source!=='after')return;
    const controller=new AbortController();captureAbort.current=controller;setBusy(true);setError('');
    try{
      connection.send({type:'zhezhi-sim-pause'});
      const pose=await connection.capturePose();
      if(controller.signal.aborted||!mounted.current)return;
      if(surface)await callbacks.current.onApplySurface?.(pose,controller.signal,capturedColors.current);
      else await callbacks.current.onApplyAngles?.(pose,controller.signal,{strictClosure});
      if(!controller.signal.aborted&&mounted.current)callbacks.current.onClose();
    }catch(failure){if(!controller.signal.aborted&&mounted.current)setError(failure instanceof Error?failure.message:surface?'姿态未能应用。':'折角未能应用。');}
    finally{if(captureAbort.current===controller){captureAbort.current=null;if(mounted.current)setBusy(false);}}
  }

  return <AppDialog title={`三维模拟 · ${title}`} onClose={onClose} size="workspace" busy={busy} closeDisabled={busy} className="diagram-simulation-capture" bodyClassName="diagram-simulation-capture-body" footer={<>
    <span>{busy?'正在处理，可随时停止。':loaded?'应用到下一步会校正闭合折角，生成可转动、可绘图编辑的立体纸面。':'载入后可调整折叠比例、视角和纸面颜色。'}</span>
    <label className="diagram-simulation-capture-transparent"><input type="checkbox" aria-label="截图透明背景" checked={transparent} disabled={busy} onChange={event=>setTransparent(event.target.checked)}/>透明背景</label>
    <button type="button" onClick={()=>busy?captureAbort.current?.abort():onClose()}>{busy?'停止':'取消'}</button>
    <button type="button" disabled={!loaded||busy||status?.status==='error'} onClick={()=>void capture()}>截取并插入本步</button>
    {onApplyAngles&&<button type="button" disabled={!loaded||busy||source!=='after'||status?.status==='error'} title={source==='before'?'切换到操作后模型后应用折角':strictClosure?'闭合验证通过后应用实际折角':'应用实际折角，标记闭合未确认'} onClick={()=>void applyPose()}>应用当前折角到折痕</button>}
    {onApplySurface&&<button type="button" className="is-primary" disabled={!loaded||busy||source!=='after'||status?.status==='error'} title={source==='before'?'切换到操作后模型后应用姿态':'根据实际模拟折角求闭合姿态，同步 CP 并生成可编辑的立体纸面；完成后显示角度修正量'} onClick={()=>void applyPose(true)}>将当前姿态应用到下一步</button>}
  </>}>
    <div className="diagram-simulation-capture-source">
      <label>模拟状态<select aria-label="模拟状态" value={source} disabled={busy} onChange={event=>setSource(event.target.value as 'before'|'after')}><option value="before">操作前</option><option value="after">操作后</option></select></label>
      <span role="status">{error?'请检查下方提示':loaded?(status?.status==='paused'?'模拟已暂停':`${sourceLabel}模型已载入`):'正在载入三维模型…'}</span>
      {onApplyAngles&&<label title="开启时执行闭合验证与 ±0.25° 修正；关闭时直接应用已测折角，不确认刚性闭合。"><input type="checkbox" aria-label="严格闭合校验" checked={strictClosure} disabled={busy} onChange={event=>{const enabled=event.target.checked;setStrictClosure(enabled);setError('');try{preferenceStorage.setItem(CLOSURE_CHECK_KEY,String(enabled));setSettingNotice('');}catch{setSettingNotice('本次设置已生效，未能保存为下次默认值。');}}}/>严格闭合校验</label>}
      <button type="button" className="ui-button" disabled={busy} onClick={()=>setFrameKey(value=>value+1)}>重新载入</button>
    </div>
    <div className="diagram-simulation-capture-stage" aria-busy={!loaded&&!error}>
      <iframe key={frameKey} ref={iframe} src={appAsset('simulator/index.html')} title="折序三维模拟画布" onError={()=>{loadedRef.current=false;setLoaded(false);setError('三维画布载入失败，请重新载入。');}}/>
      {!loaded&&!error&&<div className="diagram-simulation-capture-loading" role="status">正在载入三维模型…</div>}
    </div>
    {error&&<div className="diagram-simulation-capture-error" role="alert">{error}</div>}
    {onApplyAngles&&!strictClosure&&<p role="status">闭合校验已关闭：应用时将标记“闭合未确认”。</p>}
    {settingNotice&&<p role="status">{settingNotice}</p>}
    <div className="diagram-simulation-capture-controls" inert={busy||undefined}>
      <SimulationControls allowMeshRefinement={false} diagramAppearance={colors} status={status} progress={progress} stale={!loaded} onProgress={seek} onReset={reset} send={command=>{if(command.type==='zhezhi-sim-colors')capturedColors.current={front:command.front,back:command.back,line:command.diagramLine??capturedColors.current.line};bridge.current?.send(command);}}/>
    </div>
  </AppDialog>;
}
