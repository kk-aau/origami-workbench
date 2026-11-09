import {useMemo,useState} from 'react';
import type {CanonicalCase,Point2,Point3} from '../app/curvedCanonicalConeCylinderIn3826';
import {CANONICAL_INPUT_PRESETS,canonicalInputFirstForm,canonicalInputFlatPoint,
  canonicalInputPoint,evaluateCanonicalInput,validateCanonicalInputQuery,
  type CanonicalInputQuery} from '../app/curvedCanonicalParameterized';
import {TessDialog} from './TessellationEditor';
import './CurvedCanonicalConeCylinderDialog.css';

type Sample=ReturnType<typeof evaluateCanonicalInput>;
type View='raw'|'canonical'|'flat';
const drawPath=(points:Point2[])=>points.map(([x,y],i)=>
  `${i?'L':'M'}${x.toPrecision(9)} ${(-y).toPrecision(9)}`).join(' ');
const project=(point:Point3,azimuth:number):Point2=>{
  const a=azimuth*Math.PI/180,e=Math.PI/7;
  const x=Math.cos(a)*point[0]-Math.sin(a)*point[1];
  const depth=Math.sin(a)*point[0]+Math.cos(a)*point[1];
  return [x,-Math.sin(e)*depth+Math.cos(e)*point[2]];
};
function bounds(points:Point2[]){
  const xs=points.map(p=>p[0]),ys=points.map(p=>-p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const span=Math.max(x1-x0,y1-y0,.1),pad=.13*span;
  return {box:`${x0-pad} ${y0-pad} ${x1-x0+2*pad} ${y1-y0+2*pad}`,
    marker:.012*span};
}
function Diagram({sample,kind,view,azimuth,active,crossV}:{sample:Sample;
  kind:CanonicalCase;view:View;azimuth:number;active:number;crossV:number}){
  const planar=view==='flat';
  const convert=(point:Point2|Point3)=>planar?point as Point2:project(point as Point3,azimuth);
  const base=(view==='raw'?sample.rawBase:view==='canonical'?sample.canonicalBase:
    sample.flatGrid[0]).map(convert);
  const top=(view==='raw'?sample.rawTip:view==='canonical'?sample.canonicalTip:
    sample.flatGrid.at(-1)!).map(convert);
  const cross=view==='raw'?null:sample.uValues.map(u=>convert(planar?
    canonicalInputFlatPoint(sample.query,u,crossV):canonicalInputPoint(sample.query,u,crossV)));
  const {box,marker}=bounds([...base,...top]);
  const area=drawPath([...base,...top.slice().reverse()])+' Z';
  const ruler=base.map((p,i)=>i%8===0||i===base.length-1?<line key={i}
    className="cdev-ruling" x1={p[0]} y1={-p[1]}
    x2={top[i][0]} y2={-top[i][1]} vectorEffect="non-scaling-stroke"/>:null);
  const current=cross?cross[active]:base[active];
  return <svg role="img" data-testid={`canonical-developable-${view}`}
    aria-label={view==='raw'?'原始输入直纹面':view==='canonical'?'规范化三维可展面':
      '另行推导的二维等距展开'} viewBox={box} preserveAspectRatio="xMidYMid meet">
    <path className="cdev-area" d={area}/>
    {ruler}
    <path className="cdev-base" d={drawPath(base)}/>
    <path className="cdev-top" d={drawPath(top)}/>
    {cross&&<path className="cdev-cross" d={drawPath(cross)}/>}
    <circle className="cdev-marker" cx={current[0]} cy={-current[1]} r={marker}/>
  </svg>;
}

export default function CurvedCanonicalConeCylinderDialog({onClose}:{onClose:()=>void}){
  const [kind,setKind]=useState<CanonicalCase>('cylinder-in3826');
  const [active,setActive]=useState(0),[azimuth,setAzimuth]=useState(-38);
  const [crossFraction,setCrossFraction]=useState(.5),
    [inputs,setInputs]=useState<Record<CanonicalCase,CanonicalInputQuery>>(CANONICAL_INPUT_PRESETS);
  const query=inputs[kind],sample=useMemo(()=>evaluateCanonicalInput(query),[query]),
    crossV=query.rulingStart+crossFraction*(query.rulingEnd-query.rulingStart);
  const u=sample.uValues[active],metric=canonicalInputFirstForm(query,crossV),cone=kind==='cone-in3830',
    saved=sample.source.matchesSavedInput,certificate=sample.certification;
  const choose=(next:CanonicalCase)=>{setKind(next);setActive(0);setCrossFraction(.5);};
  const change=(patch:Partial<CanonicalInputQuery>)=>setInputs(previous=>
    ({...previous,[kind]:validateCanonicalInputQuery({...previous[kind],...patch})}));
  const restore=()=>{setInputs(previous=>({...previous,[kind]:{...CANONICAL_INPUT_PRESETS[kind]}}));
    setActive(0);setCrossFraction(.5);};
  return <TessDialog title="第 45 节 · 规范柱面与锥面" onClose={onClose}>
    <div className="canonical-developable-dialog">
      <aside className="cdev-controls">
        <span className="cdev-eyebrow">01 / CANONICAL DEVELOPABLE</span>
        <h2>从输入母线到规范面</h2>
        <p>调整输入函数参数，实时计算原函数的规范规则。柱面投影基线，锥面保留常锥顶，两者均归一化母线。</p>
        <div className="cdev-switch" role="group" aria-label="规范面保存例">
          <button type="button" aria-pressed={!cone} onClick={()=>choose('cylinder-in3826')}>
            柱面 · In[3826]</button>
          <button type="button" aria-pressed={cone} onClick={()=>choose('cone-in3830')}>
            锥面 · In[3830]</button>
        </div>
        <div className="cdev-preset-state" data-testid="canonical-input-status">
          <span>{saved?'原保存输入':'同族参数变体'}</span>
          <button type="button" onClick={restore}>恢复原保存输入</button></div>
        {query.kind==='cylinder-in3826'?<>
          <label className="cdev-slider">柱面半径 <strong>{query.radius.toFixed(2)}</strong>
            <input type="range" min="0.1" max="3" step="0.05" value={query.radius}
              aria-label="规范柱面半径" onChange={event=>change({radius:Number(event.target.value)})}/></label>
          <label className="cdev-slider">输入基线轴向斜率 <strong>{query.axialPitch.toFixed(2)}</strong>
            <input type="range" min="-4" max="4" step="0.05" value={query.axialPitch}
              aria-label="规范柱面输入斜率" onChange={event=>change({axialPitch:Number(event.target.value)})}/></label>
        </>:<>
          <label className="cdev-slider">锥半角 <strong>{query.angleDeg.toFixed(1)}°</strong>
            <input type="range" min="15" max="75" step="0.5" value={query.angleDeg}
              aria-label="规范锥面半角" onChange={event=>change({angleDeg:Number(event.target.value)})}/></label>
          <label className="cdev-slider">锥顶高度 <strong>{query.apexZ.toFixed(2)}</strong>
            <input type="range" min="-3" max="3" step="0.05" value={query.apexZ}
              aria-label="规范锥面锥顶高度" onChange={event=>change({apexZ:Number(event.target.value)})}/></label>
        </>}
        <label className="cdev-slider">原母线长度 <strong>{query.directorLength.toFixed(2)}</strong>
          <input type="range" min="0.1" max="6" step="0.05" value={query.directorLength}
            aria-label="规范面原母线长度" onChange={event=>change({directorLength:Number(event.target.value)})}/></label>
        <label className="cdev-slider">规范母线起点 <strong>{query.rulingStart.toFixed(2)}</strong>
          <input type="range" min="0" max={Math.min(2,query.rulingEnd-.05)} step="0.05"
            value={query.rulingStart} aria-label="规范面母线起点"
            onChange={event=>change({rulingStart:Number(event.target.value)})}/></label>
        <label className="cdev-slider">规范母线终点 <strong>{query.rulingEnd.toFixed(2)}</strong>
          <input type="range" min={Math.max(.2,query.rulingStart+.05)} max="3" step="0.05"
            value={query.rulingEnd} aria-label="规范面母线终点"
            onChange={event=>change({rulingEnd:Number(event.target.value)})}/></label>
        <dl className="cdev-readouts">
          <div><dt>原母线长度</dt><dd>{query.directorLength.toFixed(3)}</dd></div>
          <div><dt>规范母线长度</dt><dd>1.000</dd></div>
          <div><dt>源区间</dt><dd>{cone?'[0, π]':'[−π/4, 3π/4]'}</dd></div>
          <div><dt>当前 u</dt><dd>{u.toFixed(3)}</dd></div>
          <div><dt>截线 v</dt><dd>{crossV.toFixed(2)}</dd></div>
          <div><dt>面积密度</dt><dd>{metric.area.toFixed(3)}</dd></div>
        </dl>
        <label className="cdev-slider">沿基线位置
          <input type="range" min="0" max={sample.uValues.length-1}
            value={active} aria-label="规范面基线位置"
            onChange={event=>setActive(Number(event.target.value))}/></label>
        <label className="cdev-slider">规范面截线 v
          <input type="range" min="0" max="1" step="0.01" value={crossFraction}
            aria-label="规范面截线高度"
            onChange={event=>setCrossFraction(Number(event.target.value))}/></label>
        <label className="cdev-slider">三维视角 <strong>{azimuth}°</strong>
          <input type="range" min="-180" max="180" value={azimuth}
            aria-label="规范面三维视角"
            onChange={event=>setAzimuth(Number(event.target.value))}/></label>
        <p className="cdev-source">{query.kind==='cone-in3830'?
          `输入锥顶 (0,0,${query.apexZ.toFixed(2)})；v=0 是锥顶奇点，正起点裁剪可得到闭域正则带。`:
          `输入 b=(R cos u,R sin u,p u)，R=${query.radius.toFixed(2)}、p=${query.axialPitch.toFixed(2)}；规范 b 去掉轴向分量。`}</p>
      </aside>
      <main className="cdev-results">
        <div className="cdev-heading"><span>02 / 输入、输出和局部展开</span>
          <strong>{query.kind==='cone-in3830'?`轴沿 x 的 ${query.angleDeg.toFixed(1)}° 圆锥`:
            `半径 ${query.radius.toFixed(2)} 圆柱`}</strong></div>
        <div className="cdev-panels">
          <section className="cdev-panel"><header><span>INPUT / 3D</span>
            <strong>输入基线与未归一化母线</strong></header>
            <Diagram sample={sample} kind={kind} view="raw" azimuth={azimuth}
              active={active} crossV={crossV}/>
            <small>原输入 λ∈[0,1]，仅作规范化前对照。</small></section>
          <section className="cdev-panel"><header><span>CANONICAL / 3D</span>
            <strong>原函数规范面</strong></header>
            <Diagram sample={sample} kind={kind} view="canonical" azimuth={azimuth}
              active={active} crossV={crossV}/>
            <small>v∈[{query.rulingStart.toFixed(2)},{query.rulingEnd.toFixed(2)}]；亮线 v={crossV.toFixed(2)}。</small></section>
          <section className="cdev-panel"><header><span>DEVELOPED / 2D</span>
            <strong>本地推导的等距展开</strong></header>
            <Diagram sample={sample} kind={kind} view="flat" azimuth={azimuth}
              active={active} crossV={crossV}/>
            <small>二维展开不是原函数的保存输出。</small></section>
        </div>
        <div className="cdev-proof"><strong>{certificate.regularClosedDomain?
          '完整裁剪闭域正则、单射': '含锥顶奇点；仅 v>0 正则、单射'} · 连续可展</strong>
          <span>规范三维面与另行推导的二维展开同第一基本形式：
            {query.kind==='cone-in3830'?` E=v²sin²(${query.angleDeg.toFixed(1)}°)，F=0，G=1。`:
              ` E=R²=${(query.radius**2).toFixed(3)}，F=0，G=1。`}
            最小面积密度 {certificate.minimumJacobian.toFixed(3)}；每个回读点已独立按闭式核验。</span></div>
        <div className="cdev-warning">规范化保留每条无限母线；{certificate.sameFinitePatchAsRawInput?
          '此组参数的输入与规范有限片相同。':'当前固定 v 区间对应的有限片与输入不同。'}
          绘图采样不产生精确 FOLD、赋型、层序或可采用工程。</div>
        <footer className="cdev-footer"><span>{saved?'源保存输入':'本地参数变体'} · 实时函数求值 · 无 Wolfram 数值 Out</span>
          <button className="primary" type="button" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
