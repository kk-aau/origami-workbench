import {useMemo,useState} from 'react';
import {sampleConicEllipseFoldIn4034,type EllipseFoldSample,type Point2,type Point3}
  from '../app/curvedConicEllipseFoldIn4034';
import {TessDialog} from './TessellationEditor';
import './CurvedUniformHelixDialog.css';

function path(points:Point2[]):string{
  return points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(10)} ${(-y).toFixed(10)}`).join(' ');
}
function bounds(points:Point2[]):string{
  const xs=points.map(p=>p[0]),ys=points.map(p=>-p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const pad=Math.max(x1-x0,y1-y0,.1)*.12;
  return `${x0-pad} ${y0-pad} ${x1-x0+2*pad} ${y1-y0+2*pad}`;
}
function project([x,y,z]:Point3,azimuthDeg:number):Point2{
  const a=azimuthDeg*Math.PI/180,e=28*Math.PI/180;
  const xx=Math.cos(a)*x-Math.sin(a)*y;
  const depth=Math.sin(a)*x+Math.cos(a)*y;
  return [xx,-Math.sin(e)*depth+Math.cos(e)*z];
}
function Drawing({sample,folded,azimuth,active}:{sample:EllipseFoldSample;folded:boolean;
  azimuth:number;active:number}){
  const crease=sample.frames.map(row=>folded?project(row.foldedCrease,azimuth):row.flatCrease);
  const left=folded?sample.foldedLeftBoundary.map(p=>project(p,azimuth)):sample.flatLeftBoundary;
  const right=folded?sample.foldedRightBoundary.map(p=>project(p,azimuth)):sample.flatRightBoundary;
  const viewBox=bounds([...crease,...left,...right]);
  const radius=Math.max(...viewBox.split(' ').slice(2).map(Number))*.01;
  const shape=(outer:Point2[])=>path([...crease,...outer.slice().reverse()])+' Z';
  const line=(outer:Point2[],i:number,side:'left'|'right')=><line key={`${side}-${i}`}
    className={`curved-helix-ruling ${side}`} x1={crease[i][0]} y1={-crease[i][1]}
    x2={outer[i][0]} y2={-outer[i][1]} vectorEffect="non-scaling-stroke"/>;
  return <svg data-testid={folded?'conic-ellipse-folded':'conic-ellipse-flat'}
    role="img" aria-label={folded?'In[4034] 双焦点椭圆三维折面投影':'In[4034] 双焦点椭圆二维平展'}
    viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
    <path className="curved-helix-band left" d={shape(left)}/>
    <path className="curved-helix-band right" d={shape(right)}/>
    <path className="curved-helix-boundary left" d={path(left)}/>
    <path className="curved-helix-boundary right" d={path(right)}/>
    {sample.rulingFrameIndices.map(i=>line(left,i,'left'))}
    {sample.rulingFrameIndices.map(i=>line(right,i,'right'))}
    <line className="curved-helix-active left" x1={crease[active][0]} y1={-crease[active][1]}
      x2={left[active][0]} y2={-left[active][1]} vectorEffect="non-scaling-stroke"/>
    <line className="curved-helix-active right" x1={crease[active][0]} y1={-crease[active][1]}
      x2={right[active][0]} y2={-right[active][1]} vectorEffect="non-scaling-stroke"/>
    <path className="curved-helix-crease" d={path(crease)}/>
    <circle className="curved-helix-start" cx={crease[0][0]} cy={-crease[0][1]}
      r={radius*.65} vectorEffect="non-scaling-stroke"/>
    <circle className="curved-helix-marker" cx={crease[active][0]} cy={-crease[active][1]}
      r={radius} vectorEffect="non-scaling-stroke"/>
  </svg>;
}

export default function CurvedConicEllipseFoldDialog({onClose}:{onClose:()=>void}){
  const sample=useMemo(()=>sampleConicEllipseFoldIn4034(),[]);
  const [active,setActive]=useState(48),[azimuth,setAzimuth]=useState(-35);
  const row=sample.frames[active],d=sample.diagnostics;
  return <TessDialog title="双焦点椭圆三维曲折 · In[4034]" onClose={onClose}>
    <div className="curved-helix-dialog">
      <aside className="curved-helix-controls">
        <div className="curved-helix-section-title"><span>01 / 保存输入</span></div>
        <p className="curved-helix-summary">fL=−1、fR=−2；hL=−1/2、hR=1/2。<br/>
          数值曲折实际区间 u∈[0,120°]，初始折角 γ(0)=−60°。</p>
        <dl className="curved-helix-readouts">
          <div><dt>由源方程恢复的折角</dt><dd>−60° · 常数</dd></div>
          <div><dt>本地预览母线宽度</dt><dd>0.5</dd></div>
          <div><dt>左 Jacobian 全区间下界</dt><dd>{d.leftJacobianLowerBound.toFixed(3)}</dd></div>
          <div><dt>右 |Jacobian| 全区间下界</dt><dd>{d.rightJacobianMagnitudeLowerBound.toFixed(3)}</dd></div>
          <div><dt>双侧 cotρ 差上限</dt><dd>{d.sourceCotDifferenceMaximum.toExponential(1)}</dd></div>
          <div><dt>数值积分收敛误差</dt><dd>{d.integrationConvergenceMaximum.toExponential(1)}</dd></div>
        </dl>
        <div className="curved-helix-scrub"><label htmlFor="conic-ellipse-position">
          曲线位置<strong>u={(row.u*180/Math.PI).toFixed(2)}°</strong></label>
          <input id="conic-ellipse-position" type="range" min="0" max="96"
            value={active} onChange={event=>setActive(Number(event.target.value))}/>
        </div>
        <p className="curved-helix-summary">原单元先写光学区间 [−60°,60°]，又改写为 [0°,120°]；最终两图和三维计算均采用后一范围。</p>
        <p className="curved-helix-summary">三维坐标为本地 RK4 积分结果；原笔记本无可机读的 Wolfram 数值 Out。</p>
      </aside>
      <main className="curved-helix-results">
        <div className="curved-helix-heading"><div><span>02 / 同参数对照</span>
          <strong>椭圆平展与空间曲折</strong></div><small>解析二维 · 数值 Frenet 三维</small></div>
        <div className="curved-helix-panels">
          <section className="curved-helix-panel"><header><span>PLANE · 2D</span><strong>源式椭圆光学母线</strong></header>
            <Drawing sample={sample} folded={false} azimuth={azimuth} active={active}/>
            <p>折线与左右次横曲线由 In[4019] 固定参数生成</p></section>
          <section className="curved-helix-panel"><header><span>SPACE · 3D</span><strong>In[3977] 数值恢复</strong></header>
            <Drawing sample={sample} folded azimuth={azimuth} active={active}/>
            <label className="curved-helix-azimuth">视角 <input aria-label="椭圆三维视角方位角"
              type="range" min="-180" max="180" value={azimuth}
              onChange={event=>setAzimuth(Number(event.target.value))}/><b>{azimuth}°</b></label></section>
        </div>
        <div className="curved-helix-legend"><span><i className="crease"/>椭圆曲折</span>
          <span><i className="left"/>左母线</span><span><i className="right"/>右母线</span>
          <small>滑块同步选择折线位置</small></div>
        <div className="curved-helix-verification"><strong>连续曲面局部等距与可展 · 预览带正则</strong>
          <span>源方程折角恒为 −60°；积分标架正交误差 {d.frameOrthogonalityMaximum.toExponential(1)}，
            平面度量恒等式误差 {d.maxMetricIdentityResidual.toExponential(1)}。</span></div>
        <footer className="curved-helix-footer"><span>只读诊断 · 非精确 FOLD · 不可采用</span>
          <button className="primary" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
