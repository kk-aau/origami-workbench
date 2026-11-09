import {useMemo,useState} from 'react';
import {joinedTubeEllipsePoints,joinedTubePreset,joinedTubeSavedEllipsePreset,joinedTubeSavedOffsetCirclePreset,joinedTubeSavedPleatedPentagonPreset,joinedTubeSavedRectanglesPreset,joinedTubeSavedTiltedCirclePreset,pleatReducePolygon,readJoinedTubeParams,rotateTubePoints,type JoinedTubeParams} from '../app/joinedTubeParams';
import {defaultEquilateralEllipseSource,type EquilateralEllipseSource,type JoinedEllipseSource} from '../app/equilateralEllipse';
import {readTessParams,type TessParams} from '../app/tessellation';
import TubeInputGraphics from './TubeInputGraphics';
import TubeSavedInputDialog from './TubeSavedInputDialog';
import TessNumberField from './TessNumberField';
import {TessDialog} from './TessellationEditor';
import TubeEllipseSourceEditor from './TubeEllipseSourceEditor';

export default function JoinedTubeControls({params,onChange}:{params:JoinedTubeParams;onChange:(next:TessParams)=>void}){
  const [editing,setEditing]=useState(false),[points,setPoints]=useState(''),[error,setError]=useState('');
  const [viewingSavedInput,setViewingSavedInput]=useState(false);
  const [phase,setPhase]=useState(params.family==='twist-joined-tube'?30:45),[reduction,setReduction]=useState(.5);
  const [sourceMode,setSourceMode]=useState<'manual'|'ellipse'>('manual');
  const [ellipse,setEllipse]=useState<EquilateralEllipseSource>(defaultEquilateralEllipseSource(24));
  const [topShift,setTopShift]=useState(0);
  const ellipseSource:JoinedEllipseSource=useMemo(()=>({ellipse,topRotationDeg:phase,topShift,
    ...(params.family==='double-joined-tube'?{pleatReduction:reduction}:{})}),[ellipse,phase,topShift,reduction,params.family]);
  const solved=useMemo(()=>{try{return {rings:joinedTubeEllipsePoints(ellipseSource,params.family==='double-joined-tube'),error:''};}
    catch(cause){return {rings:null,error:(cause as Error).message};}},[ellipseSource,params.family]);
  const savedRectangle=params.family==='twist-joined-tube'&&(()=>{
    const original=joinedTubeSavedRectanglesPreset(params.twistDirection);
    const sameRing=(a:[number,number][],b:[number,number][])=>a.length===b.length&&
      a.every((point,i)=>Math.hypot(point[0]-b[i][0],point[1]-b[i][1])<1e-10);
    return Math.abs(params.verticalOffset-.95)<1e-10&&params.panelOverlap&&
      sameRing(params.bottomPoints,original.bottomPoints)&&sameRing(params.topPoints,original.topPoints);
  })();
  const preview=useMemo(()=>{
    if(sourceMode==='ellipse')return solved.rings?readJoinedTubeParams({...params,...solved.rings,ellipseSource}):null;
    try{const draft=JSON.parse(points) as Record<string,unknown>;
      return readJoinedTubeParams({...params,bottomPoints:draft.bottomPoints,topPoints:draft.topPoints,ellipseSource:undefined});
    }catch{return params;}
  },[params,points,sourceMode,solved,ellipseSource]);
  const update=(patch:Partial<JoinedTubeParams>)=>{
    const next=readTessParams({...params,...patch});
    if(next){setError('');onChange(next);}else setError('截面顶点数、周长或数值范围不符合原版构造输入。');
  };
  const open=()=>{setPoints(JSON.stringify({bottomPoints:params.bottomPoints,topPoints:params.topPoints},null,2));
    setSourceMode(params.ellipseSource?'ellipse':'manual');setEllipse(params.ellipseSource?.ellipse??defaultEquilateralEllipseSource(params.family==='double-joined-tube'?12:24));
    setPhase(params.ellipseSource?.topRotationDeg??(params.family==='twist-joined-tube'?30:45));
    setTopShift(params.ellipseSource?.topShift??0);setReduction(params.ellipseSource?.pleatReduction??.5);setError('');setEditing(true);};
  const changeMode=(mode:'manual'|'ellipse')=>{
    if(mode==='manual'&&solved.rings)setPoints(JSON.stringify(solved.rings,null,2));
    setSourceMode(mode);setError('');
  };
  const save=()=>{
    try{
      if(sourceMode==='ellipse'){
        if(!solved.rings)throw Error(solved.error);
        const next=readTessParams({...params,...solved.rings,ellipseSource});
        if(!next)throw Error('椭圆来源与截面点列未通过核验。');
        onChange(next);setEditing(false);setError('');return;
      }
      const parsed=JSON.parse(points) as Record<string,unknown>;
      const next=readTessParams({...params,bottomPoints:parsed.bottomPoints,topPoints:parsed.topPoints,ellipseSource:undefined});
      if(!next)throw Error('截面无效：两圈周长须相等；扭转管顶点数相同，双连接管上圈点数须加倍。');
      onChange(next);setEditing(false);setError('');
    }catch(cause){setError(cause instanceof SyntaxError?'截面 JSON 格式无效。':(cause as Error).message);}
  };
  const replaceTop=()=>{
    try{
      if(sourceMode==='ellipse'){
        if(!solved.rings)throw Error(solved.error);
        setPoints(JSON.stringify(solved.rings,null,2));setError('');return;
      }
      const draft=JSON.parse(points) as Record<string,unknown>;
      const bottom=draft.bottomPoints as [number,number][];
      const rotated=params.family==='twist-joined-tube'?rotateTubePoints(bottom,phase):
        rotateTubePoints(pleatReducePolygon(bottom,reduction),phase);
      const next=readJoinedTubeParams({...params,bottomPoints:bottom,topPoints:rotated,ellipseSource:undefined});
      if(!next)throw Error('生成的上截面无效。');
      setPoints(JSON.stringify({bottomPoints:next.bottomPoints,topPoints:next.topPoints},null,2));setError('');
    }catch(cause){setError(cause instanceof SyntaxError?'截面 JSON 格式无效。':(cause as Error).message);}
  };
  return <>
    <div className="tess-pair"><TessNumberField label="截面高度差" value={params.verticalOffset} min={.00001} max={10000} step={.05} onChange={verticalOffset=>update({verticalOffset})}/><TessNumberField label="管段高度" value={params.tubeHeight} min={.00001} max={10000} step={.1} onChange={tubeHeight=>update({tubeHeight})}/></div>
    <div className="tess-pair tess-small-selects">
      {params.family==='twist-joined-tube'&&<label className="select-field">扭转方向<select aria-label="管扭转方向" value={params.twistDirection} onChange={event=>update({twistDirection:event.target.value as 'CCW'|'CW'})}><option value="CCW">逆时针</option><option value="CW">顺时针</option></select></label>}
      <label className="select-field">拼接搭片<select aria-label="管拼接搭片" value={String(params.panelOverlap)} onChange={event=>update({panelOverlap:event.target.value==='true'})}><option value="false">关闭</option><option value="true">开启</option></select></label>
      <button className="text-button" onClick={open}>编辑截面与高级参数</button>
      <button className="text-button" onClick={()=>setViewingSavedInput(true)}>原版管状输入示意 · In[3573–3595]</button>
      {params.family==='twist-joined-tube'&&<label className="select-field tube-saved-select">原版保存例
        <select aria-label="原版连接管保存例" value="" onChange={event=>{
          const preset=event.target.value==='ellipse'?joinedTubeSavedEllipsePreset():
            event.target.value==='pentagon'?joinedTubeSavedPleatedPentagonPreset():
            event.target.value==='rectangles'?joinedTubeSavedRectanglesPreset():
            event.target.value==='offset-circle'?joinedTubeSavedOffsetCirclePreset():
            event.target.value==='tilted-circle'?joinedTubeSavedTiltedCirclePreset():null;
          if(!preset)return;
          const next=readTessParams(preset);
          if(next){setError('');onChange(next);}
          else setError('原版保存例未通过参数校验。');
        }}><option value="">选择并载入…</option>
          <option value="offset-circle">偏移圆管 · In[3586]</option>
          <option value="ellipse">等边椭圆 · In[3587]</option>
          <option value="rectangles">矩形对 · In[3588/3589]</option>
          <option value="pentagon">五边褶皱 · In[3590/3591]</option>
          <option value="tilted-circle">倾斜圆管 · In[3592]</option></select></label>}
    </div>
    <p className="note">下圈 {params.bottomPoints.length} 点 · 上圈 {params.topPoints.length} 点 · 原版静态三维等距；连续折叠和碰撞未检验。{savedRectangle&&params.family==='twist-joined-tube'&&params.twistDirection==='CCW'&&' 原版明确注明此 CCW 保存态自相交。'}</p>
    {error&&!editing&&<p className="tess-editor-error" role="alert">{error}</p>}
    {viewingSavedInput&&<TubeSavedInputDialog onClose={()=>setViewingSavedInput(false)}/>}
    {editing&&<TessDialog title={params.family==='twist-joined-tube'?'扭转连接管截面':'双连接管截面'} onClose={()=>{setEditing(false);setError('');}}>
      <label className="tube-geometry-source-mode">截面来源<select aria-label="连接管截面来源" value={sourceMode} onChange={e=>changeMode(e.target.value as 'manual'|'ellipse')}><option value="manual">手工点列</option><option value="ellipse">等弦椭圆</option></select></label>
      {sourceMode==='ellipse'?<TubeEllipseSourceEditor source={ellipse} onChange={setEllipse}/>:<p className="note">编辑上下二维点列，周长须相同。生成上截面使用当前下圈；采用手工点列会清除椭圆来源。</p>}
      <div className="tess-pair"><TessNumberField label="上圈旋转角" value={phase} min={-360} max={360} step={1} onChange={setPhase}/>{params.family==='double-joined-tube'&&<TessNumberField label="褶皱收缩比" value={reduction} min={.01} max={.99} step={.01} onChange={setReduction}/>}<button onClick={replaceTop}>生成上截面</button></div>
      {sourceMode==='ellipse'&&<div className="tube-ellipse-fields"><label><span>顶点左移</span><input aria-label="上圈顶点左移" type="number" min={0} max={ellipse.count*(params.family==='double-joined-tube'?2:1)-1} step={1} value={topShift} onChange={e=>{if(e.target.value.trim())setTopShift(Number(e.target.value));}}/></label></div>}
      {sourceMode==='manual'&&<textarea className="tess-json tube-points-json" aria-label="上下截面 JSON" value={points} onChange={event=>setPoints(event.target.value)}/>}
      {preview&&<TubeInputGraphics params={preview} height={105}/>}
      {sourceMode==='ellipse'&&solved.error&&<p className="tess-editor-error" role="alert">{solved.error}</p>}
      {params.family==='twist-joined-tube'&&<div className="tess-pair"><TessNumberField label="倾斜轴角" value={params.tiltAxialAngleDeg} min={-360} max={360} step={1} onChange={tiltAxialAngleDeg=>update({tiltAxialAngleDeg})}/><TessNumberField label="顶部倾角" value={params.tiltAzimuthalAngleDeg} min={-89} max={89} step={1} onChange={tiltAzimuthalAngleDeg=>update({tiltAzimuthalAngleDeg})}/></div>}
      <div className="tess-pair"><TessNumberField label="最小赋型折角" value={params.typeMinimumAngleDeg} min={0} max={180} step={.5} onChange={typeMinimumAngleDeg=>update({typeMinimumAngleDeg})}/><TessNumberField label="最大赋型折角" value={params.typeMaximumAngleDeg} min={0} max={180} step={.5} onChange={typeMaximumAngleDeg=>update({typeMaximumAngleDeg})}/></div>
      {error&&<p className="tess-editor-error" role="alert">{error}</p>}
      <footer><button onClick={()=>{const example=joinedTubePreset(params.family);setSourceMode('manual');setPoints(JSON.stringify({bottomPoints:example.bottomPoints,topPoints:example.topPoints},null,2));}}>填入原版示例</button><button className="primary" disabled={sourceMode==='ellipse'&&!solved.rings} onClick={save}>采用截面</button></footer>
    </TessDialog>}
  </>;
}
