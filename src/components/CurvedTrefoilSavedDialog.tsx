import {useMemo,useState} from 'react';
import {
  TREFOIL_IN3944,projectTrefoil,sampleTrefoilIn3944,
  type TrefoilFrame,type TrefoilVec3,
} from '../app/curvedTrefoilSavedIn3944';
import {TessDialog} from './TessellationEditor';
import './CurvedTrefoilSavedDialog.css';

const FRAMES=sampleTrefoilIn3944();
type Point2=[number,number];
type CurveSeries={name:string;color:string;value:(frame:TrefoilFrame)=>number};
const geometrySeries:CurveSeries[]=[
  {name:'κ 曲率',color:'#cbdc61',value:frame=>frame.curvature},
  {name:'κg 测地',color:'#5fc8bb',value:frame=>frame.geodesicCurvature},
  {name:'τ 挠率',color:'#d889aa',value:frame=>frame.torsion},
];
const angleSeries:CurveSeries[]=[
  {name:'ρL 左母线',color:'#e49a6c',value:frame=>frame.leftRulingAngleDeg},
  {name:'ρR 右母线',color:'#66c9bf',value:frame=>frame.rightRulingAngleDeg},
  {name:'γ 折角',color:'#c8a4e0',value:frame=>frame.foldAngleDeg},
];
const displayRayLength=.7;

