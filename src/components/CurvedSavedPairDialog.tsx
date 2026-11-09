import {useEffect,useMemo,useRef,useState} from 'react';
import {
  CURVED_SAVED_PAIR_PRESETS,fetchCurvedSavedPair,savedPairCurves,
  validateCurvedSavedPairQuery,
  type CurvedSavedPairFamily,type CurvedSavedPairQuery,type CurvedSavedPairResult,type Point2,
} from '../app/curvedSavedPair';
import {TessDialog} from './TessellationEditor';
import './CurvedSavedPairDialog.css';

type NumericKey=Exclude<keyof CurvedSavedPairQuery,'family'>;
type Draft={family:CurvedSavedPairFamily}&Record<NumericKey,string>;
const numericKeys:NumericKey[]=['thetaDeg','parameterStartPi','parameterEndPi',
  'orientation','leftWidth','rightWidth','curveSegments','rulingSegments'];
const familyLabels:Record<CurvedSavedPairFamily,string>={
  'cone-across-right':'圆锥 · 跨左面补右面',
  'planar-circle-to-curved-fold-3d':'平面圆弧 · 反折三维',
};
function draftFrom(query:CurvedSavedPairQuery):Draft{
  const values={} as Record<NumericKey,string>;
  for(const key of numericKeys)values[key]=query[key]===undefined?'':String(query[key]);
  return {family:query.family,...values};
}
function queryFrom(draft:Draft):CurvedSavedPairQuery{
  const keys:NumericKey[]=['leftWidth','rightWidth','curveSegments','rulingSegments',
    ...(draft.family==='cone-across-right'?
      ['thetaDeg','parameterStartPi','parameterEndPi'] as NumericKey[]:['orientation'] as NumericKey[])];
  const input:Record<string,unknown>={family:draft.family};
  for(const key of keys){
    if(!draft[key].trim())throw Error('请填完整当前解析子域的参数。');
    input[key]=Number(draft[key]);
  }
  return validateCurvedSavedPairQuery(input);
}
function linePath(points:Point2[]):string{
  return points.map(([x,y],i)=>`${i?'L':'M'}${x.toPrecision(9)} ${(-y).toPrecision(9)}`).join(' ');
}
function viewBounds(points:Point2[]){
  const xs=points.map(p=>p[0]),ys=points.map(p=>-p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const span=Math.max(x1-x0,y1-y0,.01),pad=span*.14;
  return {viewBox:`${x0-pad} ${y0-pad} ${Math.max(x1-x0,.01)+2*pad} ${Math.max(y1-y0,.01)+2*pad}`,
    markerRadius:span*.014};
}
function PairDrawing({result,folded,azimuth,active}:{result:CurvedSavedPairResult;
  folded:boolean;azimuth:number;active:number}){
  const {crease,left,right}=savedPairCurves(result,folded,azimuth);
  const {viewBox,markerRadius}=viewBounds([...crease,...left,...right]);
  const at=Math.min(active,crease.length-1),marker=crease[at];
  const fill=(edge:Point2[])=>linePath([...crease,...edge.slice().reverse()])+' Z';
  const step=Math.max(1,Math.round((crease.length-1)/12));
  const indices=crease.map((_,i)=>i).filter(i=>i===crease.length-1||i%step===0);
  const rulings=(edge:Point2[],side:'left'|'right')=>indices.map(i=><line
    key={`${side}-${i}`} className={`csp-ruling ${side}`} vectorEffect="non-scaling-stroke"
    x1={crease[i][0]} y1={-crease[i][1]} x2={edge[i][0]} y2={-edge[i][1]}/>);
  return <svg data-testid={folded?'curved-saved-3d':'curved-saved-2d'}
    role="img" aria-label={folded?'保存例的三维曲面正交投影':'保存例的二维展开曲面'}
    viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
    <path d={fill(left)} className="csp-band left"/>
    <path d={fill(right)} className="csp-band right"/>
    <path d={linePath(left)} className="csp-boundary left"/>
    <path d={linePath(right)} className="csp-boundary right"/>
    {rulings(left,'left')}{rulings(right,'right')}
    <line className="csp-active left" vectorEffect="non-scaling-stroke" x1={marker[0]}
      y1={-marker[1]} x2={left[at][0]} y2={-left[at][1]}/>
    <line className="csp-active right" vectorEffect="non-scaling-stroke" x1={marker[0]}
      y1={-marker[1]} x2={right[at][0]} y2={-right[at][1]}/>
    <path d={linePath(crease)} className="csp-crease"/>
    <circle className="csp-marker" cx={marker[0]} cy={-marker[1]} r={markerRadius}/>
  </svg>;
}
function NumberField({label,value,onChange,min,max,step='any'}:{label:string;value:string;
  onChange:(value:string)=>void;min:number;max:number;step?:string}){
  return <label className="csp-field"><span>{label}</span><input type="number" min={min} max={max}
    step={step} value={value} onChange={event=>onChange(event.target.value)} aria-label={label}/></label>;
}

/** Saved analytic pairs only. Sampled strips never enter the CP adoption flow. */
export default function CurvedSavedPairDialog({onClose,initialFamily='cone-across-right'}:{onClose:()=>void;initialFamily?:CurvedSavedPairFamily}){
  const [draft,setDraft]=useState<Draft>(()=>draftFrom(CURVED_SAVED_PAIR_PRESETS[initialFamily]));
  const [result,setResult]=useState<CurvedSavedPairResult|null>(null);
  const [status,setStatus]=useState<'checking'|'ready'|'error'|'invalid'>('checking');
  const [error,setError]=useState('');
  const [active,setActive]=useState(0),[azimuth,setAzimuth]=useState(-35);
  const generation=useRef(0);
  const validation=useMemo(()=>{
    try{return {query:queryFrom(draft),error:''};}
    catch(cause){return {query:null,error:(cause as Error).message};}
  },[draft]);
  useEffect(()=>{
    if(!validation.query){setStatus('invalid');setError(validation.error);return;}
    const query=validation.query,id=++generation.current,controller=new AbortController();
    setStatus('checking');setError('');
    const timer=window.setTimeout(()=>{
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(70000)]);
      fetchCurvedSavedPair(query,signal).then(next=>{
        if(id!==generation.current||controller.signal.aborted)return;
        setResult(next);setStatus('ready');setActive(0);
      }).catch(cause=>{
        if(id!==generation.current||controller.signal.aborted)return;
        setStatus('error');setError((cause as Error).message||'解析曲面查询失败。');
      });
    },140);
    return ()=>{window.clearTimeout(timer);controller.abort();};
  },[validation]);
  const edit=(key:NumericKey,value:string)=>{++generation.current;setDraft(current=>({...current,[key]:value}));};
  const choose=(family:CurvedSavedPairFamily)=>{
    ++generation.current;setDraft(draftFrom(CURVED_SAVED_PAIR_PRESETS[family]));setActive(0);
  };
  const frame=result?.sample.parameterValues[Math.min(active,result.sample.parameterValues.length-1)];
  const source=result?.source;
  return <TessDialog title="第 45 节 · 保存曲折解析对照" onClose={onClose}>
    <div className="curved-saved-pair-dialog">
      <aside className="csp-controls">
        <div className="csp-heading-small"><span>01 / 原版解析子域</span>
          <button type="button" onClick={()=>choose(draft.family)}>恢复保存参数</button></div>
        <p className="csp-intro">二维展开与三维直纹面共用同一曲线折痕和母线采样索引。</p>
        <label className="csp-select">保存例<select aria-label="第 45 节保存例" value={draft.family}
          onChange={event=>choose(event.target.value as CurvedSavedPairFamily)}>
          {Object.entries(familyLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select></label>
        {draft.family==='planar-circle-to-curved-fold-3d'&&
          <label className="csp-select">折角符号<select aria-label="圆弧折角符号" value={draft.orientation}
            onChange={event=>edit('orientation',event.target.value)}>
            <option value="1">+120° · In[3973/3978]</option>
            <option value="-1">−120° · In[3974/3979]</option>
          </select></label>}
        <div className="csp-fields">
          {draft.family==='cone-across-right'&&<>
            <NumberField label="圆锥半角 θ · °" value={draft.thetaDeg} min={5} max={85}
              onChange={value=>edit('thetaDeg',value)}/>
            <NumberField label="起点 u₀ / π" value={draft.parameterStartPi} min={-2} max={2}
              onChange={value=>edit('parameterStartPi',value)}/>
            <NumberField label="终点 u₁ / π" value={draft.parameterEndPi} min={-2} max={2}
              onChange={value=>edit('parameterEndPi',value)}/>
          </>}
          <NumberField label="左侧宽度" value={draft.leftWidth} min={.05}
            max={draft.family==='cone-across-right'?.95:1.8}
            onChange={value=>edit('leftWidth',value)}/>
          <NumberField label="右侧宽度" value={draft.rightWidth} min={.05}
            max={draft.family==='cone-across-right'?4:1.8}
            onChange={value=>edit('rightWidth',value)}/>
          <NumberField label="曲线段数" value={draft.curveSegments} min={16} max={256} step="1"
            onChange={value=>edit('curveSegments',value)}/>
          <NumberField label="母线段数" value={draft.rulingSegments} min={1} max={8} step="1"
            onChange={value=>edit('rulingSegments',value)}/>
        </div>
        <div className="csp-position"><label htmlFor="csp-position">曲线位置
          <strong>{frame===undefined?'等待采样':`u=${(frame/Math.PI).toFixed(3)}π`}</strong></label>
          <input id="csp-position" type="range" min="0"
            max={Math.max(0,(result?.sample.parameterValues.length??1)-1)}
            value={Math.min(active,Math.max(0,(result?.sample.parameterValues.length??1)-1))}
            onChange={event=>setActive(Number(event.target.value))} disabled={!result}/></div>
        <div className={`csp-status ${status}`} role={status==='invalid'||status==='error'?'alert':'status'}
          aria-live="polite">{status==='ready'?'连续曲面局部等距与双侧可展已认证。':
            status==='checking'?'正在计算保存例解析曲面…':error}
          {result&&status!=='ready'&&<span>图示保留上次成功的查询。</span>}</div>
      </aside>
      <main className="csp-results">
        <div className="csp-topline"><div><span>02 / 同索引双视图</span>
          <strong>二维展开 ↔ 三维曲折</strong></div>
          <small>{source?`${source.symbolicCell} / ${source.numericalCell} · ${result?.foldAngleDeg}°`:'等待解析结果'}</small></div>
        <div className="csp-panels">
          <section className="csp-panel"><header><span>PLANE · 2D</span><strong>展开曲面</strong></header>
            {result?<PairDrawing result={result} folded={false} azimuth={azimuth} active={active}/>:
              <div className="csp-empty">等待二维采样</div>}
            <p>共同折痕、两侧边界与母线</p></section>
          <section className="csp-panel"><header><span>SPACE · 3D</span><strong>正交投影</strong></header>
            {result?<PairDrawing result={result} folded azimuth={azimuth} active={active}/>:
              <div className="csp-empty">等待三维采样</div>}
            <label className="csp-azimuth">视角 <input type="range" min="-180" max="180"
              aria-label="第 45 节三维视角方位角" value={azimuth}
              onChange={event=>setAzimuth(Number(event.target.value))}/><b>{azimuth}°</b></label></section>
        </div>
        <div className="csp-legend"><span><i className="crease"/>共用折痕</span>
          <span><i className="left"/>左侧母线</span><span><i className="right"/>右侧母线</span></div>
        <div className="csp-certification"><strong>连续解析曲面 · 只读对照</strong>
          <span>采样弦段非精确等距；不是精确直折痕 FOLD，也不能采用为折痕图。部署路径与自碰撞尚未验证。</span></div>
        <footer className="csp-footer"><span>此预览不会修改当前工作区或作品。</span>
          <button className="primary" type="button" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
