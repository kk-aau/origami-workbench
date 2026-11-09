import {useEffect,useMemo,useRef,useState} from 'react';
import {fetchGenericConeFlattenWhenIdle,GENERIC_CONE_FLATTEN_PRESET,
  projectGenericConePoint,validateGenericConeFlattenQuery,
  type GenericConeFlattenQuery,type GenericConeFlattenResult,
  type Point2,type Point3} from '../app/curvedGenericConeFlatten';
import {TessDialog} from './TessellationEditor';
import './CurvedGenericConeFlattenDialog.css';
import CurvedNativeGenericDarbouxDialog from './CurvedNativeGenericDarbouxDialog';

type NumericKey=Exclude<keyof GenericConeFlattenQuery,'family'>;
type Draft=Record<NumericKey,string>;
const numericKeys:NumericKey[]=['angleDeg','curveSegments','rulingSegments','rulingEnd'];
const makeDraft=(query:GenericConeFlattenQuery):Draft=>Object.fromEntries(
  numericKeys.map(key=>[key,String(query[key])])) as Draft;
function parseDraft(draft:Draft){
  const input:Record<string,unknown>={family:GENERIC_CONE_FLATTEN_PRESET.family};
  for(const key of numericKeys){
    if(!draft[key].trim())throw Error('请填完整圆锥参数。');
    input[key]=Number(draft[key]);
  }
  return validateGenericConeFlattenQuery(input);
}
function path(points:Point2[]){
  return points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(7)} ${(-y).toFixed(7)}`).join(' ');
}
function bounds(points:Point2[]){
  const xs=points.map(point=>point[0]),ys=points.map(point=>-point[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const span=Math.max(x1-x0,y1-y0,.1),pad=span*.13;
  return `${x0-pad} ${y0-pad} ${Math.max(x1-x0,.1)+2*pad} ${Math.max(y1-y0,.1)+2*pad}`;
}
function ConeDrawing({result,space,azimuth,active}:{result:GenericConeFlattenResult;
  space:boolean;azimuth:number;active:number}){
  const samples=result.sample[space?'foldedSamples':'flatSamples'];
  const project=(point:Point2|Point3):Point2=>space?
    projectGenericConePoint(point as Point3,azimuth):point as Point2;
  const outer=samples.map(row=>project(row[0]));
  const inner=samples.map(row=>project(row[row.length-1]));
  const base=result.sample[space?'foldedBaseCurve':'flatBaseCurve'].map(project);
  const viewBox=bounds([...outer,...inner,...base]);
  const i=Math.min(active,base.length-1),step=Math.max(1,Math.round((base.length-1)/12));
  const rulers=base.map((_,j)=>j).filter(j=>j%step===0||j===base.length-1);
  const apex=project(space?[0,0,0]:[0,0]);
  return <svg data-testid={space?'generic-cone-3d':'generic-cone-2d'} role="img"
    aria-label={space?'三维圆锥面的正交投影':'平面圆锥展开扇区'}
    viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
    <path className="cgcf-face" d={`${path([...outer,...inner.slice().reverse()])} Z`}/>
    {rulers.map(j=><line key={j} className="cgcf-ruling" vectorEffect="non-scaling-stroke"
      x1={outer[j][0]} y1={-outer[j][1]} x2={inner[j][0]} y2={-inner[j][1]}/>)}
    <path className="cgcf-outer" d={path(outer)}/>
    {result.query.rulingEnd<1&&<path className="cgcf-inner" d={path(inner)}/>}
    <path className="cgcf-base" d={path(base)}/>
    <line className="cgcf-active" vectorEffect="non-scaling-stroke"
      x1={outer[i][0]} y1={-outer[i][1]} x2={inner[i][0]} y2={-inner[i][1]}/>
    {result.query.rulingEnd===1&&<circle className="cgcf-apex"
      cx={apex[0]} cy={-apex[1]} r={space?'.035':'.035'}/>}
    <circle className="cgcf-marker" cx={base[i][0]} cy={-base[i][1]} r=".028"/>
  </svg>;
}
/** Saved In[3886] cone only: analytic continuous isometry, not a crease graph. */
function SavedGenericConeFlattenDialog({onClose,onGeneral}:{onClose:()=>void;onGeneral:()=>void}){
  const [draft,setDraft]=useState<Draft>(()=>makeDraft(GENERIC_CONE_FLATTEN_PRESET));
  const [result,setResult]=useState<GenericConeFlattenResult|null>(null);
  const [status,setStatus]=useState<'checking'|'ready'|'invalid'|'error'>('checking');
  const [error,setError]=useState('');
  const [active,setActive]=useState(0),[azimuth,setAzimuth]=useState(-35);
  const generation=useRef(0);
  const validation=useMemo(()=>{
    try{return {query:parseDraft(draft),error:''};}
    catch(cause){return {query:null,error:(cause as Error).message};}
  },[draft]);
  useEffect(()=>{
    if(!validation.query){setResult(null);setStatus('invalid');setError(validation.error);return;}
    const query=validation.query,id=++generation.current,controller=new AbortController();
    setResult(null);setStatus('checking');setError('');
    const timer=window.setTimeout(()=>{
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(70000)]);
      fetchGenericConeFlattenWhenIdle(query,signal).then(next=>{
        if(id!==generation.current||controller.signal.aborted)return;
        setResult(next);setStatus('ready');
        setActive(current=>Math.min(current,next.query.curveSegments));
      }).catch(cause=>{
        if(id!==generation.current||controller.signal.aborted)return;
        setStatus('error');setError((cause as Error).message||'圆锥展开查询失败。');
      });
    },100);
    return ()=>{window.clearTimeout(timer);controller.abort();};
  },[validation]);
  const edit=(key:NumericKey,value:string)=>{
    ++generation.current;setDraft(current=>({...current,[key]:value}));
  };
  const reset=()=>{++generation.current;setDraft(makeDraft(GENERIC_CONE_FLATTEN_PRESET));
    setActive(0);setAzimuth(-35);};
  const position=result?.sample.parameterValues[Math.min(active,result.query.curveSegments)];
  const saved=result?.query.angleDeg===30&&result.query.rulingEnd===1;
  return <TessDialog title="第 45 节 · 通用曲面圆锥展开" onClose={onClose}>
    <div className="curved-generic-cone-flatten-dialog native-darboux-saved-flatten">
      <aside className="cgcf-controls">
        <label className="ndg-saved-mode">构造范围<select aria-label="通用Darboux构造范围" value="saved" onChange={onGeneral}>
          <option value="saved">原圆锥保存解析子域</option><option value="general">原式 · 一般数值</option></select></label>
        <div className="cgcf-overline"><span>3886 / SAVED CONE</span>
          <button type="button" onClick={reset}>恢复保存参数</button></div>
        <h3>从圆锥面<br/>展开为扇区。</h3>
        <p>两图共用曲线参数与母线位置；黄线为原版基线，最内端是锥顶。</p>
        <div className="cgcf-fields">
          <label>锥半角 θ <strong>{draft.angleDeg}°</strong>
            <input aria-label="圆锥半角" type="range" min="15" max="60" step="1"
              value={draft.angleDeg} onChange={event=>edit('angleDeg',event.target.value)}/></label>
          <label>母线终点 v <strong>{draft.rulingEnd}</strong>
            <input aria-label="圆锥母线终点" type="range" min="0.2" max="1" step="0.01"
              value={draft.rulingEnd} onChange={event=>edit('rulingEnd',event.target.value)}/></label>
          <label>曲线段数<input aria-label="圆锥曲线段数" type="number"
            min="16" max="256" step="1" value={draft.curveSegments}
            onChange={event=>edit('curveSegments',event.target.value)}/></label>
          <label>母线段数<input aria-label="圆锥母线段数" type="number"
            min="2" max="16" step="1" value={draft.rulingSegments}
            onChange={event=>edit('rulingSegments',event.target.value)}/></label>
        </div>
        <label className="cgcf-position">查看 s = {position===undefined?'—':`${(position/Math.PI).toFixed(3)}π`}
          <input aria-label="圆锥查看位置" type="range" min="0"
            max={result?.query.curveSegments??0}
            value={Math.min(active,result?.query.curveSegments??0)} disabled={!result}
            onChange={event=>setActive(Number(event.target.value))}/></label>
        <div className={`cgcf-status ${status}`}
          role={status==='invalid'||status==='error'?'alert':'status'} aria-live="polite">
          {status==='ready'?saved?'保存参数的连续等距已认证。':
            '同族参数的连续等距已认证；非原保存数值 Out。':
            status==='checking'?'正在核对二维／三维对应面…':error}</div>
        <div className="cgcf-source">原版 In[3885] / In[3886]<br/>
          初值 b(0)=(1,0)，t(0)=(0,1)，σ=+1<br/>无可机读 Wolfram 数值 Out</div>
      </aside>
      <main className="cgcf-results">
        <div className="cgcf-head"><div><small>GENERIC DEVELOPABLE / 只读配对</small>
          <strong>同一度量，两种表示</strong></div>
          <code>E=sin²θ(1−v)² · F=0 · G=1</code></div>
        <div className="cgcf-panels">
          <section className="cgcf-panel"><header><span>01 / FLAT</span><strong>二维展开</strong></header>
            {result?<ConeDrawing result={result} space={false} azimuth={azimuth}
              active={active}/>:<div className="cgcf-empty">等待二维对应点</div>}
            <p>扇区角 = π sinθ · 半径 0–2</p></section>
          <section className="cgcf-panel"><header><span>02 / CONE</span><strong>三维圆锥 · 正交投影</strong></header>
            {result?<ConeDrawing result={result} space azimuth={azimuth}
              active={active}/>:<div className="cgcf-empty">等待三维对应点</div>}
            <label className="cgcf-azimuth">视角 <input aria-label="圆锥三维视角方位角"
              type="range" min="-180" max="180" value={azimuth}
              onChange={event=>setAzimuth(Number(event.target.value))}/>
              <b>{azimuth}°</b></label></section>
        </div>
        <div className="cgcf-legend"><span><i className="base"/>原版基线 v=0</span>
          <span><i className="ruling"/>对应母线</span>
          <span><i className="apex"/>v=1 锥顶奇异点</span></div>
        <div className="cgcf-cert"><strong>正则域 v&lt;1</strong><span>
          v=1 时所有母线汇于锥顶，第一基本形式退化；包含此端点仅为显示边界。
          连续曲面局部等距不代表采样面片是精确 FOLD，也未经连续部署或自交检查。</span></div>
        <footer className="cgcf-footer"><span>只读预览 · 不写入镶嵌候选或折痕工程</span>
          <button className="primary" type="button" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}

export default function CurvedGenericConeFlattenDialog({onClose}:{onClose:()=>void}){
  const [general,setGeneral]=useState(true);
  return general?<CurvedNativeGenericDarbouxDialog kind="flatten" onClose={onClose} onSaved={()=>setGeneral(false)}/>:
    <SavedGenericConeFlattenDialog onClose={onClose} onGeneral={()=>setGeneral(true)}/>;
}
