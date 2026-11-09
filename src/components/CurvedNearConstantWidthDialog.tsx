import {useMemo,useState} from 'react';
import {sampleNearWidthSaved,type NearWidthCell,type NearWidthSample,type Point2}
  from '../app/curvedNearConstantWidthIn3872';
import {TessDialog} from './TessellationEditor';
import './CurvedConicOpticalDialog.css';
import './CurvedNearConstantWidthDialog.css';
import CurvedGenericNearWidthDialog from './CurvedGenericNearWidthDialog';

function path(points:Point2[]):string{
  return points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(9)} ${(-y).toFixed(9)}`).join(' ');
}
function bounds(points:Point2[]):string{
  const xs=points.map(p=>p[0]),ys=points.map(p=>-p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const pad=Math.max(x1-x0,y1-y0,.5)*.13;
  return `${x0-pad} ${y0-pad} ${x1-x0+2*pad} ${y1-y0+2*pad}`;
}
function BandDrawing({sample,active}:{sample:NearWidthSample;active:number}){
  const base=sample.rows.map(row=>row.base),outer=sample.rows.map(row=>row.outer);
  const marker=outer[active],viewBox=bounds([...base,...outer]);
  const radius=Math.max(...viewBox.split(' ').slice(2).map(Number))*.011;
  return <svg role="img" aria-label="近恒宽保存例二维直纹带"
    data-testid="near-width-band" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
    <path className="near-width-fill" d={`${path([...base,...outer.slice().reverse()])} Z`}/>
    {sample.rulingFrameIndices.map(i=><line key={i} className="near-width-ruling"
      x1={base[i][0]} y1={-base[i][1]} x2={outer[i][0]} y2={-outer[i][1]}
      vectorEffect="non-scaling-stroke"/>)}
    <path className="near-width-base" d={path(base)}/>
    <path className="near-width-outer" d={path(outer)}/>
    <line className="near-width-active" x1={base[active][0]} y1={-base[active][1]}
      x2={marker[0]} y2={-marker[1]} vectorEffect="non-scaling-stroke"/>
    <circle className="near-width-marker" cx={marker[0]} cy={-marker[1]}
      r={radius} vectorEffect="non-scaling-stroke"/>
  </svg>;
}
function WidthDrawing({sample,active}:{sample:NearWidthSample;active:number}){
  const w=sample.rows.map(row=>[row.u,row.rulingLength] as Point2);
  const h=sample.rows.map(row=>[row.u,row.verticalGap] as Point2);
  const viewBox=bounds([...w,...h,[0,0]]),point=w[active];
  const radius=Math.max(...viewBox.split(' ').slice(2).map(Number))*.012;
  return <svg role="img" aria-label="近恒宽保存例母线长度与垂直距离"
    data-testid="near-width-function" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
    <path className="near-width-chart-grid" d={path([[0,0],[Math.PI/3,0]])}/>
    <path className="near-width-chart-ruling" d={path(w)}/>
    <path className="near-width-chart-gap" d={path(h)}/>
    <circle className="near-width-marker" cx={point[0]} cy={-point[1]}
      r={radius} vectorEffect="non-scaling-stroke"/>
  </svg>;
}

export default function CurvedNearConstantWidthDialog({onClose}:{onClose:()=>void}){
  const [generic,setGeneric]=useState(false);
  const [cell,setCell]=useState<NearWidthCell>('In[3872]'),[active,setActive]=useState(48);
  const sample=useMemo(()=>sampleNearWidthSaved(cell),[cell]);
  const row=sample.rows[active],d=sample.diagnostics;
  if(generic)return <CurvedGenericNearWidthDialog onClose={onClose} onSaved={()=>setGeneric(false)}/>;
  return <TessDialog title="近恒宽比例 · In[3872]/In[3875]" onClose={onClose}>
    <div className="conic-optical-dialog near-width-dialog">
      <aside className="conic-optical-controls">
        <div className="conic-optical-eyebrow">SOURCE / SECTION 45</div>
        <h3>相同输入，两种调用。</h3>
        <label className="conic-optical-select">构造范围<select aria-label="近恒宽构造范围" value="saved" onChange={()=>setGeneric(true)}><option value="saved">原版保存输入</option><option value="generic">自定义曲线与母线</option></select></label>
        <label className="conic-optical-select">保存例
          <select aria-label="近恒宽保存例" value={cell}
            onChange={event=>{setCell(event.target.value as NearWidthCell);setActive(48)}}>
            <option value="In[3872]">In[3872] · 解析比例函数</option>
            <option value="In[3875]">In[3875] · 原数值调用</option>
          </select></label>
        <p className="conic-optical-params">b(u)=(u,0)，d(u)=(sin u,cos u)，
          u∈[0,π/3]，w(u)=0.5·ws(u)。</p>
        <label className="conic-optical-slider">参数位置
          <strong>{(row.u*180/Math.PI).toFixed(2)}°</strong>
          <input aria-label="近恒宽参数位置" type="range" min="0" max="96"
            value={active} onChange={event=>setActive(Number(event.target.value))}/></label>
        <dl className="conic-optical-values">
          <div><dt>解析比例 ws=sec u</dt><dd>{row.scale.toFixed(5)}</dd></div>
          <div><dt>母线长度 w</dt><dd>{row.rulingLength.toFixed(5)}</dd></div>
          <div><dt>顶边高度</dt><dd>{row.verticalGap.toFixed(5)}</dd></div>
          <div><dt>带面 Jacobian 下界</dt><dd>{d.jacobianLowerBound.toFixed(3)}</dd></div>
        </dl>
        <p className="conic-optical-note">In[3875] 先用 `FunctionInterpolationAlt` 处理输入与比例函数；这里显示共同的解析输入式，不声称复制 Wolfram 数值插值点。</p>
      </aside>
      <main className="conic-optical-results">
        <header><div><span>NEAR CONSTANT WIDTH / 2D</span>
          <strong>水平顶边来自变化的母线长度</strong></div><small>{cell}</small></header>
        <div className="near-width-charts">
          <section><header>二维直纹带 · 顶边 y=0.5</header>
            <BandDrawing sample={sample} active={active}/></section>
          <section><header>长度 w(u) 与垂直宽度</header>
            <WidthDrawing sample={sample} active={active}/></section>
        </div>
        <div className="conic-optical-legend"><span className="fold">基线 b</span>
          <span className="left">顶边</span><span className="right">母线／长度 w</span>
          <span className="virtual">垂直宽度 0.5</span></div>
        <div className="conic-optical-proof"><strong>固定保存输入的二维带全域正则且不自交</strong>
          <span>ws·√(1−(t·d)²) 残差 {d.scaleIdentityMaximumResidual.toExponential(1)}；
            顶边 y=0.5 残差 {d.outerHeightMaximumResidual.toExponential(1)}。
            该结论仅针对本例解析输入。</span></div>
        <footer><span>与 NConstantWidthScale2D 不同 · 只读二维 · 非精确 FOLD</span>
          <button className="primary" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
