import {useMemo,useState} from 'react';
import {
  CONE_RESHAPE_PRESET,CONE_RESHAPE_SOURCE,projectConePoint,sampleConeReshapeGrid,
  validateConeReshapeParams,type ConePoint3,type ConeReshapeMode,
  type ConeReshapeParams,type ConeReshapeSample,
} from '../app/curvedConeReshape';
import {TessDialog} from './TessellationEditor';
import './CurvedSavedPairDialog.css';
import './CurvedConeReshapeDialog.css';

type Point2=[number,number];
const path=(points:Point2[])=>points.map(([x,y],i)=>
  `${i?'L':'M'}${x.toPrecision(9)} ${(-y).toPrecision(9)}`).join(' ');

function ConeDrawing({grid,side,planar,azimuth,active}:{grid:ConeReshapeSample[][];
  side:'source'|'target';planar:boolean;azimuth:number;active:number}){
  const project=(point:ConePoint3):Point2=>planar?[point[0],point[1]]:
    projectConePoint(point,azimuth);
  const outer=grid.map(row=>project(row[row.length-1][side]));
  const apex=project([0,0,0]);
  const all=[...outer,apex],xs=all.map(p=>p[0]),ys=all.map(p=>-p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const span=Math.max(x1-x0,y1-y0,.01),pad=span*.16;
  const index=Math.min(active,outer.length-1);
  return <svg data-testid={`curved-cone-${side}-${planar?'2d':'3d'}`} role="img"
    aria-label={`${side==='source'?'原':'重塑后'}圆锥直纹面${planar?'二维竖直投影':'三维正交投影'}`}
    viewBox={`${x0-pad} ${y0-pad} ${Math.max(x1-x0,.01)+2*pad} ${Math.max(y1-y0,.01)+2*pad}`}
    preserveAspectRatio="xMidYMid meet">
    {outer.slice(0,-1).map((point,i)=><path key={i} className="ccr-band"
      d={`M${apex[0]} ${-apex[1]} L${point[0]} ${-point[1]} L${outer[i+1][0]} ${-outer[i+1][1]} Z`}/>)}
    {outer.filter((_,i)=>i%10===0).map((point,i)=><line key={i} className="ccr-ruling"
      vectorEffect="non-scaling-stroke" x1={apex[0]} y1={-apex[1]}
      x2={point[0]} y2={-point[1]}/>)}
    <path className="ccr-boundary" d={path(outer)}/>
    <line className="ccr-active" vectorEffect="non-scaling-stroke"
      x1={apex[0]} y1={-apex[1]} x2={outer[index][0]} y2={-outer[index][1]}/>
    <circle className="ccr-marker" cx={outer[index][0]} cy={-outer[index][1]} r={span*.018}/>
  </svg>;
}

/** Saved analytic/numeric cone reshape examples as non-adoptable surface previews. */
export default function CurvedConeReshapeDialog({onClose}:{onClose:()=>void}){
  const [mode,setMode]=useState<ConeReshapeMode>('flatten');
  const [draft,setDraft]=useState({thetaDeg:'30',normalCurvature:'0.7'});
  const [params,setParams]=useState<ConeReshapeParams>(CONE_RESHAPE_PRESET);
  const [error,setError]=useState('');
  const [active,setActive]=useState(0),[azimuth,setAzimuth]=useState(-35);
  const grid=useMemo(()=>sampleConeReshapeGrid(mode,params),[mode,params]);
  const edit=(key:keyof ConeReshapeParams,value:string)=>{
    const next={...draft,[key]:value};setDraft(next);
    try{setParams(validateConeReshapeParams({thetaDeg:Number(next.thetaDeg),
      normalCurvature:Number(next.normalCurvature)}));setError('');}
    catch(cause){setError((cause as Error).message);}
  };
  const reset=()=>{setDraft({thetaDeg:'30',normalCurvature:'0.7'});
    setParams(CONE_RESHAPE_PRESET);setMode('flatten');setActive(0);setError('');};
  const saved=params.thetaDeg===30&&params.normalCurvature===.7;
  return <TessDialog title="第 45 节 · 圆锥重塑保存例" onClose={onClose}>
    <div className="curved-saved-pair-dialog curved-cone-reshape-dialog">
      <aside className="csp-controls">
        <div className="csp-heading-small"><span>01 / 原版圆锥子域</span>
          <button type="button" onClick={reset}>恢复保存参数</button></div>
        <p className="csp-intro">ReshapeCone3D / NReshapeCone3D：同一源参数的圆锥展平与平面卷锥。只读曲面图，不生成折痕工程。</p>
        <div className="ccr-modes"><button type="button" aria-pressed={mode==='flatten'}
          onClick={()=>{setMode('flatten');setActive(0);}}>展平圆锥</button>
          <button type="button" aria-pressed={mode==='curl'}
            onClick={()=>{setMode('curl');setActive(0);}}>卷起圆锥</button></div>
        <div className="ccr-fields">
          <label className="csp-field"><span>原锥角 θ / °</span><input type="number"
            aria-label="圆锥展平原锥角" min="10" max="60" step="1"
            value={draft.thetaDeg} onChange={event=>edit('thetaDeg',event.target.value)}/></label>
          <label className="csp-field"><span>目标法曲率 β</span><input type="number"
            aria-label="圆锥卷起目标法曲率" min="0.1" max="1.5" step="0.1"
            value={draft.normalCurvature}
            onChange={event=>edit('normalCurvature',event.target.value)}/></label>
        </div>
        <dl className="ccr-facts"><div><dt>原保存输入</dt>
          <dd>{mode==='flatten'?'θ=30°，β=0，σ=−1':'平面半圆，β=0.7，σ=+1'}</dd></div>
          <div><dt>曲面参数</dt><dd>0≤s≤π，0≤v≤1</dd></div>
          <div><dt>面内度量</dt><dd>{mode==='flatten'?'E=v²sin²θ，F=0，G=1':'E=v²，F=0，G=1'}</dd></div></dl>
        <div className="csp-position"><label htmlFor="ccr-position">对应母线
          <strong>s={(active/100).toFixed(2)}π</strong></label>
          <input id="ccr-position" type="range" min="0" max="100" value={active}
            onChange={event=>setActive(Number(event.target.value))}/></div>
        {error&&<div className="csp-status invalid" role="alert">{error} 图示保留上次有效值。</div>}
        <div className="csp-status ready" role="status">二维／三维第一基本形式相同；v=0 为锥顶奇点，仅 v&gt;0 局部正则。</div>
      </aside>
      <main className="csp-results">
        <div className="csp-topline"><div><span>02 / 原版三视图</span>
          <strong>{mode==='flatten'?'空间圆锥 → 平面扇区':'平面扇区 → 空间圆锥'}</strong></div>
          <small>{saved?`${CONE_RESHAPE_SOURCE.analyticCells[mode==='flatten'?0:1]} / ${CONE_RESHAPE_SOURCE.numericCells[mode==='flatten'?0:1]}`:'本地解析参数变体'}</small></div>
        <div className="csp-panels ccr-panels">
          <section className="csp-panel"><header><span>SOURCE · 3D</span><strong>原曲面</strong></header>
            <ConeDrawing grid={grid} side="source" planar={false} azimuth={azimuth} active={active}/>
            <p>原始直纹面</p></section>
          <section className="csp-panel"><header><span>TARGET · 3D</span><strong>重塑曲面</strong></header>
            <ConeDrawing grid={grid} side="target" planar={false} azimuth={azimuth} active={active}/>
            <p>同参数局部等距</p></section>
          <section className="csp-panel"><header><span>PLANAR · 2D</span><strong>目标 XY 投影</strong></header>
            <ConeDrawing grid={grid} side="target" planar azimuth={azimuth} active={active}/>
            <p>{mode==='flatten'?'真实平面扇区':'仅竖直投影，非展平图'}</p></section>
        </div>
        <label className="ccr-azimuth">三维视角 <input type="range" min="-180" max="180"
          aria-label="圆锥重塑三维视角方位角" value={azimuth}
          onChange={event=>setAzimuth(Number(event.target.value))}/><b>{azimuth}°</b></label>
        <div className="csp-certification"><strong>解析保存子域 · 只读</strong>
          <span>原输入的 v=0 整条参数边坍缩为锥顶；源面与目标面仅在 v&gt;0 正则。采样弦段不是精确 FOLD，未验证全局自交或连续运动；无 Wolfram 逐点数值 Out。</span></div>
        <footer className="csp-footer"><span>关闭后保持当前工作区与作品不变。</span>
          <button className="primary" type="button" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
