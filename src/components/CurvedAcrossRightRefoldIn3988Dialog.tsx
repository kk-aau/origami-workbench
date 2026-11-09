import {useMemo,useState} from 'react';
import {
  sampleIn3988,sourceCurvature,sourceTorsion,type Point2,type Point3,
} from '../app/curvedAcrossRightRefoldIn3988';
import {TessDialog} from './TessellationEditor';
import './CurvedAcrossRightRefoldIn3988Dialog.css';

const path=(points:Point2[])=>points.map(([x,y],i)=>
  `${i?'L':'M'}${x.toPrecision(9)} ${(-y).toPrecision(9)}`).join(' ');
function bounds(points:Point2[]){
  const xs=points.map(p=>p[0]),ys=points.map(p=>-p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const span=Math.max(maxX-minX,maxY-minY,.1),pad=.13*span;
  return {box:`${minX-pad} ${minY-pad} ${maxX-minX+2*pad} ${maxY-minY+2*pad}`,
    markerRadius:.011*span};
}
function project(p:Point3,azimuth:number):Point2{
  const a=azimuth*Math.PI/180,e=.42;
  const x=Math.cos(a)*p[0]-Math.sin(a)*p[1];
  const depth=Math.sin(a)*p[0]+Math.cos(a)*p[1];
  return [x,-Math.sin(e)*depth+Math.cos(e)*p[2]];
}
type Sample=ReturnType<typeof sampleIn3988>;
function Diagram({sample,space,azimuth,active}:{sample:Sample;space:'flat'|'folded';
  azimuth:number;active:number}){
  const convert=(p:Point3|Point2)=>space==='folded'?project(p as Point3,azimuth):p as Point2;
  const crease=sample.frames.map(f=>convert(space==='folded'?f.foldedCrease:f.flatCrease));
  const left=(space==='folded'?sample.foldedLeftBoundary:sample.flatLeftBoundary).map(convert);
  const right=(space==='folded'?sample.foldedRightBoundary:sample.flatRightBoundary).map(convert);
  const {box,markerRadius}=bounds([...crease,...left,...right]);
  const area=(boundary:Point2[])=>path([...crease,...boundary.slice().reverse()])+' Z';
  const rulings=(boundary:Point2[],side:'left'|'right')=>crease.map((p,i)=>
    i%8===0||i===crease.length-1?<line key={`${side}-${i}`}
      className={`rar-ruling ${side}`} x1={p[0]} y1={-p[1]}
      x2={boundary[i][0]} y2={-boundary[i][1]}
      vectorEffect="non-scaling-stroke"/>:null);
  const marker=crease[active];
  return <svg role="img" data-testid={`across-refold-3988-${space}`}
    aria-label={space==='folded'?'In[3988] 三维反折曲带':'In[3988] 二维展开曲带'}
    viewBox={box} preserveAspectRatio="xMidYMid meet">
    <path className="rar-band left" d={area(left)}/>
    <path className="rar-band right" d={area(right)}/>
    <path className="rar-edge left" d={path(left)}/>
    <path className="rar-edge right" d={path(right)}/>
    {rulings(left,'left')}{rulings(right,'right')}
    <line className="rar-active left" x1={marker[0]} y1={-marker[1]}
      x2={left[active][0]} y2={-left[active][1]} vectorEffect="non-scaling-stroke"/>
    <line className="rar-active right" x1={marker[0]} y1={-marker[1]}
      x2={right[active][0]} y2={-right[active][1]} vectorEffect="non-scaling-stroke"/>
    <path className="rar-crease" d={path(crease)}/>
    <circle className="rar-marker" cx={marker[0]} cy={-marker[1]} r={markerRadius}/>
  </svg>;
}

export default function CurvedAcrossRightRefoldIn3988Dialog({onClose}:{onClose:()=>void}){
  const sample=useMemo(()=>sampleIn3988(),[]);
  const [active,setActive]=useState(0),[azimuth,setAzimuth]=useState(-35);
  const frame=sample.frames[active];
  return <TessDialog title="第 45 节 · 变角圆弧二维反折三维" onClose={onClose}>
    <div className="refold-3988-dialog">
      <aside className="rar-controls">
        <span className="rar-eyebrow">01 / SAVED INPUT · In[3988]</span>
        <h2>趋近展平的曲折</h2>
        <p>单位圆弧的左母线指向圆心；原输入先补右侧二维母线，再用指定初值恢复三维曲折。</p>
        <dl className="rar-readouts">
          <div><dt>保存折角</dt><dd>150° → 0.015°</dd></div>
          <div><dt>参数区间</dt><dd>u∈[0, π/2]</dd></div>
          <div><dt>原插值点</dt><dd>64</dd></div>
          <div><dt>局部显示宽度</dt><dd>0.5 / 侧</dd></div>
          <div><dt>当前折角</dt><dd>{(frame.gamma*180/Math.PI).toFixed(3)}°</dd></div>
          <div><dt>空间曲率 κ</dt><dd>{sourceCurvature(frame.u).toFixed(4)}</dd></div>
          <div><dt>空间挠率 τ</dt><dd>{sourceTorsion().toFixed(5)}</dd></div>
          <div><dt>右侧 sinρ</dt><dd>{frame.rightSine.toFixed(5)}</dd></div>
        </dl>
        <label className="rar-slider">共同参数 u <strong>{(frame.u/Math.PI).toFixed(3)}π</strong>
          <input type="range" min="0" max={sample.frames.length-1} value={active}
            aria-label="In3988 曲线位置" onChange={event=>setActive(Number(event.target.value))}/>
        </label>
        <p className="rar-source-note">空间初值：F(0)=(1,0,0)，T(0)=(0,1,0)，B(0)=(0,0,1)。
          右母线由左侧和折角源方程唯一确定。</p>
      </aside>
      <main className="rar-results">
        <div className="rar-heading"><span>02 / 同参数局部曲带</span>
          <strong>二维展开 ↔ 三维反折</strong></div>
        <div className="rar-panels">
          <section className="rar-panel"><header><span>PLANE / 2D</span>
            <strong>原式二维曲线</strong></header>
            <Diagram sample={sample} space="flat" azimuth={azimuth} active={active}/>
            <small>左侧 v=1 为圆心焦线，本图止于 v=0.5。</small></section>
          <section className="rar-panel"><header><span>SPACE / 3D</span>
            <strong>源方程数值积分</strong></header>
            <Diagram sample={sample} space="folded" azimuth={azimuth} active={active}/>
            <label className="rar-camera">视角 <input type="range" min="-180" max="180"
              value={azimuth} aria-label="In3988 三维视角方位角"
              onChange={event=>setAzimuth(Number(event.target.value))}/><b>{azimuth}°</b></label>
          </section>
        </div>
        <div className="rar-legend"><span><i className="crease"/>共用折痕</span>
          <span><i className="left"/>左侧母线</span><span><i className="right"/>右侧母线</span></div>
        <div className="rar-proof"><strong>局部连续等距与可展</strong>
          <span>两侧二维／三维第一基本形式相同；右侧沿正向无焦线，末端折角仍严格大于零。</span></div>
        <div className="rar-caution">按保存输入和源方程重建；未复刻 Wolfram 的 64 点插值或数值 Out。
          曲线绘图采样不构成精确直折痕 FOLD、层序、折叠运动或无碰撞证书。</div>
        <footer className="rar-footer"><span>只读预览 · 不修改当前工程</span>
          <button className="primary" type="button" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
