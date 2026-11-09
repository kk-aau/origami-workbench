import {useMemo,useState} from 'react';
import {
  MATCHED_CIRCLE_PRESET,MATCHED_PAIR_SOURCE,projectSavedMatchedPoint,
  sampleMatchedCircularPairGrid,validateMatchedCircleParams,
  type MatchedCircleParams,type MatchedPairSample,type MatchedPoint2,
} from '../app/curvedMatchedPair';
import {TessDialog} from './TessellationEditor';
import './CurvedSavedPairDialog.css';
import './CurvedMatchedPairDialog.css';
import CurvedGenericMatchedPairDialog from './CurvedGenericMatchedPairDialog';

const path=(points:MatchedPoint2[])=>points.map(([x,y],i)=>
  `${i?'L':'M'}${x.toPrecision(9)} ${(-y).toPrecision(9)}`).join(' ');
const bandPath=(outer:MatchedPoint2[],inner:MatchedPoint2[])=>
  `${path(outer)} ${inner.slice().reverse().map(([x,y])=>
    `L${x.toPrecision(9)} ${(-y).toPrecision(9)}`).join(' ')} Z`;

export function PairDrawing({grid,space,azimuth,active,baseline}:{grid:MatchedPairSample[][];
  space:boolean;azimuth:number;active:number;baseline?:MatchedPairSample[]}){
  const project=(sample:MatchedPairSample):MatchedPoint2=>space?
    projectSavedMatchedPoint(sample.space,azimuth):sample.flat;
  const negative=grid.map(row=>project(row[0]));
  const positive=grid.map(row=>project(row[row.length-1]));
  const center=baseline?baseline.map(project):grid.map(row=>project(row[(row.length-1)/2]));
  const all=[...negative,...positive,...center];
  const xs=all.map(p=>p[0]),ys=all.map(p=>-p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const span=Math.max(x1-x0,y1-y0,.01),pad=span*.14;
  const at=Math.min(active,grid.length-1);
  return <svg data-testid={space?'curved-matched-3d':'curved-matched-2d'} role="img"
    aria-label={space?'匹配曲线三维直纹面正交投影':'匹配曲线二维直纹带'}
    viewBox={`${x0-pad} ${y0-pad} ${Math.max(x1-x0,.01)+2*pad} ${Math.max(y1-y0,.01)+2*pad}`}
    preserveAspectRatio="xMidYMid meet">
    <path className="cmp-band" d={bandPath(negative,positive)}/>
    {grid.filter((_,i)=>i%2===0).map((row,i)=>{
      const a=project(row[0]),b=project(row[row.length-1]);
      return <line key={i} className="cmp-ruling" vectorEffect="non-scaling-stroke"
        x1={a[0]} y1={-a[1]} x2={b[0]} y2={-b[1]}/>;
    })}
    <path className="cmp-edge negative" d={path(negative)}/>
    <path className="cmp-edge positive" d={path(positive)}/>
    <path className="cmp-base" d={path(center)}/>
    <line className="cmp-active" vectorEffect="non-scaling-stroke"
      x1={negative[at][0]} y1={-negative[at][1]}
      x2={positive[at][0]} y2={-positive[at][1]}/>
    <circle className="cmp-marker" vectorEffect="non-scaling-stroke" cx={center[at][0]} cy={-center[at][1]} r={span*.016}/>
  </svg>;
}

/** The original saved circular pair, displayed without adopting a crease pattern. */
function CircularMatchedPairDialog({onClose,onGeneric}:{onClose:()=>void;onGeneric:()=>void}){
  const [active,setActive]=useState(0),[azimuth,setAzimuth]=useState(-35);
  const [draft,setDraft]=useState({flatRadius:'2',spaceRadius:'1'});
  const [params,setParams]=useState<MatchedCircleParams>(MATCHED_CIRCLE_PRESET);
  const [error,setError]=useState('');
  const edit=(key:keyof MatchedCircleParams,value:string)=>{
    const next={...draft,[key]:value};setDraft(next);
    try{
      setParams(validateMatchedCircleParams({flatRadius:Number(next.flatRadius),
        spaceRadius:Number(next.spaceRadius)}));setError('');
    }catch(cause){setError((cause as Error).message);}
  };
  const reset=()=>{setDraft({flatRadius:'2',spaceRadius:'1'});
    setParams(MATCHED_CIRCLE_PRESET);setError('');setActive(0);};
  const saved=params.flatRadius===2&&params.spaceRadius===1;
  const grid=useMemo(()=>sampleMatchedCircularPairGrid(params),[params]);
  const current=grid[active][25];
  return <TessDialog title="第 45 节 · 匹配曲线双视图" onClose={onClose}>
    <div className="curved-saved-pair-dialog curved-matched-pair-dialog">
      <aside className="csp-controls">
        <label className="csp-select">构造范围<select aria-label="匹配曲线构造范围" value="circle" onChange={onGeneric}>
          <option value="generic">原式输入 · 一般数值匹配</option><option value="circle">圆弧解析子域</option></select></label>
        <div className="csp-heading-small"><span>01 / 圆弧解析子域</span>
          <button type="button" onClick={reset}>恢复 In[3865/3868]</button></div>
        <p className="csp-intro">MatchCurvesPair / NMatchCurvesPair，ψ=σ=+1。默认半径为原版保存输入；调整半径属于本地解析变体。</p>
        <div className="cmp-fields">
          <label className="csp-field"><span>平面半径 R₂</span><input type="number"
            aria-label="平面匹配圆弧半径" min="1.2" max="4" step="0.1"
            value={draft.flatRadius} onChange={event=>edit('flatRadius',event.target.value)}/></label>
          <label className="csp-field"><span>空间半径 R₃</span><input type="number"
            aria-label="空间匹配圆弧半径" min="1" max="3.95" step="0.1"
            value={draft.spaceRadius} onChange={event=>edit('spaceRadius',event.target.value)}/></label>
        </div>
        <dl className="cmp-params">
          <div><dt>平面圆弧</dt><dd>c(s)=R₂(cos(s/R₂), sin(s/R₂))</dd></div>
          <div><dt>空间圆弧</dt><dd>cc(s)=(R₃ cos(s/R₃), R₃ sin(s/R₃), 1)</dd></div>
          <div><dt>弧长参数</dt><dd>0 ≤ s ≤ π</dd></div>
          <div><dt>横向母线</dt><dd>−1 ≤ v ≤ 1</dd></div>
        </dl>
        <div className="csp-position"><label htmlFor="cmp-position">同步母线
          <strong>s={(current.parameter/Math.PI).toFixed(2)}π</strong></label>
          <input id="cmp-position" type="range" min="0" max="100" value={active}
            onChange={event=>setActive(Number(event.target.value))}/></div>
        {error&&<div className="csp-status invalid" role="alert">{error} 图示保留上一组有效参数。</div>}
        <div className="csp-status ready" role="status">连续曲面等距：E=(1−v/R₂)²，F=0，G=1；横向全宽不触及焦线。</div>
      </aside>
      <main className="csp-results">
        <div className="csp-topline"><div><span>02 / 同参数双视图</span><strong>二维展开 ↔ 三维曲面</strong></div>
          <small>{saved?`${MATCHED_PAIR_SOURCE.symbolicCell} / ${MATCHED_PAIR_SOURCE.numericCell}`:
            '本地解析圆弧变体'}</small></div>
        <div className="csp-panels">
          <section className="csp-panel"><header><span>PLANE · 2D</span><strong>平面直纹带</strong></header>
            <PairDrawing grid={grid} space={false} azimuth={azimuth} active={active}/>
            <p>平面圆弧与横向母线 · R₂={params.flatRadius.toFixed(2)}</p></section>
          <section className="csp-panel"><header><span>SPACE · 3D</span><strong>正交投影</strong></header>
            <PairDrawing grid={grid} space azimuth={azimuth} active={active}/>
            <label className="csp-azimuth">视角 <input type="range" min="-180" max="180"
              aria-label="匹配曲线三维视角方位角" value={azimuth}
              onChange={event=>setAzimuth(Number(event.target.value))}/><b>{azimuth}°</b></label></section>
        </div>
        <div className="csp-legend"><span><i className="cmp-base-key"/>原曲线</span>
          <span><i className="cmp-negative-key"/>负向边</span>
          <span><i className="cmp-positive-key"/>正向边</span></div>
        <div className="csp-certification"><strong>{saved?'保存示例':'本地半径变体'}解析子域 · 只读</strong>
          <span>图形由原公式的圆弧解析子域本地求值，不是 Mathematica 数值插值的逐点 Out。曲面等距不等于有限采样弦段精确等距；未验证平折层序、运动或碰撞，不能采用为折痕图。</span></div>
        <footer className="csp-footer"><span>此对照不会修改当前工作区或作品。</span>
          <button className="primary" type="button" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}

export default function CurvedMatchedPairDialog({onClose}:{onClose:()=>void}){
  const [mode,setMode]=useState<'generic'|'circle'>('generic');
  return mode==='generic'?<CurvedGenericMatchedPairDialog onClose={onClose} onCircular={()=>setMode('circle')}/>:
    <CircularMatchedPairDialog onClose={onClose} onGeneric={()=>setMode('generic')}/>;
}
