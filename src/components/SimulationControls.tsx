import {forwardRef,useEffect,useId,useImperativeHandle,useRef,useState} from 'react';
import type {SimulatorCommand,SimulatorStatus} from '../engine/simulator';
import {strainInk,type SimulationDisplayOptions,type SimulationDisplayMode,type SimulationCameraPreset,type SimulationCreaseStyle} from '../engine/simDisplay';
import {DEFAULT_SIMULATION_SOLVER_SETTINGS,FLEXIBLE_PAPER_SOLVER_SETTINGS,type SimulationSolverSettings} from '../engine/simSettings';
import {compileSimTargetAnimation,evaluateSimTargetAnimation,validateSimTargetAnimationSteps,type SimTargetAnimationStep,type SimTargetAnimationPath} from '../engine/simTargetAnimation';
import {defaultSimulationPreferences,readSimulationPreferences,saveSimulationPreferences,type SimulationPreferences} from '../app/simulationPreferences';
import type {ModelColors} from '../app/modelColors';
import type {SimulationMeshQuality} from '../engine/simFlexibleMesh';
import ColorPicker from '../ui/ColorPicker';
import './simulation-controls.css';

type SettingsTab='material'|'display'|'animation'|'export';
type SolverNumber='axialStiffness'|'faceStiffness'|'creaseStiffness'|'panelStiffness'|'damping'|'timeStepScale';
const numericSettings:readonly [SolverNumber,string,number,number,number,string][]=[
  ['axialStiffness','轴向刚度',10,100,1,'约束纸面的拉伸与压缩'],
  ['faceStiffness','面内刚度',0,5,.01,'约束三角面内的剪切变形'],
  ['creaseStiffness','折痕硬度',0,3,.01,'驱动山折与谷折达到目标角'],
  ['panelStiffness','纸面抗弯',0,3,.01,'越低越容易弯曲，不改变真实折痕'],
  ['damping','阻尼',.01,1,.01,'越高越快抑制振荡'],
  ['timeStepScale','时间步倍率',.05,1,.01,'较小值更稳，求解也更慢'],
];
const viewModes:readonly [SimulationDisplayMode,string,string][]=[['paper','纸面着色','纸面'],['wireframe','只看折线','折线'],['xray','透视纸面','透视'],['strain','应变热图','应变'],['normals','面法向着色','法向']];
const viewDirections:readonly [SimulationCameraPreset,string][]=[['front','正面'],['back','背面'],['left','左面'],['right','右面'],['top','顶面'],['bottom','底面'],['isometric','立体']];

function NumberInput({label,value,min,max,step=1,disabled=false,onChange,onInvalid,onEdit}:{label:string;value:number;min:number;max:number;step?:number;disabled?:boolean;onChange:(value:number)=>void;onInvalid?:(value:number)=>void;onEdit?:()=>void}){
  const [draft,setDraft]=useState(String(value));
  useEffect(()=>{setDraft(String(value));},[value]);
  const number=Number(draft),invalid=draft!==''&&(!Number.isFinite(number)||number<min||number>max);
  return <input aria-label={label} aria-invalid={invalid||undefined} type="number" min={min} max={max} step={step} value={draft} disabled={disabled}
    onChange={event=>{onEdit?.();const text=event.target.value;setDraft(text);const next=Number(text);if(text!==''&&Number.isFinite(next)){if(next>=min&&next<=max)onChange(next);else onInvalid?.(next);}}}
    onBlur={()=>setDraft(String(value))} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/>;
}

function NumberSetting({label,value,min,max,step,help,disabled,onChange}:{label:string;value:number;min:number;max:number;step:number;help:string;disabled:boolean;onChange:(value:number)=>void}){
  return <div className="sim-number-setting"><span>{label}<small>{help}</small></span>
    <input type="range" aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled} onChange={e=>onChange(Number(e.target.value))}/>
    <NumberInput label={`${label}数字`} value={value} min={min} max={max} step={step} disabled={disabled} onChange={onChange}/>
  </div>;
}

