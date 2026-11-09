import {useEffect,useId,useMemo,useState} from 'react';
import {certifySmoothMotion,creaseFrame,DEFAULT_MOTION_PARAMETERS,
  firstFundamentalForm,inverseMotionPoint,motionEnvelope,motionPoint,paperPoint,savedEndpointResidual,
  type MotionParameters,type Point2,type Point3} from '../app/curvedCircleSmoothMotionIn3992';
import {TessDialog} from './TessellationEditor';
import './CurvedCircleSmoothMotionDialog.css';

const draw=(points:Point2[])=>points.map(([x,y],i)=>
  `${i?'L':'M'}${x.toPrecision(9)} ${(-y).toPrecision(9)}`).join(' ');
const project=(point:Point3,angle:number):Point2=>{
  const a=angle*Math.PI/180,e=.48,
    depth=Math.sin(a)*point[0]+Math.cos(a)*point[1];
  return [Math.cos(a)*point[0]-Math.sin(a)*point[1],
    -Math.sin(e)*depth+Math.cos(e)*point[2]];
};
function bounds(groups:Point2[][]){
  const points=groups.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>-p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),
    span=Math.max(x1-x0,y1-y0,.1),pad=.12*span;
  return {box:`${x0-pad} ${y0-pad} ${x1-x0+2*pad} ${y1-y0+2*pad}`,
    marker:.009*span};
}
function MotionDiagram({space,progress,parameters,arcFraction,offset,angle,sourceCell}:{
  space:'flat'|'spatial';progress:number;parameters:MotionParameters;
  arcFraction:number;offset:number;angle:number;
  sourceCell:'3992'|'3995';
}){
  const {arcEnd,leftWidth,rightWidth}=parameters;
  const markerId=useId().replace(/:/g,''),vectorLength=sourceCell==='3992'?1:.5;
  const geometry=useMemo(()=>{
    const point=(s:number,w:number):Point2=>space==='flat'?
      paperPoint(s,w,parameters):project(motionPoint(progress,s,w,parameters),angle);
    const samples=Array.from({length:101},(_,i)=>arcEnd*i/100);
    const crease=samples.map(s=>point(s,0)),left=samples.map(s=>point(s,-leftWidth)),
      right=samples.map(s=>point(s,rightWidth));
    const crossSections=Array.from({length:13},(_,i)=>{
      const s=arcEnd*i/12;
      return {left:[point(s,-leftWidth),point(s,0)],
        right:[point(s,0),point(s,rightWidth)]};
    });
    const longitudinal=[...[-.75,-.5,-.25].map(k=>samples.map(s=>point(s,k*leftWidth))),
      ...[.25,.5,.75].map(k=>samples.map(s=>point(s,k*rightWidth)))];
    const s=arcEnd*arcFraction,w=offset<0?offset*leftWidth:offset*rightWidth,
      marker=point(s,w),creaseMarker=point(s,0),
      ruling=[point(s,-leftWidth),creaseMarker,point(s,rightWidth)];
    return {crease,left,right,crossSections,longitudinal,marker,creaseMarker,ruling};
  },[space,progress,parameters,arcEnd,leftWidth,rightWidth,arcFraction,offset,angle]);
  const start=creaseFrame(space==='flat'?0:progress,0,parameters),
    sourceVectors=[start.leftRuling,start.rightRuling].map(direction=>{
      const endpoint=start.point.map((value,i)=>value+vectorLength*direction[i]) as Point3;
      return space==='flat'?[start.point.slice(0,2) as Point2,endpoint.slice(0,2) as Point2]:
        [project(start.point,angle),project(endpoint,angle)];
    });
  const flatBounds=bounds([geometry.crease,geometry.left,geometry.right,...sourceVectors,
    ...geometry.longitudinal,...geometry.crossSections.flatMap(section=>[section.left,section.right])]);
  // Keep the camera fixed through playback. The complete enclosing cylinder
  // bounds every material point analytically; per-frame autofit would animate
  // the zoom and conceal the true contraction of the spatial crease.
  const envelope=motionEnvelope(parameters),e=.48,
    radius=Math.max(3,envelope.radialRadius),
    spatialBounds=bounds([[
      [-radius,-Math.sin(e)*radius],
      [radius,Math.sin(e)*radius+Math.cos(e)*Math.max(Math.sqrt(3)/2,envelope.maximumHeight)],
    ]]);
  const {box,marker}=space==='flat'?flatBounds:spatialBounds;
  return <svg role="img" data-testid={`smooth-motion-${space}`}
    aria-label={space==='flat'?'固定二维有限纸张和圆弧折痕':'连续等距运动的三维有限纸张'}
    viewBox={box}>
    <defs>{['left','right'].map((side,i)=><marker key={side}
      id={`${markerId}-${side}`} viewBox="0 0 5 5" refX="4.5" refY="2.5"
      markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M0 0 L5 2.5 L0 5 Z" fill={i?'#74d6a2':'#ff8585'}/>
    </marker>)}</defs>
    <path className="ccsm-sheet ccsm-left" d={draw([
      ...geometry.crease,...geometry.left.slice().reverse()])+' Z'}/>
    <path className="ccsm-sheet ccsm-right" d={draw([
      ...geometry.crease,...geometry.right.slice().reverse()])+' Z'}/>
    {geometry.longitudinal.map((line,i)=><path key={`l${i}`} className="ccsm-mesh"
      d={draw(line)}/>)}
    {geometry.crossSections.map((section,i)=><g key={i}>
      <path className="ccsm-mesh" d={draw(section.left)}/>
      <path className="ccsm-mesh" d={draw(section.right)}/>
    </g>)}
    <path className="ccsm-boundary" d={draw(geometry.left)}/>
    <path className="ccsm-boundary" d={draw(geometry.right)}/>
    <path className="ccsm-crease" d={draw(geometry.crease)}/>
    <path className="ccsm-selected-ruling" d={draw(geometry.ruling)}/>
    {sourceVectors.map((line,i)=><path key={`v${i}`}
      data-testid={`smooth-motion-${space}-source-vector-${i}`}
      className={`ccsm-source-vector ccsm-vector-${i?'right':'left'}`}
      d={draw(line)} markerEnd={`url(#${markerId}-${i?'right':'left'})`}/>) }
    <circle className="ccsm-crease-marker" cx={geometry.creaseMarker[0]}
      cy={-geometry.creaseMarker[1]} r={marker*.7}/>
    <circle className="ccsm-marker" cx={geometry.marker[0]}
      cy={-geometry.marker[1]} r={marker}/>
  </svg>;
}

