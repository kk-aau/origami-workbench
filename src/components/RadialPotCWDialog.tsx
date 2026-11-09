import {useEffect,useMemo,useState} from 'react';
import type {RadialPotParams} from '../app/radialPotParams';
import {fetchRadialPotCWReference,radialPotCWQuery,
  type RadialPotCWReference} from '../app/radialPotCWReference';
import {TessDialog} from './TessellationEditor';
import './HuffmanCircle4Dialog.css';
import './radialPot.css';

type Segment='ab'|'bc'|'cd'|'de'|'ef';
const segments:Segment[]=['ab','bc','cd','de','ef'];
const colors=['#e9b469','#83d2bd','#b5a6e6','#f39a9b','#a7ca81','#d9b4df'];

function graphView(result:RadialPotCWReference,selected:Segment|null){
  const graph=result.graph,points=graph.vertices.map(([x,y])=>[x,-y]);
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const x=Math.min(...xs),y=Math.min(...ys);
  const span=Math.max(Math.max(...xs)-x,Math.max(...ys)-y,.01),pad=span*.06;
  const active=new Map<number,string>();
  if(selected)graph.arcs.filter(arc=>arc.between===selected).forEach(arc=>
    arc.edgeIndices.forEach(index=>active.set(index,colors[arc.wedge%colors.length])));
  return <svg role="img" aria-label={selected?`CW ${selected} 五扇区长弧只读线图`:'CW 长弧完整来源线图'}
    viewBox={`${x-pad} ${y-pad} ${Math.max(...xs)-x+2*pad} ${Math.max(...ys)-y+2*pad}`}>
    {graph.edges.map(([a,b],i)=>{
      const color=selected?active.get(i):graph.edgeRoles[i]==='B'?'#e9b469':'#6e9e91';
      if(!color)return null;
      return <line key={i} x1={points[a][0]} y1={points[a][1]} x2={points[b][0]} y2={points[b][1]}
        stroke={color} strokeOpacity={selected?0.68:graph.edgeRoles[i]==='B'?.55:.42}
        strokeWidth={selected?1.15:graph.edgeRoles[i]==='B'?1.1:.65}
        vectorEffect="non-scaling-stroke"/>;
    })}
  </svg>;
}

export default function RadialPotCWDialog({params,onClose}:{params:RadialPotParams;onClose:()=>void}){
  const key=JSON.stringify(params);
  const query=useMemo(()=>radialPotCWQuery(params),[key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [result,setResult]=useState<RadialPotCWReference|null>(null);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<Segment>('ab');
  useEffect(()=>{
    const abort=new AbortController();
    setResult(null);setError('');
    const timer=window.setTimeout(()=>fetchRadialPotCWReference(query,abort.signal)
      .then(value=>{if(!abort.signal.aborted)setResult(value);})
      .catch(cause=>{if(!abort.signal.aborted)setError((cause as Error).message);}),120);
    return ()=>{window.clearTimeout(timer);abort.abort();};
  },[query]);
  const first=result?.graph.arcs.find(arc=>arc.between===selected);
  return <TessDialog title="第 43 节 · PotCircular CW 只读来源" onClose={onClose}>
    <div className="huffman-circle4-dialog radial-pot-cw-dialog">
      <aside className="huffman-controls">
        <div className="huffman-overline"><span>RADIAL POT / SOURCE GRAPH</span></div>
        <h3>原版 CW<br/>长弧线图</h3>
        <p>依据 In[315] 的顺时针角度分支与 MakeRadialPotWedge 的圆弧边界重建。原笔记本未保存显式 CW 数值 Out。</p>
        <div className="huffman-root"><span>严格读回的查询参数</span>
          <code>m={result?.query.sectors??query.sectors} · ρ={result?.query.asymmetry??query.asymmetry} · δ={result?.query.gapHalfAngleDeg??query.gapHalfAngleDeg}°</code>
          <span>分角 {result?.query.arcMaximumAngleDeg??query.arcMaximumAngleDeg}° · 最少 {result?.query.arcDivisions??query.arcDivisions} 段 · {(result?.query.arcMethod??query.arcMethod)==='inscribed'?'内接':'外切'}</span>
          <span>剖面 {(result?.query.crossSection??query.crossSection).map(p=>`(${p.join(',')})`).join(' → ')}</span>
        </div>
        <div className={`huffman-status ${error?'error':result?'ready':'checking'}`} role="status">
          {error||(result?`只读线图：${result.graph.vertices.length} 点、${result.graph.edges.length} 边、${result.graph.arcs.length} 段源圆弧。`:'按原版 CW 公式计算线图…')}
        </div>
        {result&&<div className="huffman-root"><span>最大顺时针转角</span>
          <code>{result.diagnostics.maximumArcSweepDeg.toFixed(2)}°</code>
          <span>{result.diagnostics.angularOverlapWitness
            ?`原圆弧区间超过相邻扇区 ${result.diagnostics.angularOverlapWitness.sectorSpacingDeg.toFixed(2)}°，旋转副本重叠。`
            :'当前参数未检测到单条源圆弧跨过扇区角。'}</span></div>}
        <div className="huffman-source">来源：In[315] 约 17650–17808 行；楔形 arcify 约 262629–262703 行。
          <span>图由源码公式计算；没有保存的 CW 数值结果可供逐点核对。</span></div>
      </aside>
      <section className="huffman-results">
        <div className="huffman-head"><div><span>FORMULA-DERIVED / READ ONLY</span>
          <strong>长弧与旋转副本</strong></div><code>ArcDirection = CW</code></div>
        <div className="huffman-panels">
          <section className="huffman-panel"><header><span>01 / GRAPH</span><strong>完整二维来源线图</strong></header>
            {result?graphView(result,null):<div className="huffman-empty">{error?'无有效线图':'计算中'}</div>}
            <p>暖色为外缘 CW 弧；线段交叉不构成纸面。</p></section>
          <section className="huffman-panel"><header><span>02 / ROTATIONS</span><strong>同段的扇区副本</strong></header>
            {result?graphView(result,selected):<div className="huffman-empty">{error?'无有效线图':'计算中'}</div>}
            <div className="huffman-azimuth">边界段
              <select aria-label="CW 边界段" value={selected} onChange={event=>setSelected(event.target.value as Segment)}>
                {segments.map(value=><option value={value} key={value}>{value}</option>)}</select>
              <b>{first?`${Math.abs(first.sweepDeg).toFixed(1)}°`:''}</b></div></section>
        </div>
        <div className="huffman-cert"><strong>使用范围</strong>
          <span>这是原版公式的只读交叉线图；未形成单张可采用纸面，不提供 FOLD、面或等距三维认证。</span></div>
        <div className="huffman-footer"><span>查询不会修改当前工程</span>
          <button type="button" onClick={onClose}>关闭</button></div>
      </section>
    </div>
  </TessDialog>;
}