function StrainLegend({clip,compact=false}:{clip:number;compact?:boolean}){
  const ramp=Array.from({length:8},(_,i)=>`${strainInk(clip/100*i/7,clip)} ${i/7*100}%`).join(',');
  return <div className={`sim-strain-legend${compact?' compact':''}`} aria-label={`轴向应变图例：蓝色 0%，中间 ${clip/2}%，红色 ${clip}%`}>
    {!compact&&<span>轴向应变</span>}<div><i style={{background:`linear-gradient(to right,${ramp})`}}/><span><b>0</b><b>{Number((clip/2).toFixed(2))}</b><b>{clip}%</b></span></div>
  </div>;
}

export interface SimulationControlsHandle {reset:()=>void;stop:()=>void}
export default forwardRef<SimulationControlsHandle,{status:SimulatorStatus|null;progress:number;stale:boolean;onProgress:(n:number)=>void;onReset:()=>void;send:(command:SimulatorCommand)=>void;onCaptureImage?:()=>void;capturingImage?:boolean;diagramAppearance?:ModelColors;allowMeshRefinement?:boolean}>(function SimulationControls({status,progress,stale,onProgress,onReset,send,onCaptureImage,capturingImage=false,diagramAppearance,allowMeshRefinement=true},ref){
  const initialPreferences=(value:SimulationPreferences):SimulationPreferences=>diagramAppearance?{...value,mode:'paper',creaseStyle:'diagram',front:diagramAppearance.front,back:diagramAppearance.back,solver:{...value.solver,panelStiffness:FLEXIBLE_PAPER_SOLVER_SETTINGS.panelStiffness},display:{...value.display,background:'#fafbf7'}}:value;
  const [preferences,setPreferences]=useState(()=>initialPreferences(readSimulationPreferences())),preferencesRef=useRef(preferences);
  // The diagram's palette and display preset belong to this dialog, not to
  // unrelated simulations opened in the standalone workspace.
  const localPreferences=useRef(!!diagramAppearance);
  const [tab,setTab]=useState<SettingsTab>('material'),[playing,setPlaying]=useState(false);
  const [meshDraft,setMeshDraft]=useState<SimulationMeshQuality>('original');
  const meshRebuild=useRef<SimulationMeshQuality|null>(null);
  const [saveError,setSaveError]=useState(''),[animationError,setAnimationError]=useState('');
  const progressRef=useRef(progress),onProgressRef=useRef(onProgress),sendRef=useRef(send);
  const frameRef=useRef<number|null>(null),timelineRef=useRef<{path:SimTargetAnimationPath;start:number;speed:number;loop:boolean;lastSent:number;lastPercent:number}|null>(null);
  const dirtyRef=useRef(false),saveTimerRef=useRef<number|null>(null),lastAppliedRef=useRef(''),nextIdRef=useRef(0);
  const tabsId=useId();
  const ready=!!status&&['loaded','running','paused'].includes(status.status)&&!stale&&!capturingImage;
  const paused=ready&&status?.status==='paused',stepAnimation=!!status?.animation;
  const {solver,display,mode,creaseStyle,camera,front,back}=preferences;
  progressRef.current=progress;onProgressRef.current=onProgress;sendRef.current=send;

  const stopPlayback=()=>{if(frameRef.current!==null)cancelAnimationFrame(frameRef.current);frameRef.current=null;timelineRef.current=null;setPlaying(false);};
  const reset=()=>{stopPlayback();progressRef.current=0;onReset();};
  useImperativeHandle(ref,()=>({reset,stop:stopPlayback}),[onReset]);
  const updatePreferences=(patch:Partial<SimulationPreferences>)=>{
    const next={...preferencesRef.current,...patch};preferencesRef.current=next;dirtyRef.current=true;setPreferences(next);
  };
  const applyPreferences=(value:SimulationPreferences)=>{
    sendRef.current({type:'zhezhi-sim-view',mode:value.mode});
    sendRef.current({type:'zhezhi-sim-crease-style',style:value.creaseStyle});
    sendRef.current({type:'zhezhi-sim-solver-settings',settings:value.solver});
    sendRef.current({type:'zhezhi-sim-display-settings',settings:value.display});
    sendRef.current({type:'zhezhi-sim-collision',enabled:value.collision});
    sendRef.current({type:'zhezhi-sim-colors',front:value.front,back:value.back,diagramLine:diagramAppearance?.line});
    if(value.camera!=='free')sendRef.current({type:'zhezhi-sim-camera',preset:value.camera});
  };
  useEffect(()=>{
    if(!dirtyRef.current)return;
    if(localPreferences.current){dirtyRef.current=false;return;}
    saveTimerRef.current=window.setTimeout(()=>{
      saveTimerRef.current=null;
      try{saveSimulationPreferences(preferencesRef.current);dirtyRef.current=false;setSaveError('');}
      catch{setSaveError('设置已生效，但暂未保存；请检查设置目录后重试。');}
    },300);
    return()=>{if(saveTimerRef.current!==null)clearTimeout(saveTimerRef.current);};
  },[preferences]);
  useEffect(()=>{
    const hide=()=>{if(document.hidden)stopPlayback();};document.addEventListener('visibilitychange',hide);
    return()=>{
      document.removeEventListener('visibilitychange',hide);
      if(frameRef.current!==null)cancelAnimationFrame(frameRef.current);
      if(saveTimerRef.current!==null)clearTimeout(saveTimerRef.current);
      if(dirtyRef.current&&!localPreferences.current){try{saveSimulationPreferences(preferencesRef.current);}catch{/* The visible save warning already explains failures. */}}
    };
  },[]);
  useEffect(()=>{if(!ready||stepAnimation)stopPlayback();},[ready,stepAnimation,status?.revision]);
  useEffect(()=>{stopPlayback();},[status?.revision]);
  useEffect(()=>{
    if(!status?.meshQuality)return;
    setMeshDraft(status.meshQuality);
    if(meshRebuild.current===status.meshQuality){meshRebuild.current=null;progressRef.current=0;onProgressRef.current(0);}
  },[status?.meshQuality,status?.revision]);
  useEffect(()=>{stopPlayback();},[status?.poseEditRevision]);
  useEffect(()=>{if(status?.interactionActive)stopPlayback();},[status?.interactionActive]);
  useEffect(()=>{
    // A ready handshake can precede an already queued pose load. Sending a
    // camera/material preference then would arrive AFTER restoration and
    // silently replace the saved pose's view. Wait for a real loaded backend.
    if(!status?.backend||!['loaded','running','paused'].includes(status.status)||status.revision===undefined)return;
    const key=String(status.revision);if(lastAppliedRef.current===key)return;
    if(status.poseRestored){
      lastAppliedRef.current=key;
      updatePreferences({...status.solverSettings?{solver:status.solverSettings}:{},camera:status.view??'free'});
      // A saved pose owns its material and camera. Do not overwrite either
      // with preferences from another project or start solving on load.
      const saved=preferencesRef.current;
      sendRef.current({type:'zhezhi-sim-view',mode:saved.mode});sendRef.current({type:'zhezhi-sim-crease-style',style:saved.creaseStyle});
      sendRef.current({type:'zhezhi-sim-display-settings',settings:saved.display});sendRef.current({type:'zhezhi-sim-colors',front:saved.front,back:saved.back,diagramLine:diagramAppearance?.line});
      if(status.collisionEnabled!==undefined)updatePreferences({collision:status.collisionEnabled});
      return;
    }
    lastAppliedRef.current=key;applyPreferences(preferencesRef.current);
  },[status?.status,status?.revision,status?.backend,status?.poseRestored]);
  useEffect(()=>{
    if(status?.view&&status.status!=='ready'&&status.status!=='loaded'&&preferencesRef.current.camera!==status.view)updatePreferences({camera:status.view});
  },[status?.view]);
  useEffect(()=>{
    if(!status?.solverSettings||!status.backend||!status.poseRestored&&!status.poseEditRevision)return;
    if(JSON.stringify(preferencesRef.current.solver)!==JSON.stringify(status.solverSettings))updatePreferences({solver:status.solverSettings});
  },[status?.revision,status?.poseEditRevision,status?.poseRestored]);

  const seek=(value:number)=>{stopPlayback();progressRef.current=value;onProgressRef.current(value);};
  const chooseMode=(value:SimulationDisplayMode)=>{updatePreferences({mode:value});send({type:'zhezhi-sim-view',mode:value});};
  const chooseStyle=(value:SimulationCreaseStyle)=>{updatePreferences({creaseStyle:value});send({type:'zhezhi-sim-crease-style',style:value});};
  const chooseCamera=(preset:SimulationCameraPreset)=>{updatePreferences({camera:preset});send({type:'zhezhi-sim-camera',preset});};
  const changeSolver=(patch:Partial<SimulationSolverSettings>)=>{
    if(patch.integrationType==='verlet'&&status?.pinnedVertices){setAnimationError('请先解除固定点，再切换 Verlet 积分。');return;}
    const settings={...preferencesRef.current.solver,...patch};updatePreferences({solver:settings});send({type:'zhezhi-sim-solver-settings',settings});
  };
  const changeDisplay=(patch:Partial<SimulationDisplayOptions>)=>{
    const settings={...preferencesRef.current.display,...patch};updatePreferences({display:settings});send({type:'zhezhi-sim-display-settings',settings});
  };
  const changeColor=(key:'front'|'back',value:string)=>{
    updatePreferences({[key]:value});send({type:'zhezhi-sim-colors',front:preferencesRef.current.front,back:preferencesRef.current.back,diagramLine:diagramAppearance?.line});
  };
  const editAnimation=(steps:SimTargetAnimationStep[])=>{
    stopPlayback();try{const animation=validateSimTargetAnimationSteps(steps);updatePreferences({animation});setAnimationError('');}catch(error){setAnimationError(error instanceof Error?error.message:'目标播放设置无效。');}
  };
  const editRow=(index:number,patch:Partial<SimTargetAnimationStep>)=>editAnimation(preferencesRef.current.animation.map((step,i)=>i===index?{...step,...patch} as SimTargetAnimationStep:step));
  const addRow=(kind:'fold'|'hold')=>{
    const id=`target-${Date.now()}-${++nextIdRef.current}`;
    editAnimation([...preferencesRef.current.animation,kind==='fold'?{id,kind,target:100,duration:2}:{id,kind,duration:1}]);
  };
  const startPlayback=()=>{
    if(playing){stopPlayback();return;}
    if(!ready||stepAnimation||document.hidden)return;
    const config=preferencesRef.current;
    try{
      if(!config.animation.length)throw new Error('请先添加折叠或停留。');
      const single=config.animation[0],restart=progressRef.current===100&&config.animation.length===1&&single.kind==='fold'&&single.target===100;
      const initial=restart?0:progressRef.current,path=compileSimTargetAnimation(initial,config.animation);
      if(restart){progressRef.current=0;onProgressRef.current(0);}
      timelineRef.current={path,start:performance.now(),speed:config.speed,loop:config.loop,lastSent:0,lastPercent:initial};
      if(paused)sendRef.current({type:'zhezhi-sim-resume'});
      setAnimationError('');setPlaying(true);
      const tick=(now:number)=>{
        const timeline=timelineRef.current;if(!timeline)return;
        if(document.hidden){stopPlayback();return;}
        const sample=evaluateSimTargetAnimation(timeline.path,(now-timeline.start)*timeline.speed);
        // Keep the clock smooth without making the document tree render at display refresh rate.
        if(sample.done||(now-timeline.lastSent>=50&&sample.percent!==timeline.lastPercent)){
          timeline.lastSent=now;timeline.lastPercent=sample.percent;progressRef.current=sample.percent;onProgressRef.current(sample.percent);
        }
        if(sample.done){
          if(!timeline.loop){stopPlayback();return;}
          timeline.path=compileSimTargetAnimation(sample.percent,config.animation);timeline.start=now;
        }
        frameRef.current=requestAnimationFrame(tick);
      };
      frameRef.current=requestAnimationFrame(tick);
    }catch(error){setAnimationError(error instanceof Error?error.message:'目标播放设置无效。');}
  };
  const restoreSettings=()=>{stopPlayback();const defaults=initialPreferences(defaultSimulationPreferences());updatePreferences(defaults);applyPreferences(defaults);setAnimationError('');};
  const animationDuration=preferences.animation.reduce((total,step)=>total+step.duration,0);

  return <div className="sim-controls" aria-label="三维模拟控制">
    <div className="sim-progress-line"><strong>目标折叠</strong>
      <input aria-label="目标折叠比例" type="range" min={stepAnimation?0:-100} max="100" step="1" value={progress} disabled={!ready} onChange={e=>seek(Number(e.target.value))}/>
      <label><NumberInput label="目标折叠比例数字" value={Number(progress.toFixed(1))} min={stepAnimation?0:-100} max={100} disabled={!ready} onEdit={stopPlayback} onChange={seek}/>%</label>
      {mode==='strain'&&<StrainLegend clip={display.strainClip} compact/>}
      {status?.angleDiagnostics?.status==='available'&&<span className="sim-angle-readout" title="当前实际折角与目标角的最大绝对差；并非碰撞检测结果">最大偏差 {status.angleDiagnostics.maxAbsoluteErrorDegrees.toFixed(1)}°</span>}
    </div>
    <div className="sim-toolbar-row">
      <div role="group" aria-label="显示模式" className="sim-mode-buttons">{viewModes.map(([key,label,short])=><button key={key} className="outline" aria-label={label} aria-pressed={mode===key} disabled={!ready} onClick={()=>chooseMode(key)}>{short}</button>)}</div>
      <div role="group" aria-label="折痕样式" className="sim-crease-buttons">{([['diagram','主图绘图样式','主图'],['assignment','红蓝山谷样式','红蓝'],['crease','真实折痕样式','折痕']] as const).map(([key,label,short])=><button key={key} className="outline" aria-label={label} aria-pressed={creaseStyle===key} disabled={!ready} onClick={()=>chooseStyle(key)}>{short}</button>)}</div>
      <div role="group" aria-label="视角" className="sim-camera-buttons">{viewDirections.filter(([key])=>['front','back','isometric'].includes(key)).map(([key,label])=><button key={key} className="outline" aria-label={`${label}视角`} aria-pressed={camera===key} disabled={!ready} onClick={()=>chooseCamera(key)}>{label}</button>)}</div>
      <div className="sim-action-buttons">
        <button className="outline" aria-label={playing?'停止播放':'播放目标'} aria-pressed={playing} disabled={!ready||stepAnimation} onClick={startPlayback}>{playing?'停止':'播放'}</button>
        <button className="outline" disabled={!ready} onClick={()=>{stopPlayback();send({type:status?.status==='running'?'zhezhi-sim-pause':'zhezhi-sim-resume'});}}>{status?.status==='running'?'暂停':'继续'}</button>
        <button className="outline" aria-label="推进 20 步" disabled={!paused} onClick={()=>{stopPlayback();send({type:'zhezhi-sim-step'});}}>单步×20</button>
        <button className="outline" aria-label="展开复位" disabled={!ready} onClick={reset}>复位</button>
        {onCaptureImage&&<button type="button" className="outline" aria-label="插入折序" aria-busy={capturingImage||undefined} disabled={!ready} onClick={()=>{stopPlayback();onCaptureImage();}}>{capturingImage?'正在截取…':'插入折序'}</button>}
      </div>
      <details className="sim-advanced"><summary>模拟设置</summary>
        <div className="sim-advanced-panel">
          <div className="sim-settings-tabs" role="tablist" aria-label="模拟设置分类">{([['material','材质'],['display','显示'],['animation','目标播放'],['export','导出']] as const).map(([key,label])=><button id={`${tabsId}-${key}-tab`} key={key} type="button" role="tab" aria-selected={tab===key} aria-controls={`${tabsId}-${key}`} tabIndex={tab===key?0:-1} onClick={()=>setTab(key)} onKeyDown={e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;e.preventDefault();const keys:SettingsTab[]=['material','display','animation','export'],next=keys[(keys.indexOf(tab)+(e.key==='ArrowRight'?1:3))%4];setTab(next);document.getElementById(`${tabsId}-${next}-tab`)?.focus();}}>{label}</button>)}</div>
          <div id={`${tabsId}-${tab}`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}-tab`} className="sim-settings-body">
            {tab==='material'&&<>
              <div className="sim-presets" role="group" aria-label="材质预设"><span>纸张手感</span>
                <button className="outline" disabled={!ready} onClick={()=>changeSolver({...FLEXIBLE_PAPER_SOLVER_SETTINGS,damping:.7})}>柔软</button>
                <button className="outline" disabled={!ready} onClick={()=>changeSolver({...DEFAULT_SIMULATION_SOLVER_SETTINGS})}>常规</button>
                <button className="outline" disabled={!ready} onClick={()=>changeSolver({panelStiffness:1.2,faceStiffness:.4,creaseStiffness:.9,damping:.5})}>硬挺</button>
                <button className="outline" disabled={!ready} onClick={()=>changeSolver({axialStiffness:20,faceStiffness:.2,creaseStiffness:.7,panelStiffness:.7,damping:.45,timeStepScale:.35,integrationType:'euler'})}>原站参数</button>
              </div>
              {!stepAnimation&&<>
                <label className="sim-checkbox-label"><input type="checkbox" aria-label="纸面碰撞保护" checked={status?.collisionEnabled??preferences.collision} disabled={!ready} onChange={e=>{stopPlayback();updatePreferences({collision:e.target.checked});send({type:'zhezhi-sim-collision',enabled:e.target.checked});}}/>纸面碰撞保护</label>
                <p className="sim-settings-note">开启后限制纸面相互穿透，接触受阻时会暂停；计算较慢，暂不支持拖动塑形，不模拟摩擦与反弹。</p>
                {status?.collisionEnabled&&status.collisionMessage&&<p className="sim-settings-note" role="status">{status.collisionMessage}</p>}
              </>}
              {!stepAnimation&&allowMeshRefinement&&<>
                <div className="sim-settings-grid"><label>曲面精细度<select aria-label="曲面精细度" value={meshDraft} disabled={!ready} onChange={e=>setMeshDraft(e.target.value as SimulationMeshQuality)}><option value="original">原始网格</option><option value="standard">标准细分</option><option value="fine">精细细分</option></select></label>
                  <button className="outline" disabled={!ready||meshDraft===status?.meshQuality} onClick={()=>{stopPlayback();meshRebuild.current=meshDraft;send({type:'zhezhi-sim-mesh',quality:meshDraft});}}>重建网格（复位）</button>
                </div>
                <p className="sim-settings-note">{status?.meshTriangles?`当前 ${status.meshVertices} 个顶点 · ${status.meshTriangles} 个三角面。`:''}细分让纸面更容易形成曲面；重建会展开纸张并清除塑形和固定点。辅助网格不会写入折痕图。</p>
              </>}
              <div className="sim-number-settings">{numericSettings.map(([key,label,min,max,step,help])=><NumberSetting key={key} label={label} value={solver[key]} min={min} max={max} step={step} help={help} disabled={!ready} onChange={value=>changeSolver({[key]:value})}/>)}</div>
              <div className="sim-settings-grid"><label>数值积分<select aria-label="数值积分" value={solver.integrationType} disabled={!ready} onChange={e=>changeSolver({integrationType:e.target.value as 'euler'|'verlet'})}><option value="euler">Euler（一阶）</option><option value="verlet">Verlet（二阶）</option></select></label>
                <label>每帧步数上限<select aria-label="每帧步数上限" value={solver.maxStepsPerFrame} disabled={!ready} onChange={e=>changeSolver({maxStepsPerFrame:Number(e.target.value)})}>{Array.from(new Set([0,32,96,240,512,1024,4000,solver.maxStepsPerFrame])).sort((a,b)=>a-b).map(n=><option key={n} value={n}>{n||'自动'}</option>)}</select></label>
              </div>
              <p className="sim-settings-note">{status?.collisionEnabled?'碰撞保护逐步检查，优先遵守 6ms 求解预算；复杂接触检测可能超出预算，精细网格会更慢。':'每帧仍优先遵守 6ms 求解预算；步数上限不是帧率。'}</p>
              {solver.integrationType==='verlet'&&<p className="sim-settings-note">Verlet 模式下顶点塑形不可用；可继续旋转和缩放。</p>}
            </>}
            {tab==='display'&&<>
              <div className="sim-visibility-options">{([['showFaces','显示纸面'],['showEdges','显示线条'],['mountains','山折 M'],['valleys','谷折 V'],['boundaries','边界 B'],['facets','面片 F'],['unassigned','无驱动 U']] as const).map(([key,label])=><label key={key} title={key==='facets'&&creaseStyle==='diagram'?'主图样式保留原折痕，隐藏辅助网格':undefined}><input type="checkbox" checked={display[key]} disabled={!ready||key==='facets'&&creaseStyle==='diagram'} onChange={e=>changeDisplay({[key]:e.target.checked})}/>{label}</label>)}</div>
              <p className="sim-settings-note">主图样式以深色实线显示折边、浅色显示已有折痕，隐藏网格辅助边；红蓝样式可检查山谷方向。</p>
              <NumberSetting label="应变色阶上限" value={display.strainClip} min={.1} max={30} step={.1} help="单位为百分比；只调整热图颜色" disabled={!ready} onChange={strainClip=>changeDisplay({strainClip})}/>
              <StrainLegend clip={display.strainClip}/>
              <div className="sim-settings-grid sim-color-settings"><label>背景色<ColorPicker aria-label="背景色" value={display.background} disabled={!ready} onChange={color=>changeDisplay({background:color})}/></label><label>正面色<ColorPicker aria-label="正面色" value={front} disabled={!ready} onChange={color=>changeColor('front',color)}/></label><label>背面色<ColorPicker aria-label="背面色" value={back} disabled={!ready} onChange={color=>changeColor('back',color)}/></label>
                <label>视图方向<select aria-label="视图方向" value={camera} disabled={!ready} onChange={e=>chooseCamera(e.target.value as SimulationCameraPreset)}>{camera==='free'&&<option value="free">自由视角</option>}{viewDirections.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
            </>}
            {tab==='animation'&&<>
              <p className="sim-settings-note">从当前目标比例开始，统一驱动全部折痕。此序列不修改工程，也不替代逐折痕步骤动画。</p>
              {stepAnimation&&<p className="sim-settings-note">当前为逐折痕步骤动画，请使用步骤播放。</p>}
              <div className="sim-animation-list">{preferences.animation.map((step,index)=><div className="sim-animation-row" key={step.id}>
                <span>{step.kind==='fold'?'折叠至':'停留'}</span>
                {step.kind==='fold'?<label><NumberInput label={`第 ${index+1} 段目标比例`} min={-100} max={100} value={step.target} onEdit={stopPlayback} onChange={target=>editRow(index,{target})} onInvalid={target=>editRow(index,{target})}/>%</label>:<span className="sim-animation-hold">保持当前比例</span>}
                <label><NumberInput label={`第 ${index+1} 段时长`} min={.1} max={120} step={.1} value={step.duration} onEdit={stopPlayback} onChange={duration=>editRow(index,{duration})} onInvalid={duration=>editRow(index,{duration})}/>秒</label>
                <button className="outline" aria-label={`删除第 ${index+1} 段`} onClick={()=>editAnimation(preferencesRef.current.animation.filter((_,i)=>i!==index))}>删除</button>
              </div>)}</div>
              {!preferences.animation.length&&<p className="sim-settings-note">添加折叠或停留，组成目标播放序列。</p>}
              <div className="sim-animation-actions"><button className="outline" disabled={preferences.animation.length>=20} onClick={()=>addRow('fold')}>添加折叠</button><button className="outline" disabled={preferences.animation.length>=20} onClick={()=>addRow('hold')}>添加停留</button><span>{preferences.animation.length}/20 段 · {Number(animationDuration.toFixed(1))}/600 秒</span></div>
              <div className="sim-settings-grid"><label>播放速度<select aria-label="播放速度" value={preferences.speed} onChange={e=>{stopPlayback();updatePreferences({speed:Number(e.target.value) as SimulationPreferences['speed']});}}>{[.25,.5,1,2].map(speed=><option key={speed} value={speed}>{speed}×</option>)}</select></label><label className="sim-checkbox-label"><input aria-label="循环目标播放" type="checkbox" checked={preferences.loop} onChange={e=>{stopPlayback();updatePreferences({loop:e.target.checked});}}/>循环播放</label></div>
              <p className="sim-settings-note">循环从上一轮终点继续；需要往返时，请添加折叠至 0% 或负比例的一段。</p>
              <button className="outline sim-play-sequence" disabled={!ready||stepAnimation} onClick={startPlayback}>{playing?'停止目标播放':'播放目标序列'}</button>
            </>}
            {tab==='export'&&<>
              <div className="sim-export-buttons"><button className="outline" aria-label="导出三维 FOLD" disabled={!ready} onClick={()=>send({type:'zhezhi-sim-export-fold'})}>三维 FOLD</button><button className="outline" aria-label="导出 OBJ 网格" disabled={!ready} onClick={()=>send({type:'zhezhi-sim-export-obj'})}>OBJ 网格</button><button className="outline" aria-label="导出 STL 网格" disabled={!ready} onClick={()=>send({type:'zhezhi-sim-export-stl'})}>STL 网格</button><button className="outline" aria-label="导出当前 SVG" disabled={!ready} onClick={()=>send({type:'zhezhi-sim-export-svg'})}>当前 SVG</button></div>
              <div className="sim-png-export"><label>PNG 倍率<select aria-label="PNG 倍率" value={preferences.pngScale} onChange={e=>updatePreferences({pngScale:Number(e.target.value) as 1|2|4})}>{[1,2,4].map(scale=><option key={scale} value={scale}>{scale}×</option>)}</select></label><button className="outline" aria-label="导出当前 PNG" disabled={!ready} onClick={()=>send({type:'zhezhi-sim-export-png',scale:preferences.pngScale})}>当前 PNG</button></div>
              <p className="sim-settings-note">图片只输出三维画布，不包含界面和鼠标。OBJ/STL 为零厚度网格。</p>
            </>}
          </div>
          <div className="sim-settings-footer"><button className="outline" onClick={restoreSettings}>恢复全部模拟设置</button><span>不重置模型姿态</span></div>
        </div>
      </details>
    </div>
    {(saveError||animationError)&&<div className="sim-settings-feedback" role="alert">{saveError||animationError}</div>}
  </div>;
});