export default function CurvedCircleSmoothMotionDialog({onClose}:{onClose:()=>void}){
  const [progress,setProgress]=useState(0),[playing,setPlaying]=useState(false),
    [parameters,setParameters]=useState<MotionParameters>(DEFAULT_MOTION_PARAMETERS),
    [arcFraction,setArcFraction]=useState(.5),[offset,setOffset]=useState(0),
    [angle,setAngle]=useState(-38),[sourceCell,setSourceCell]=useState<'3992'|'3995'>('3992');
  useEffect(()=>{
    if(!playing)return;
    const start=performance.now(),initial=progress>=1?0:progress;
    let handle=0;
    const tick=(now:number)=>{
      const next=Math.min(1,initial+(now-start)/4500);
      setProgress(next);
      if(next>=1)setPlaying(false);
      else handle=requestAnimationFrame(tick);
    };
    handle=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(handle);
  // Playback deliberately starts from the progress at which the button was pressed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[playing]);
  const certificate=useMemo(()=>certifySmoothMotion(parameters),[parameters]),
    residual=useMemo(()=>savedEndpointResidual(parameters),[parameters]),
    half=progress*Math.PI/3,c=Math.cos(half),
    w=offset<0?offset*parameters.leftWidth:offset*parameters.rightWidth,
    metric=firstFundamentalForm(w),
    selectedS=parameters.arcEnd*arcFraction,
    frame=creaseFrame(progress,selectedS,parameters),
    selectedPoint=motionPoint(progress,selectedS,w,parameters),
    recovered=inverseMotionPoint(progress,selectedPoint,parameters),
    inverseResidual=Math.hypot(recovered.s-selectedS,recovered.w-w);
  const changeProgress=(value:number)=>{setPlaying(false);setProgress(value);};
  const changeParameters=(patch:Partial<MotionParameters>)=>{
    setPlaying(false);setParameters(previous=>({...previous,...patch}));
  };
  const play=()=>{
    if(playing){setPlaying(false);return;}
    if(progress>=1)setProgress(0);
    setPlaying(true);
  };
  return <TessDialog title="第 45 节 · 圆弧跨面连续等距运动 · In[3992]" onClose={onClose}>
    <div className="curved-circle-smooth-motion">
      <aside className="ccsm-controls">
        <span className="ccsm-eyebrow">SOURCE-ENDPOINT / CERTIFIED SMOOTH PATH</span>
        <h2>同一张纸，从平展到保存态</h2>
        <p>固定二维扇形纸张；空间折痕会随折角收缩，到 120° 时精确到达原保存曲面。</p>
        <label className="ccsm-source-choice">保存图母线标记
          <select value={sourceCell} aria-label="圆弧跨面保存图标记"
            onChange={event=>setSourceCell(event.target.value as '3992'|'3995')}>
            <option value="3992">In[3992] · 单位母线向量</option>
            <option value="3995">In[3995] · 半单位母线向量</option>
          </select></label>
        <div className="ccsm-motion-actions">
          <button type="button" aria-pressed={playing} onClick={play}>
            {playing?'暂停运动':progress>=1?'重播运动':'播放运动'}</button>
          <button type="button" onClick={()=>changeProgress(0)}>平展</button>
          <button type="button" onClick={()=>changeProgress(1)}>保存态</button>
        </div>
        <label className="ccsm-slider">运动进度 <strong>{(progress*100).toFixed(1)}%</strong>
          <input type="range" min="0" max="1" step="0.005" value={progress}
            aria-label="运动进度" onChange={event=>changeProgress(Number(event.target.value))}/>
        </label>
        <dl className="ccsm-readouts">
          <div><dt>空间折角 γ</dt><dd>{(120*progress).toFixed(1)}°</dd></div>
          <div><dt>空间折痕半径</dt><dd>{(2*c).toFixed(4)}</dd></div>
          <div><dt>当前第一基本形式</dt><dd>{metric.E.toFixed(4)}, 0, 1</dd></div>
          <div><dt>原源式终态最大残差</dt><dd>{residual.maximum.toExponential(1)}</dd></div>
          <div><dt>当前材料逆映射残差</dt><dd>{inverseResidual.toExponential(1)}</dd></div>
        </dl>
        <div className="ccsm-subheading">有限纸张裁剪</div>
        <label className="ccsm-slider">左宽 <strong>{parameters.leftWidth.toFixed(2)}</strong>
          <input type="range" min="0.1" max="1.5" step="0.05"
            value={parameters.leftWidth} aria-label="连续纸张左宽"
            onChange={event=>changeParameters({leftWidth:Number(event.target.value)})}/>
        </label>
        <label className="ccsm-slider">右宽 <strong>{parameters.rightWidth.toFixed(2)}</strong>
          <input type="range" min="0.1" max="2" step="0.05"
            value={parameters.rightWidth} aria-label="连续纸张右宽"
            onChange={event=>changeParameters({rightWidth:Number(event.target.value)})}/>
        </label>
        <label className="ccsm-slider">圆弧终点 / π <strong>{(parameters.arcEnd/Math.PI).toFixed(2)}</strong>
          <input type="range" min="0.125" max="1" step="0.005"
            value={parameters.arcEnd/Math.PI} aria-label="连续纸张圆弧终点"
            onChange={event=>changeParameters({arcEnd:Math.PI*Number(event.target.value)})}/>
        </label>
        <div className="ccsm-subheading">定位与视角</div>
        <label className="ccsm-slider">折痕位置 / 弧长 <strong>{selectedS.toFixed(2)}</strong>
          <input type="range" min="0" max="1" step="0.01" value={arcFraction}
            aria-label="连续纸张折痕位置" onChange={event=>setArcFraction(Number(event.target.value))}/>
        </label>
        <label className="ccsm-slider">横向位置 <strong>{w.toFixed(2)}</strong>
          <input type="range" min="-1" max="1" step="0.01" value={offset}
            aria-label="连续纸张横向位置" onChange={event=>setOffset(Number(event.target.value))}/>
        </label>
        <label className="ccsm-slider">空间视角 <strong>{angle}°</strong>
          <input type="range" min="-180" max="180" value={angle}
            aria-label="连续纸张空间视角" onChange={event=>setAngle(Number(event.target.value))}/>
        </label>
      </aside>
      <main className="ccsm-results">
        <div className="ccsm-heading"><span>02 / SAME MATERIAL COORDINATES</span>
          <strong>{progress===0?'平展起点':progress===1?'原保存终态':'连续等距中间态'}</strong></div>
        <div className="ccsm-panels">
          <section className="ccsm-panel"><header><span>FIXED PAPER / 2D</span>
            <strong>二维圆弧折痕与有限扇形纸张</strong></header>
            <MotionDiagram space="flat" progress={progress} parameters={parameters}
              arcFraction={arcFraction} offset={offset} angle={angle} sourceCell={sourceCell}/>
            <small>P(s,w)=(2+w)(cos(s/2),sin(s/2))，折痕 w=0。</small></section>
          <section className="ccsm-panel"><header><span>CONTINUOUS FOLD / 3D</span>
            <strong>同参数光滑等距运动</strong></header>
            <MotionDiagram space="spatial" progress={progress} parameters={parameters}
              arcFraction={arcFraction} offset={offset} angle={angle} sourceCell={sourceCell}/>
            <small>λ=1 恰为原解析 F 与左右母线；红／绿向量长 {sourceCell==='3992'?'1':'½'}。</small></section>
        </div>
        <div className="ccsm-proof"><strong>全路径已证明：等距、正则、无自碰撞</strong>
          <span>零厚度纸张，含平展起点与全部闭边界。最小径向半径 {certificate.minimumRadialRadius.toFixed(3)}；最小雅可比 {certificate.minimumJacobian.toFixed(3)}；最大方位角跨度 {(certificate.maximumAzimuthSweep/Math.PI).toFixed(2)}π。解析逆映射唯一恢复每个材料点；左右片只沿折痕共边。</span></div>
        <div className="ccsm-source">当前位置：F=({frame.point.map(v=>v.toFixed(3)).join(', ')})；λ=1 时 γ=120°、F=(cos s,sin s,0)、rL=(−½eᵣ,√3/2)、rR=(½eᵣ,√3/2)。In[3995] 用相同解析目标与半单位起点向量；本地不复刻 Wolfram 插值误差。红／绿箭头是母线参考向量，独立于纸张裁宽。</div>
        <div className="ccsm-limit">这是光滑纸张的连续等距运动证书。现有 In[3992]/[3995] 多面体 FOLD 是另一项静态伴随构造；此证明不认证它的刚体折叠路径、平折层序或 Wolfram 插值输出。</div>
        <footer className="ccsm-footer"><span>源式终态一致 · 非 Wolfram 逐点 Out</span>
          <button className="primary" type="button" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
