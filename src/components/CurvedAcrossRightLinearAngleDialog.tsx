import {useMemo,useState} from 'react';
import {boundedAcross2DDocument,BOUNDED_ACROSS_EXAMPLE,type BoundedAcrossRecipe} from '../app/boundedAcross2DCP';
import type {Doc} from '../core/types';
import {
  LINEAR_ACROSS_SAVED,sampleLinearAcross,linearAcrossSignedJacobian,
  type LinearAcrossParams,type LinearAcrossSample,type Point2,
} from '../app/curvedAcrossRightLinearAngle';
import {TessDialog} from './TessellationEditor';
import './CurvedAcrossRightLinearAngleDialog.css';
import CurvedGenericAcrossDialog from './CurvedGenericAcrossDialog';

type Draft={angleSlope:string;parameterStart:string;parameterEndPi:string;
  leftWidth:string;rightWidth:string;curveSegments:string};
const draftFor=(p:LinearAcrossParams):Draft=>({angleSlope:String(p.angleSlope),parameterStart:String(p.parameterStart),
  parameterEndPi:String(p.parameterEnd/Math.PI),leftWidth:String(p.leftWidth),rightWidth:String(p.rightWidth),curveSegments:String(p.curveSegments)});
const savedDraft=()=>draftFor(LINEAR_ACROSS_SAVED);
function parseDraft(draft:Draft):LinearAcrossParams{
  if(Object.values(draft).some(value=>!value.trim()))throw Error('请填完整当前参数。');
  return {angleSlope:Number(draft.angleSlope),
    parameterStart:Number(draft.parameterStart),
    parameterEnd:Number(draft.parameterEndPi)*Math.PI,
    leftWidth:Number(draft.leftWidth),rightWidth:Number(draft.rightWidth),
    curveSegments:Number(draft.curveSegments)};
}
function path(points:Point2[]):string{
  return points.map(([x,y],i)=>`${i?'L':'M'}${x.toPrecision(9)} ${(-y).toPrecision(9)}`).join(' ');
}
function bounds(points:Point2[]){
  const xs=points.map(p=>p[0]),ys=points.map(p=>-p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const span=Math.max(x1-x0,y1-y0,.1),pad=span*.17;
  return {viewBox:`${x0-pad} ${y0-pad} ${x1-x0+2*pad} ${y1-y0+2*pad}`,
    markerRadius:span*.012};
}
function Plot({sample,active}:{sample:LinearAcrossSample;active:number}){
  const crease=sample.frames.map(frame=>frame.crease),
    left=sample.leftBoundary,right=sample.rightBoundary;
  const {viewBox,markerRadius}=bounds([...crease,...left,...right]);
  const index=Math.min(active,crease.length-1),marker=crease[index];
  const area=(outer:Point2[])=>path([...crease,...outer.slice().reverse()])+' Z';
  const step=Math.max(1,Math.round((crease.length-1)/12));
  const rulingLines=(outer:Point2[],side:'left'|'right')=>crease.map((point,i)=>
    (i%step===0||i===crease.length-1)?<line key={`${side}-${i}`}
      className={`cal-ruling ${side}`} vectorEffect="non-scaling-stroke"
      x1={point[0]} y1={-point[1]} x2={outer[i][0]} y2={-outer[i][1]}/>:null);
  return <svg data-testid="curved-linear-across-2d" role="img"
    aria-label="线性折角圆弧的二维折痕、左右母线和边界" viewBox={viewBox}
    preserveAspectRatio="xMidYMid meet">
    <path d={area(left)} className="cal-area left"/>
    <path d={area(right)} className="cal-area right"/>
    <path d={path(left)} className="cal-boundary left"/>
    <path d={path(right)} className="cal-boundary right"/>
    {rulingLines(left,'left')}{rulingLines(right,'right')}
    <line className="cal-selected left" vectorEffect="non-scaling-stroke"
      x1={marker[0]} y1={-marker[1]} x2={left[index][0]} y2={-left[index][1]}/>
    <line className="cal-selected right" vectorEffect="non-scaling-stroke"
      x1={marker[0]} y1={-marker[1]} x2={right[index][0]} y2={-right[index][1]}/>
    <path d={path(crease)} className="cal-crease"/>
    <circle cx={marker[0]} cy={-marker[1]} r={markerRadius} className="cal-marker"/>
  </svg>;
}
function Field({label,value,onChange,step='any',min,max}:{label:string;value:string;
  onChange:(next:string)=>void;step?:string;min?:number;max?:number}){
  return <label className="cal-field"><span>{label}</span><input type="number" value={value}
    step={step} min={min} max={max} aria-label={label}
    onChange={event=>onChange(event.target.value)}/></label>;
}

/** Source-derived 2D-only continuation of a saved curved fold. */
function CircularAcrossRightDialog({onClose,onGeneric,onAdoptCP,initial}:{onClose:()=>void;onGeneric:()=>void;onAdoptCP?:(doc:Doc)=>boolean;initial?:BoundedAcrossRecipe}){
  const [draft,setDraft]=useState<Draft>(()=>initial?draftFor(initial.parameters):savedDraft());
  const [sample,setSample]=useState<LinearAcrossSample>(()=>sampleLinearAcross(initial?.parameters??LINEAR_ACROSS_SAVED));
  const [guides,setGuides]=useState(initial?.includeRulingGuides??true),[cpError,setCPError]=useState('');
  const cp=useMemo(()=>{try{return {doc:boundedAcross2DDocument({parameters:parseDraft(draft),includeRulingGuides:guides}),error:''};}
    catch(cause){return {doc:null,error:(cause as Error).message};}},[draft,guides]);
  const adopt=()=>{if(!cp.doc||!onAdoptCP)return;setCPError('');try{if(onAdoptCP(cp.doc))onClose();}
    catch(cause){setCPError((cause as Error).message);}};
  const boundedExample=()=>{setDraft(draftFor(BOUNDED_ACROSS_EXAMPLE.parameters));setSample(sampleLinearAcross(BOUNDED_ACROSS_EXAMPLE.parameters));setGuides(true);setError('');setCPError('');setActive(0);};
  const [error,setError]=useState('');
  const [active,setActive]=useState(0);
  const edit=(key:keyof Draft,value:string)=>{
    const next={...draft,[key]:value};setDraft(next);
    try{setSample(sampleLinearAcross(parseDraft(next)));setError('');}
    catch(cause){setError((cause as Error).message);}
  };
  const reset=()=>{setDraft(savedDraft());setSample(sampleLinearAcross(LINEAR_ACROSS_SAVED));
    setError('');setActive(0);};
  const frame=sample.frames[Math.min(active,sample.frames.length-1)];
  const rightArea=linearAcrossSignedJacobian(sample.params,'right',frame.u,
    sample.params.rightWidth);
  return <TessDialog title="第 45 节 · 线性折角跨右侧" onClose={onClose}>
    <div className="curved-across-linear-dialog">
      <aside className="cal-controls">
        <label className="cal-field"><span>构造范围</span><select aria-label="跨右侧构造范围" value="circle" onChange={onGeneric}>
          <option value="circle">圆弧解析子域</option><option value="generic">一般源输入</option></select></label>
        <div className="cal-kicker"><span>01 / SOURCE INPUT</span><button type="button"
          onClick={reset}>恢复 In[3984]</button></div>
        <button type="button" onClick={boundedExample}>有限纸带示例</button>
        <h2>一段圆弧，继续折出右侧</h2>
        <p className="cal-intro">原版二维折痕 f(u)=(cos u, sin u)，左母线指向圆心，折角 γ(u)=k·u。</p>
        <div className="cal-fields">
          <Field label="折角斜率 k" value={draft.angleSlope} min={.1} max={1}
            onChange={value=>edit('angleSlope',value)}/>
          <Field label="起点 u₀" value={draft.parameterStart} min={.001}
            onChange={value=>edit('parameterStart',value)}/>
          <Field label="终点 u₁ / π" value={draft.parameterEndPi} min={.001} max={.5}
            onChange={value=>edit('parameterEndPi',value)}/>
          <Field label="左侧宽度" value={draft.leftWidth} min={.001} max={.999}
            onChange={value=>edit('leftWidth',value)}/>
          <Field label="右侧宽度" value={draft.rightWidth} min={.001} max={2}
            onChange={value=>edit('rightWidth',value)}/>
          <Field label="曲线采样段数" value={draft.curveSegments} min={16} max={256}
            step="1" onChange={value=>edit('curveSegments',value)}/>
        </div>
        <div className="cal-scrub"><label htmlFor="cal-u-slider">折痕位置
          <strong>u={frame.u.toFixed(3)}</strong></label>
          <input id="cal-u-slider" type="range" min="0" max={sample.frames.length-1}
            value={Math.min(active,sample.frames.length-1)}
            onChange={event=>setActive(Number(event.target.value))}/></div>
        <dl className="cal-readouts"><div><dt>当前折角</dt>
          <dd>{(frame.foldAngleRad*180/Math.PI).toFixed(2)}°</dd></div>
          <div><dt>右侧有向面积</dt><dd>{rightArea.toFixed(4)}</dd></div>
          <div><dt>原数值例插值点</dt><dd>64</dd></div></dl>
        {error&&<p className="cal-error" role="alert">{error} 图示保留上一个有效参数。</p>}
      </aside>
      <main className="cal-results">
        <div className="cal-heading"><div><span>02 / PLANAR CONSTRUCTION</span>
          <strong>二维直纹邻域</strong></div><small>In[3984] 解析式 · In[3987] 数值输入</small></div>
        <div className="cal-plot"><header><span>FOLD ACROSS RIGHT / 2D</span>
          <strong>局部正则曲面</strong></header><Plot sample={sample} active={active}/>
          <div className="cal-plot-caption">左带止于圆心焦线之前 · 右带沿正向无焦线</div></div>
        <div className="cal-legend"><span><i className="crease"/>原折痕</span>
          <span><i className="left"/>已有左母线</span>
          <span><i className="right"/>新增右母线</span></div>
        <div className="cal-note"><strong>原二维纸域 · 折线采样 CP</strong><span>
          保留原 f、rL、rR 坐标，以左右有限宽与端母线封边为真实纸边。曲折线为 U 未赋型；母线可作为 A 辅助。
          本地解析采样未复刻 Wolfram 的 64 点插值。没有三维初值、FF、层序、运动或碰撞证明。</span></div>
        <label><input type="checkbox" aria-label="纸带保留辅助母线" checked={guides} onChange={e=>setGuides(e.target.checked)}/>保留原母线为 A 辅助（默认加工不含）</label>
        <p role="status" data-testid="across-bounded-cp-status">{cp.doc?`实际 CP：${3*(sample.params.curveSegments+1)} 顶点 / ${3*sample.params.curveSegments+4} 边 / 2 面；曲折采样误差 ≤ ${(((sample.params.parameterEnd-sample.params.parameterStart)/sample.params.curveSegments)**2/8).toExponential(3)} mm；右边界误差 ≤ ${((1+2.5*sample.params.rightWidth)*((sample.params.parameterEnd-sample.params.parameterStart)/sample.params.curveSegments)**2/8).toExponential(3)} mm。`:cp.error}</p>
        {cpError&&<p className="cal-error" role="alert">{cpError}</p>}
        <footer className="cal-footer"><span>仅 CP 采用后可在当前绘图工作区编辑、保存或导出。</span>
          <button type="button" onClick={onClose}>关闭</button>
          <button className="primary" type="button" disabled={!cp.doc||!onAdoptCP} onClick={adopt}>仅采用二维纸带 CP →</button></footer>
      </main>
    </div>
  </TessDialog>;
}

export default function CurvedAcrossRightLinearAngleDialog({onClose,onAdoptCP,initial}:{onClose:()=>void;onAdoptCP?:(doc:Doc)=>boolean;initial?:BoundedAcrossRecipe}){
  const [generic,setGeneric]=useState(!initial&&!onAdoptCP);
  return generic?<CurvedGenericAcrossDialog onClose={onClose} onCircle={()=>setGeneric(false)}/>:
    <CircularAcrossRightDialog initial={initial} onAdoptCP={onAdoptCP} onClose={onClose} onGeneric={()=>setGeneric(true)}/>;
}
