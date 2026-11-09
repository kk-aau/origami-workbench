import {useEffect,useMemo,useState} from 'react';
import type {TwistedPotParams} from '../app/twistedPotParams';
import {fetchSmoothPotReference,type SmoothPotReference} from '../app/twistedPotSmoothReference';
import {TessDialog} from './TessellationEditor';
import './HuffmanCircle4Dialog.css';
import './TwistedPotSmoothDialog.css';

type XY=[number,number];
function view(points:XY[],edges:[number,number][],label:string){
  const xs=points.map(v=>v[0]),ys=points.map(v=>v[1]);
  const x=Math.min(...xs),y=Math.min(...ys);
  const span=Math.max(Math.max(...xs)-x,Math.max(...ys)-y,.01),pad=span*.07;
  return <svg role="img" aria-label={label} viewBox={`${x-pad} ${y-pad} ${Math.max(...xs)-x+2*pad} ${Math.max(...ys)-y+2*pad}`}>
    {edges.map(([a,b],i)=><line key={i} x1={points[a][0]} y1={points[a][1]}
      x2={points[b][0]} y2={points[b][1]} stroke={label.includes('展开')?'#426a61':'#527f85'}
      strokeWidth=".8" vectorEffect="non-scaling-stroke"/>)}
  </svg>;
}
function project(point:[number,number,number],angle:number):XY{
  const az=angle*Math.PI/180,elev=.42;
  const u=point[0]*Math.cos(az)-point[1]*Math.sin(az);
  const depth=point[0]*Math.sin(az)+point[1]*Math.cos(az);
  return [u,-depth*Math.sin(elev)-point[2]*Math.cos(elev)];
}

export default function TwistedPotSmoothDialog({params,onClose,savedCell}:{params:TwistedPotParams;onClose:()=>void;savedCell?:3522}){
  const [result,setResult]=useState<SmoothPotReference|null>(null);
  const [error,setError]=useState('');
  const [azimuth,setAzimuth]=useState(-35);
  const key=JSON.stringify(params);
  useEffect(()=>{
    const abort=new AbortController();
    setResult(null);setError('');
    const timer=window.setTimeout(()=>fetchSmoothPotReference(params,abort.signal)
      .then(value=>{if(!abort.signal.aborted)setResult(value);})
      .catch(cause=>{if(!abort.signal.aborted)setError((cause as Error).message);}),120);
    return ()=>{window.clearTimeout(timer);abort.abort();};
  // The serialized key tracks every parameter without starting another request on render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key]);
  const folded=useMemo(()=>result?.reference3D.displayVertices.map(p=>project(p,azimuth)),
    [result,azimuth]);
  return <TessDialog title={savedCell?'第 43 节 · Smooth 法兰 In[3522] 只读':'第 43 节 · Smooth 法兰只读参考'} onClose={onClose}>
    <div className="huffman-circle4-dialog twisted-pot-smooth-dialog">
      <aside className="huffman-controls">
        <div className="huffman-overline"><span>TWISTED POT / SMOOTH FLANGE</span></div>
        <h3>原版示意，<br/>保留原貌。</h3>
        <p>原版的 Smooth 法兰会给出二维展开折痕和三维外观；此模式不保证法兰 3D 与纸面等距。</p>
        <div className="huffman-root"><span>当前输入</span><code>m={params.sectors} · ρ={params.asymmetry} · τ={params.goreTwist}</code>
          <span>边缘：{params.border==='trimmed'?'裁切':'平面'} · ζ={params.flangeRotationDeg}°</span></div>
        <div className={`huffman-status ${error?'error':result?'ready':'checking'}`} role="status">
          {error|| (result?'只读参考已生成；工程折痕与平折结果未改变。':'计算原版光滑法兰参考…')}
        </div>
        {result&&<div className="huffman-root"><span>参考 3D 最大面内距离误差</span>
          <code>{result.diagnostics.maximumFaceDistanceError.toExponential(3)}</code>
          <span>二维几何通过 · 三维不按等距验收</span></div>}
        <div className="huffman-source">{savedCell?'原版 In[3522] 固定 Smooth／裁切保存输入；':'原版 In[3520] 与 Smooth 保存例约 268886–271306 行。'}
          <span>笔记本没有可逐点读取的数值 Out；此图由原方程重建。</span></div>
      </aside>
      <section className="huffman-results">
        <div className="huffman-head"><div><span>PRO-FORMA / READ ONLY</span>
          <strong>二维折痕 · 三维示意</strong></div><code>ε {params.flangeInset.toFixed(2)}</code></div>
        <div className="huffman-panels">
          <section className="huffman-panel"><header><span>01 / PAPER</span><strong>二维展开</strong></header>
            {result?view(result.paper.vertices.map(([x,y])=>[x,-y]),result.paper.edges,'Smooth 法兰二维展开折痕'):
              <div className="huffman-empty">{error?'无有效图像':'计算中'}</div>}
            <p>原版 pro-forma 法兰折痕；不推断平折层序。</p></section>
          <section className="huffman-panel"><header><span>02 / SCHEMATIC</span><strong>三维线框示意</strong></header>
            {result&&folded?view(folded,result.paper.edges,'Smooth 法兰三维非等距示意'):
              <div className="huffman-empty">{error?'无有效图像':'计算中'}</div>}
            <div className="huffman-azimuth">视角
              <input aria-label="Smooth 法兰三维视角" type="range" min="-180" max="180"
                value={azimuth} onChange={event=>setAzimuth(Number(event.target.value))}/>
              <b>{azimuth}°</b></div></section>
        </div>
        <div className="huffman-cert"><strong>使用范围</strong>
          <span>只读原版参考；不生成可采用的 FOLD，不将示意 3D 当作真实等距折后形态。</span></div>
        <div className="huffman-footer"><span>当前工程不受此查询影响</span>
          <button type="button" onClick={onClose}>关闭</button></div>
      </section>
    </div>
  </TessDialog>;
}
