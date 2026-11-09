import {useMemo,useState} from 'react';
import {CONIC_OPTICAL_EXAMPLES,sampleConicOptical,type ConicCell,type ConicOpticalSample,type Point2}
  from '../app/curvedConicOptical';
import {TessDialog} from './TessellationEditor';
import './CurvedConicOpticalDialog.css';

function path(points:Point2[]):string{
  return points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(9)} ${(-y).toFixed(9)}`).join(' ');
}
function bounds(points:Point2[]):string{
  const x=points.map(p=>p[0]),y=points.map(p=>-p[1]);
  const x0=Math.min(...x),x1=Math.max(...x),y0=Math.min(...y),y1=Math.max(...y);
  const pad=Math.max(x1-x0,y1-y0,.5)*.14;
  return `${x0-pad} ${y0-pad} ${x1-x0+2*pad} ${y1-y0+2*pad}`;
}
function OpticalDrawing({sample,active}:{sample:ConicOpticalSample;active:number}){
  const rows=sample.frames;
  const fold=rows.map(r=>r.fold),left=rows.map(r=>r.secondLeft),right=rows.map(r=>r.secondRight);
  const virtualLeft=rows.map(r=>r.directrixLeft),virtualRight=rows.map(r=>r.directrixRight);
  const viewBox=bounds([...fold,...left,...right,...virtualLeft,...virtualRight]);
  const marker=Math.max(...viewBox.split(' ').slice(2).map(Number))*.009;
  const line=(a:Point2,b:Point2,key:string,cls:string)=><line key={key} className={cls}
    x1={a[0]} y1={-a[1]} x2={b[0]} y2={-b[1]} vectorEffect="non-scaling-stroke"/>;
  const source=sample.source;
  return <svg data-testid="conic-optical-drawing" role="img"
    aria-label={`${source.label}保存例的折线、左右次横曲线、准线和光线`}
    viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
    {rows.filter((_,i)=>i%8===0).flatMap((r,i)=>[
      line(r.directrixLeft,r.fold,`vl-${i}`,'conic-optical-virtual left'),
      line(r.directrixRight,r.fold,`vr-${i}`,'conic-optical-virtual right'),
      line(r.secondLeft,r.fold,`rl-${i}`,'conic-optical-ray left'),
      line(r.secondRight,r.fold,`rr-${i}`,'conic-optical-ray right'),
    ])}
    <path className="conic-optical-cross left" d={path(left)}/>
    <path className="conic-optical-cross right" d={path(right)}/>
    {source.leftFocus===null?<path className="conic-optical-directrix left" d={path(virtualLeft)}/>:
      <circle className="conic-optical-focus left" cx={virtualLeft[0][0]} cy={-virtualLeft[0][1]} r={marker*1.45}/>}
    {source.rightFocus===null?<path className="conic-optical-directrix right" d={path(virtualRight)}/>:
      <circle className="conic-optical-focus right" cx={virtualRight[0][0]} cy={-virtualRight[0][1]} r={marker*1.45}/>}
    {line(rows[active].secondLeft,rows[active].fold,'active-l','conic-optical-active left')}
    {line(rows[active].secondRight,rows[active].fold,'active-r','conic-optical-active right')}
    <path className="conic-optical-fold" d={path(fold)}/>
    <circle className="conic-optical-marker" cx={fold[active][0]} cy={-fold[active][1]} r={marker}/>
  </svg>;
}

const fmt=(p:Point2)=>`(${p[0].toFixed(4)}, ${p[1].toFixed(4)})`;
export default function CurvedConicOpticalDialog({onClose}:{onClose:()=>void}){
  const [cell,setCell]=useState<ConicCell>('In[4020]');
  const [active,setActive]=useState(48);
  const sample=useMemo(()=>sampleConicOptical(cell),[cell]);
  const row=sample.frames[active],source=sample.source;
  return <TessDialog title="圆锥曲线光学保存例 · In[4020]–In[4025]" onClose={onClose}>
    <div className="conic-optical-dialog">
      <aside className="conic-optical-controls">
        <div className="conic-optical-eyebrow">SOURCE / SECTION 45</div>
        <h3>六种固定保存输入</h3>
        <label className="conic-optical-select">保存例
          <select aria-label="圆锥曲线光学保存例" value={cell}
            onChange={event=>{setCell(event.target.value as ConicCell);setActive(48)}}>
            {CONIC_OPTICAL_EXAMPLES.map(item=><option key={item.cell} value={item.cell}>
              {item.cell} · {item.label}</option>)}
          </select>
        </label>
        <p className="conic-optical-params">{source.description}<br/>
          t∈[0,{source.end===Math.PI/4?'π/4':'π/2'}]；源定义 In[4019]。</p>
        <label className="conic-optical-slider">参数位置 <strong>{(row.t*180/Math.PI).toFixed(2)}°</strong>
          <input aria-label="圆锥曲线参数位置" type="range" min="0" max="96"
            value={active} onChange={event=>setActive(Number(event.target.value))}/>
        </label>
        <dl className="conic-optical-values">
          <div><dt>折线 f(t)</dt><dd>{fmt(row.fold)}</dd></div>
          <div><dt>左次横曲线</dt><dd>{fmt(row.secondLeft)}</dd></div>
          <div><dt>右次横曲线</dt><dd>{fmt(row.secondRight)}</dd></div>
          <div><dt>本地预览分段</dt><dd>{sample.localPreviewDivisions}</dd></div>
        </dl>
        <p className="conic-optical-note">图中的 96 段仅为本地绘图采样；原保存例没有可机读的数值 Out。</p>
      </aside>
      <main className="conic-optical-results">
        <header><div><span>OPTICAL CONIC / 2D</span><strong>{source.label}</strong></div>
          <small>{source.cell} · 解析源式</small></header>
        <div className="conic-optical-canvas"><OpticalDrawing sample={sample} active={active}/></div>
        <div className="conic-optical-legend"><span className="fold">曲线折线</span>
          <span className="left">左次横曲线与母线</span><span className="right">右次横曲线与母线</span>
          <span className="virtual">虚线连接准线／焦点</span></div>
        <div className="conic-optical-proof"><strong>六例源式逐点校核通过</strong>
          <span>隐式曲线最大残差 {sample.maxConicResidual.toExponential(2)}；
            光线共线最大残差 {sample.maxRayCollinearityResidual.toExponential(2)}；
            母线单位长度误差 {sample.maxDirectorUnitResidual.toExponential(2)}。</span></div>
        <footer><span>二维光学只读图 · 未生成三维折面、精确 FOLD 或可采用纸面</span>
          <button className="primary" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
