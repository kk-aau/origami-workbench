import {useMemo,useState} from 'react';
import {closedTubePreset,closedTubeSavedEllipsePreset,closedTubeSavedTiltedPreset,type ClosedTwistToppedTubeParams} from '../app/closedTubeParams';
import {defaultEquilateralEllipseSource,solveEquilateralEllipse,type EquilateralEllipseSource} from '../app/equilateralEllipse';
import {readTessParams,type TessParams} from '../app/tessellation';
import TessNumberField from './TessNumberField';
import {TessDialog} from './TessellationEditor';
import TubeEllipseSourceEditor from './TubeEllipseSourceEditor';

export default function ClosedTubeControls({params,onChange}:{params:ClosedTwistToppedTubeParams;onChange:(next:TessParams)=>void}){
  const [editing,setEditing]=useState(false),[json,setJson]=useState(''),[error,setError]=useState('');
  const [sourceMode,setSourceMode]=useState<'manual'|'ellipse'>('manual');
  const [ellipse,setEllipse]=useState<EquilateralEllipseSource>(defaultEquilateralEllipseSource());
  const [center,setCenter]=useState(params.convergencePoint),[normal,setNormal]=useState(params.twistNormal);
  const solved=useMemo(()=>{try{return {points:solveEquilateralEllipse(ellipse),error:''};}
    catch(cause){return {points:null,error:(cause as Error).message};}},[ellipse]);
  const update=(patch:Partial<ClosedTwistToppedTubeParams>)=>{
    const next=readTessParams({...params,...patch});
    if(next){onChange(next);setError('');}else setError('管截面、会聚点或扭转平面参数无效。');
  };
  const loadSavedEllipse=(extension:0.2|-0.1)=>{
    const next=readTessParams(closedTubeSavedEllipsePreset(extension));
    if(next){onChange(next);setError('');}
    else setError('原版椭圆封顶截面未通过参数校验。');
  };
  const loadSavedTilted=()=>{
    const next=readTessParams(closedTubeSavedTiltedPreset());
    if(next){onChange(next);setError('');}
    else setError('原版偏心倾斜顶未通过参数校验。');
  };
  const open=()=>{setJson(JSON.stringify({points:params.points,convergencePoint:params.convergencePoint,twistNormal:params.twistNormal},null,2));
    setSourceMode(params.ellipseSource?'ellipse':'manual');setEllipse(params.ellipseSource??defaultEquilateralEllipseSource());
    setCenter(params.convergencePoint);setNormal(params.twistNormal);setError('');setEditing(true);};
  const changeMode=(mode:'manual'|'ellipse')=>{
    if(mode==='manual'&&solved.points)setJson(JSON.stringify({points:solved.points,convergencePoint:center,twistNormal:normal},null,2));
    setSourceMode(mode);setError('');
  };
  const save=()=>{
    try{
      if(sourceMode==='ellipse'){
        if(!solved.points)throw Error(solved.error);
        const next=readTessParams({...params,points:solved.points,ellipseSource:ellipse,convergencePoint:center,twistNormal:normal});
        if(!next)throw Error('截面来源、会聚点或法向无效。');
        onChange(next);setEditing(false);setError('');return;
      }
      const value=JSON.parse(json) as Record<string,unknown>;
      const next=readTessParams({...params,points:value.points,
        convergencePoint:value.convergencePoint,twistNormal:value.twistNormal,ellipseSource:undefined});
      if(!next)throw Error('截面须有 3–48 个二维点；会聚点与法向须为三维数值，法向 z 不得为零。');
      onChange(next);setEditing(false);setError('');
    }catch(cause){setError(cause instanceof SyntaxError?'几何 JSON 格式无效。':(cause as Error).message);}
  };
  return <>
    <div className="tess-pair"><TessNumberField label="管段高度" value={params.tubeHeight} min={.00001} max={10000} step={.1} onChange={tubeHeight=>update({tubeHeight})}/><TessNumberField label="帽褶延伸" value={params.twistExtension} min={-10000} max={10000} step={.05} onChange={twistExtension=>update({twistExtension})}/></div>
    <div className="tess-pair tess-small-selects"><label className="select-field">扭转方向<select aria-label="封顶管扭转方向" value={params.twistDirection} onChange={event=>update({twistDirection:event.target.value as 'CCW'|'CW'})}><option value="CCW">逆时针</option><option value="CW">顺时针</option></select></label><label className="select-field">拼接搭片<select aria-label="封顶管拼接搭片" value={String(params.panelOverlap)} onChange={event=>update({panelOverlap:event.target.value==='true'})}><option value="false">关闭</option><option value="true">开启</option></select></label><button className="text-button" onClick={open}>编辑截面与会聚点</button><button className="text-button" onClick={()=>loadSavedEllipse(.2)}>原版椭圆封顶</button><button className="text-button" onClick={()=>loadSavedEllipse(-.1)}>原版椭圆开孔</button><button className="text-button" onClick={loadSavedTilted}>原版偏心倾斜顶</button></div>
    <p className="note">{params.points.length} 边截面 · 三维扭转帽。静态等距已检；连续折叠和自碰撞未检。</p>
    {error&&!editing&&<p className="tess-editor-error" role="alert">{error}</p>}
    {editing&&<TessDialog title="封顶扭转管几何" onClose={()=>{setEditing(false);setError('');}}>
      <label className="tube-geometry-source-mode">截面来源<select aria-label="封顶管截面来源" value={sourceMode} onChange={e=>changeMode(e.target.value as 'manual'|'ellipse')}><option value="manual">手工点列</option><option value="ellipse">等弦椭圆</option></select></label>
      {sourceMode==='ellipse'?<>
        <TubeEllipseSourceEditor source={ellipse} onChange={setEllipse}/>
        <div className="tube-ellipse-fields">{(['x','y','z'] as const).map((axis,i)=><label key={`center-${axis}`}><span>会聚点 {axis}</span><input aria-label={`会聚点 ${axis}`} type="number" step=".1" value={center[i]} onChange={e=>{if(e.target.value.trim()&&Number.isFinite(Number(e.target.value)))setCenter(center.map((n,j)=>j===i?Number(e.target.value):n) as typeof center);}}/></label>)}
          {(['x','y','z'] as const).map((axis,i)=><label key={`normal-${axis}`}><span>法向 {axis}</span><input aria-label={`法向 ${axis}`} type="number" step=".1" value={normal[i]} onChange={e=>{if(e.target.value.trim()&&Number.isFinite(Number(e.target.value)))setNormal(normal.map((n,j)=>j===i?Number(e.target.value):n) as typeof normal);}}/></label>)}</div>
        {solved.points&&<svg className="tube-ellipse-preview" data-testid="closed-ellipse-preview" viewBox={`${-Math.max(...ellipse.semiAxes)*1.1} ${-Math.max(...ellipse.semiAxes)*1.1} ${Math.max(...ellipse.semiAxes)*2.2} ${Math.max(...ellipse.semiAxes)*2.2}`}><polygon points={solved.points.map(([x,y])=>`${x},${-y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/><circle cx={solved.points[0][0]} cy={-solved.points[0][1]} r={Math.max(...ellipse.semiAxes)*.025} fill="#bd4843"/></svg>}
        {solved.error&&<p className="tess-editor-error" role="alert">{solved.error}</p>}
      </>:<><p className="note">points 为二维截面；convergencePoint 为三维会聚点；twistNormal 为平面法向。采用手工点列会清除椭圆来源。</p>
        <textarea className="tess-json" aria-label="封顶管几何 JSON" value={json} onChange={event=>setJson(event.target.value)}/></>}
      <div className="tess-pair"><TessNumberField label="最小赋型折角" value={params.typeMinimumAngleDeg} min={0} max={180} step={.5} onChange={typeMinimumAngleDeg=>update({typeMinimumAngleDeg})}/><TessNumberField label="最大赋型折角" value={params.typeMaximumAngleDeg} min={0} max={180} step={.5} onChange={typeMaximumAngleDeg=>update({typeMaximumAngleDeg})}/></div>
      {error&&<p className="tess-editor-error" role="alert">{error}</p>}
      <footer><button onClick={()=>{const p=closedTubePreset();setSourceMode('manual');setJson(JSON.stringify({points:p.points,convergencePoint:p.convergencePoint,twistNormal:p.twistNormal},null,2));}}>填入原版方管</button><button className="primary" disabled={sourceMode==='ellipse'&&!solved.points} onClick={save}>采用几何</button></footer>
    </TessDialog>}
  </>;
}
