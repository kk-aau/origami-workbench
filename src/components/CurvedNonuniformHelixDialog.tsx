import {useMemo,useState} from 'react';
import {
  sampleNonuniformHelixIn3968,type NonuniformHelixSample,type Point2,type Point3,
} from '../app/curvedNonuniformHelix';
import {TessDialog} from './TessellationEditor';
import './CurvedUniformHelixDialog.css';

function path(points:Point2[]):string{
  return points.map(([x,y],i)=>`${i?'L':'M'}${x.toPrecision(10)} ${(-y).toPrecision(10)}`).join(' ');
}

function drawingBounds(points:Point2[]):string{
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

function PreviewDrawing({sample,folded,azimuth,active}:{sample:NonuniformHelixSample;
  folded:boolean;azimuth:number;active:number}){
  const crease=sample.frames.map(frame=>folded?project(frame.foldedCrease,azimuth):frame.flatCrease);
  const left=folded?sample.foldedLeftBoundary.map(p=>project(p,azimuth)):sample.flatLeftBoundary;
  const right=folded?sample.foldedRightBoundary.map(p=>project(p,azimuth)):sample.flatRightBoundary;
  const bounds=drawingBounds([...crease,...left,...right]);
  const markerRadius=Math.max(Number(bounds.split(' ')[2]),Number(bounds.split(' ')[3]))*.012;
  const marker=crease[active];
  const shape=(outer:Point2[])=>path([...crease,...outer.slice().reverse()])+' Z';
  const rulings=(outer:Point2[],side:'left'|'right')=>sample.rulingFrameIndices.map(i=><line
    key={`${side}-${i}`} className={`curved-helix-ruling ${side}`}
    x1={crease[i][0]} y1={-crease[i][1]} x2={outer[i][0]} y2={-outer[i][1]}
    vectorEffect="non-scaling-stroke"/>);
  return <svg data-testid={folded?'nonuniform-helix-3d':'nonuniform-helix-2d'}
    role="img" aria-label={folded?'非均匀螺旋曲折三维投影':'非均匀螺旋曲折二维平展'}
    viewBox={bounds} preserveAspectRatio="xMidYMid meet">
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

export default function CurvedNonuniformHelixDialog({onClose}:{onClose:()=>void}){
  const sample=useMemo(()=>sampleNonuniformHelixIn3968(),[]);
  const [active,setActive]=useState(0),[azimuth,setAzimuth]=useState(-35);
  const frame=sample.frames[active],diagnostics=sample.diagnostics;
  return <TessDialog title="非均匀螺旋曲折 · In[3968]" onClose={onClose}>
    <div className="curved-helix-dialog">
      <aside className="curved-helix-controls">
        <div className="curved-helix-section-title"><span>01 / 保存输入</span></div>
        <p className="curved-helix-summary">r=1 · θ=30° · u∈[0,π]<br/>
          γ(u)=60°+60°u/π，原调用 InterpolationPoints→128。</p>
        <dl className="curved-helix-readouts">
          <div><dt>当前折角</dt><dd>{(frame.foldAngleRad*180/Math.PI).toFixed(2)}°</dd></div>
          <div><dt>本地曲线采样点</dt><dd>{sample.frames.length}</dd></div>
          <div><dt>正则预览母线宽度</dt><dd>{sample.source.localRibbonWidth.toFixed(2)}</dd></div>
          <div><dt>左侧 Jacobian 下界</dt><dd>{diagnostics.leftJacobianLowerBound.toFixed(4)}</dd></div>
          <div><dt>右侧 |Jacobian| 下界</dt><dd>{diagnostics.rightJacobianMagnitudeLowerBound.toFixed(4)}</dd></div>
          <div><dt>左侧起点焦线距离</dt><dd>{diagnostics.unitLeftFocalDistanceAtStart.toFixed(4)}</dd></div>
        </dl>
        <div className="curved-helix-scrub"><label htmlFor="nonuniform-helix-position">
          曲线位置<strong>u={(frame.u/Math.PI).toFixed(3)}π</strong></label>
          <input id="nonuniform-helix-position" type="range" min="0" max="127"
            value={active} onChange={event=>setActive(Number(event.target.value))}/>
        </div>
        <p className="curved-helix-summary">原单位长左母线在起点越过焦线 0.7132；因此图中仅画宽度 0.5 的正则局部带。</p>
        <p className="curved-helix-summary">原 In[3966] 未将 2D 调用中的 128 点选项向内部数值函数转发。本地 128 点用于预览，不冒充 Wolfram 插值点表。</p>
      </aside>
      <main className="curved-helix-results">
        <div className="curved-helix-heading"><div><span>02 / 同参数对照</span>
          <strong>变折角螺旋的二维平展与三维曲折</strong></div>
          <small>源式三维母线 · 二维数值积分</small></div>
        <div className="curved-helix-panels">
          <section className="curved-helix-panel"><header><span>PLANE · 2D</span><strong>数值平展</strong></header>
            <PreviewDrawing sample={sample} folded={false} azimuth={azimuth} active={active}/>
            <p>初值 f(0)=(1,0)，切线 T(0)=(0,1)</p></section>
          <section className="curved-helix-panel"><header><span>SPACE · 3D</span><strong>源式曲折投影</strong></header>
            <PreviewDrawing sample={sample} folded azimuth={azimuth} active={active}/>
            <label className="curved-helix-azimuth">视角 <input type="range" min="-180" max="180"
              value={azimuth} onChange={event=>setAzimuth(Number(event.target.value))}
              aria-label="三维视角方位角"/><b>{azimuth}°</b></label></section>
        </div>
        <div className="curved-helix-legend"><span><i className="crease"/>曲线折痕</span>
          <span><i className="left"/>左母线</span><span><i className="right"/>右母线</span>
          <small>滑块选择共同参数位置</small></div>
        <div className="curved-helix-verification"><strong>局部连续等距与可展 · 预览宽度正则</strong>
          <span>坐标积分与曲线采样为数值近似；未核 Wolfram 逐点 Out、连续部署或碰撞。</span></div>
        <footer className="curved-helix-footer"><span>只读诊断 · 不生成精确 FOLD · 不可采用</span>
          <button className="primary" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
