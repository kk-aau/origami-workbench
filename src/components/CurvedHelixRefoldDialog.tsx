import {useMemo,useState} from 'react';
import {
  sampleHelixRefoldIn3980,type HelixRefoldSample,type Point2,type Point3,
} from '../app/curvedHelixRefoldIn3980';
import {TessDialog} from './TessellationEditor';
import './CurvedUniformHelixDialog.css';
import './CurvedHelixRefoldDialog.css';

type View='source'|'flat'|'refolded';

function path(points:Point2[]):string{
  return points.map(([x,y],i)=>`${i?'L':'M'}${x.toPrecision(10)} ${(-y).toPrecision(10)}`).join(' ');
}
function bounds(points:Point2[]):string{
  const xs=points.map(p=>p[0]),ys=points.map(p=>-p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const span=Math.max(maxX-minX,maxY-minY,.01),pad=span*.12;
  return `${minX-pad} ${minY-pad} ${Math.max(maxX-minX,.01)+2*pad} ${Math.max(maxY-minY,.01)+2*pad}`;
}
function project(point:Point3,azimuthDeg:number):Point2{
  const az=azimuthDeg*Math.PI/180,elevation=28*Math.PI/180;
  const x=Math.cos(az)*point[0]-Math.sin(az)*point[1];
  const depth=Math.sin(az)*point[0]+Math.cos(az)*point[1];
  return [x,-Math.sin(elevation)*depth+Math.cos(elevation)*point[2]];
}

function PreviewDrawing({sample,view,azimuth,active}:{sample:HelixRefoldSample;
  view:View;azimuth:number;active:number}){
  const flat=view==='flat';
  const folded=(point:Point3)=>project(point,azimuth);
  const crease=sample.frames.map(frame=>flat?frame.flatCrease:
    folded(view==='source'?frame.sourceCrease:frame.refoldedCrease));
  const left=flat?sample.flatLeftBoundary:((view==='source'?
    sample.sourceLeftBoundary:sample.refoldedLeftBoundary).map(folded));
  const right=flat?sample.flatRightBoundary:((view==='source'?
    sample.sourceRightBoundary:sample.refoldedRightBoundary).map(folded));
  const viewBox=bounds([...crease,...left,...right]);
  const markerRadius=Math.max(Number(viewBox.split(' ')[2]),Number(viewBox.split(' ')[3]))*.013;
  const marker=crease[active];
  const shape=(outer:Point2[])=>path([...crease,...outer.slice().reverse()])+' Z';
  const rulings=(outer:Point2[],side:'left'|'right')=>sample.rulingFrameIndices.map(i=><line
    key={`${side}-${i}`} className={`curved-helix-ruling ${side}`}
    x1={crease[i][0]} y1={-crease[i][1]} x2={outer[i][0]} y2={-outer[i][1]}
    vectorEffect="non-scaling-stroke"/>);
  return <svg data-testid={`helix-refold-${view}`} role="img"
    aria-label={flat?'In[3980] 数值二维平展':view==='source'?'In[3980] 原三维螺旋':'In[3980] 数值重折三维'}
    viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
    <path className="curved-helix-band left" d={shape(left)}/>
    <path className="curved-helix-band right" d={shape(right)}/>
    <path className="curved-helix-boundary left" d={path(left)}/>
    <path className="curved-helix-boundary right" d={path(right)}/>
    {rulings(left,'left')}{rulings(right,'right')}
    <line className="curved-helix-active left" x1={marker[0]} y1={-marker[1]}
      x2={left[active][0]} y2={-left[active][1]} vectorEffect="non-scaling-stroke"/>
    <line className="curved-helix-active right" x1={marker[0]} y1={-marker[1]}
      x2={right[active][0]} y2={-right[active][1]} vectorEffect="non-scaling-stroke"/>
    <path className="curved-helix-crease" d={path(crease)}/>
    <circle className="curved-helix-start" cx={crease[0][0]} cy={-crease[0][1]}
      r={markerRadius*.65} vectorEffect="non-scaling-stroke"/>
    <circle className="curved-helix-marker" cx={marker[0]} cy={-marker[1]}
      r={markerRadius} vectorEffect="non-scaling-stroke"/>
  </svg>;
}

export default function CurvedHelixRefoldDialog({onClose}:{onClose:()=>void}){
  const sample=useMemo(()=>sampleHelixRefoldIn3980(),[]);
  const [active,setActive]=useState(0),[azimuth,setAzimuth]=useState(-35);
  const frame=sample.frames[active],d=sample.diagnostics;
  return <TessDialog title="非均匀螺旋平展再折回 · In[3980]" onClose={onClose}>
    <div className="curved-helix-dialog curved-helix-refold-dialog">
      <aside className="curved-helix-controls">
        <div className="curved-helix-section-title"><span>01 / 保存输入</span></div>
        <p className="curved-helix-summary">r=1 · θ=30° · u∈[0,π]<br/>
          γ(u)=120°−60°u/π · 原调用 128 插值点。中点 uᵢ=π/2 从原空间折痕及 Frenet 标架重折。</p>
        <dl className="curved-helix-readouts">
          <div><dt>当前源折角</dt><dd>{(frame.sourceFoldAngleRad*180/Math.PI).toFixed(2)}°</dd></div>
          <div><dt>当前重折角</dt><dd>{(frame.recoveredFoldAngleRad*180/Math.PI).toFixed(2)}°</dd></div>
          <div><dt>最大折角差</dt><dd>{d.recoveredAngleMaximumErrorRad.toExponential(1)} rad</dd></div>
          <div><dt>最大折痕坐标差</dt><dd>{d.recoveredCreaseMaximumError.toExponential(1)}</dd></div>
          <div><dt>最大母线向量差</dt><dd>{d.recoveredRulingMaximumError.toExponential(1)}</dd></div>
          <div><dt>左侧 Jacobian 下界</dt><dd>{d.leftJacobianLowerBound.toFixed(4)}</dd></div>
          <div><dt>右侧 |Jacobian| 下界</dt><dd>{d.rightJacobianMagnitudeLowerBound.toFixed(4)}</dd></div>
        </dl>
        <div className="curved-helix-scrub"><label htmlFor="helix-refold-position">
          曲线位置<strong>u={(frame.u/Math.PI).toFixed(3)}π</strong></label>
          <input id="helix-refold-position" type="range" min="0" max="127"
            value={active} onChange={event=>setActive(Number(event.target.value))}/>
        </div>
        <p className="curved-helix-summary">三项差值只比较本地解析源式与本地数值重折；不是 Wolfram 逐点 Out 误差。</p>
        <p className="curved-helix-summary">原 In[3966] 未向二维内部求解转发 128 点选项。本地预览均匀取 128 点，单位宽局部带有正则界；不作整体无碰撞证明。</p>
      </aside>
      <main className="curved-helix-results">
        <div className="curved-helix-heading"><div><span>02 / 三段构造链</span>
          <strong>原三维 → 数值二维平展 → 中点初值重折三维</strong></div>
          <small>同一参数 · 局部直纹带</small></div>
        <div className="curved-helix-panels">
          {(['source','flat','refolded'] as const).map(view=><section
            key={view} className="curved-helix-panel"><header>
              <span>{view==='flat'?'PLANE · 2D':'SPACE · 3D'}</span>
              <strong>{view==='source'?'原曲折':view==='flat'?'平展':'重折结果'}</strong></header>
            <PreviewDrawing sample={sample} view={view} azimuth={azimuth} active={active}/>
            <p>{view==='source'?'In[3959] 源式':view==='flat'?'平面折痕数值积分':'In[3977] 方程与中点初值'}</p>
          </section>)}
        </div>
        <div className="curved-helix-legend"><span><i className="crease"/>曲线折痕</span>
          <span><i className="left"/>左母线</span><span><i className="right"/>右母线</span>
          <label className="curved-helix-azimuth">三维视角 <input type="range" min="-180" max="180"
            value={azimuth} onChange={event=>setAzimuth(Number(event.target.value))}
            aria-label="重折三维视角方位角"/><b>{azimuth}°</b></label></div>
        <div className="curved-helix-verification"><strong>固定输入重折闭环 · 数值残差已测</strong>
          <span>连续局部等距、可展与单位宽正则；离散弦非精确等距。</span></div>
        <footer className="curved-helix-footer"><span>只读诊断 · 非精确 FOLD · 不可采用</span>
          <button className="primary" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