function drawPath(points:Point2[]):string{
  return points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(3)} ${y.toFixed(3)}`).join(' ');
}
function Plot({title,series,active}:{title:string;series:CurveSeries[];active:number}){
  const width=360,height=160,left=35,right=9,top=10,bottom=25;
  const values=series.map(item=>FRAMES.map(item.value));
  const flatValues=values.flat(),minimum=Math.min(0,...flatValues),maximum=Math.max(0,...flatValues);
  const margin=Math.max((maximum-minimum)*.09,.01),low=minimum-margin,high=maximum+margin;
  const xx=(index:number)=>left+(width-left-right)*index/(FRAMES.length-1);
  const yy=(value:number)=>top+(height-top-bottom)*(high-value)/(high-low);
  return <div className="ctf-plot">
    <div className="ctf-plot-head"><strong>{title}</strong><span>u / π · ⅓ → 7/3</span></div>
    <svg role="img" aria-label={title} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {[0,.5,1].map((ratio,index)=><g key={ratio}><line className="ctf-grid"
        x1={left} x2={width-right} y1={top+(height-top-bottom)*ratio}
        y2={top+(height-top-bottom)*ratio}/><text className="ctf-tick" x={left-5}
        y={top+(height-top-bottom)*ratio+3} textAnchor="end">
        {(high-(high-low)*ratio).toFixed(index===1?2:1)}</text></g>)}
      <line className="ctf-cursor" x1={xx(active)} x2={xx(active)} y1={top}
        y2={height-bottom}/>
      {series.map((item,index)=><g key={item.name}>
        <path d={drawPath(values[index].map((v,i)=>[xx(i),yy(v)]))}
          fill="none" stroke={item.color} strokeWidth="1.8" vectorEffect="non-scaling-stroke"/>
        <circle cx={xx(active)} cy={yy(values[index][active])} r="3.1" fill={item.color}/>
      </g>)}
      <text className="ctf-tick" x={left} y={height-6}>⅓</text>
      <text className="ctf-tick" x={width-right} y={height-6} textAnchor="end">7/3</text>
    </svg>
    <div className="ctf-plot-legend">{series.map((item,index)=><span key={item.name}>
      <i style={{background:item.color}}/>{item.name}<b>{values[index][active].toFixed(3)}</b>
    </span>)}</div>
  </div>;
}

function KnotPreview({frames,active,azimuth}:{frames:TrefoilFrame[];active:number;azimuth:number}){
  const projected=useMemo(()=>frames.map(frame=>projectTrefoil(frame.curve,azimuth)),[frames,azimuth]);
  const chosen=frames[active],origin=projected[active];
  const tip=(direction:TrefoilVec3)=>projectTrefoil([
    chosen.curve[0]+displayRayLength*direction[0],
    chosen.curve[1]+displayRayLength*direction[1],
    chosen.curve[2]+displayRayLength*direction[2],
  ],azimuth);
  const leftTip=tip(chosen.leftRuling),rightTip=tip(chosen.rightRuling);
  const xs=[...projected.map(p=>p[0]),leftTip[0],rightTip[0]];
  const ys=[...projected.map(p=>p[1]),leftTip[1],rightTip[1]];
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const size=Math.max(x1-x0,y1-y0),pad=size*.13;
  const depths=projected.map(p=>p[2]),minDepth=Math.min(...depths),maxDepth=Math.max(...depths);
  const segments=projected.slice(0,-1).map((point,index)=>({point,next:projected[index+1],
    depth:(point[2]+projected[index+1][2])/2,index})).sort((a,b)=>a.depth-b.depth);
  return <svg role="img" aria-label="In[3944] 三叶结三维曲线与所选位置的两侧母线方向"
    data-testid="trefoil-in3944-space-curve"
    viewBox={`${x0-pad} ${-y1-pad} ${x1-x0+2*pad} ${y1-y0+2*pad}`}
    preserveAspectRatio="xMidYMid meet">
    <defs><marker id="ctf-left-arrow" markerWidth="5" markerHeight="5" refX="4.1" refY="2.5"
      orient="auto"><path d="M0 0L5 2.5L0 5Z" fill="#e49a6c"/></marker>
      <marker id="ctf-right-arrow" markerWidth="5" markerHeight="5" refX="4.1" refY="2.5"
        orient="auto"><path d="M0 0L5 2.5L0 5Z" fill="#66c9bf"/></marker></defs>
    {segments.map(segment=><line key={segment.index} className="ctf-knot-segment"
      x1={segment.point[0]} y1={-segment.point[1]}
      x2={segment.next[0]} y2={-segment.next[1]}
      opacity={.35+.62*(segment.depth-minDepth)/Math.max(maxDepth-minDepth,1e-9)}/>)}
    <line className="ctf-ray left" x1={origin[0]} y1={-origin[1]}
      x2={leftTip[0]} y2={-leftTip[1]} markerEnd="url(#ctf-left-arrow)"/>
    <line className="ctf-ray right" x1={origin[0]} y1={-origin[1]}
      x2={rightTip[0]} y2={-rightTip[1]} markerEnd="url(#ctf-right-arrow)"/>
    <circle className="ctf-knot-marker" cx={origin[0]} cy={-origin[1]} r={size*.012}/>
  </svg>;
}

/** Source-faithful local shape plots; no finite-width strip or FOLD is emitted. */
export default function CurvedTrefoilSavedDialog({onClose}:{onClose:()=>void}){
  const [active,setActive]=useState(0),[azimuth,setAzimuth]=useState(-38);
  const frame=FRAMES[active];
  return <TessDialog title="三叶结曲折 · In[3944] 只读原式" onClose={onClose}>
    <div className="curved-trefoil-dialog">
      <div className="ctf-source"><span className="ctf-tag">ORIGAMICA · 3944</span>
        <code>f(u) = (sin u + 2 sin 2u, cos u − 2 cos 2u, −sin 3u)</code>
        <span>γ = 135° · σ = +1 · u ∈ [π/3, 7π/3]</span></div>
      <div className="ctf-body">
        <section className="ctf-stage"><div className="ctf-card-heading"><span>01 / 空间曲线</span>
          <strong>三维正交投影</strong></div>
          <KnotPreview frames={FRAMES} active={active} azimuth={azimuth}/>
          <div className="ctf-stage-caption"><span><i className="ctf-curve-dot"/>深浅表示前后距离</span>
            <span><i className="ctf-left-dot"/>左母线方向</span><span><i className="ctf-right-dot"/>右母线方向</span></div>
          <div className="ctf-controls"><label>折痕位置 <b>u = {(frame.u/Math.PI).toFixed(3)}π</b>
            <input aria-label="三叶结折痕位置" type="range" min="0" max="256" value={active}
              onChange={event=>setActive(Number(event.target.value))}/></label>
            <label>观察角 <b>{azimuth}°</b><input aria-label="三叶结观察角" type="range"
              min="-180" max="180" value={azimuth}
              onChange={event=>setAzimuth(Number(event.target.value))}/></label></div>
        </section>
        <section className="ctf-analysis"><div className="ctf-card-heading"><span>02 / 形状函数</span>
          <strong>原版两张曲线图的量</strong></div>
          <Plot title="曲率 · 测地曲率 · 挠率" series={geometrySeries} active={active}/>
          <Plot title="母线角 · 折角" series={angleSeries} active={active}/>
        </section>
      </div>
      <div className="ctf-foot"><div><strong>已核：源曲线、Frenet 正则性与局部母线方向</strong>
        <span>256 段仅供绘图；短箭头不是纸带边界。尚无全域焦线宽度、展开纸面、碰撞或精确 FOLD 证明。</span></div>
        <button type="button" onClick={onClose}>关闭</button></div>
    </div>
  </TessDialog>;
}
