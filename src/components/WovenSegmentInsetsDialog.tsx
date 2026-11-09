import {useState} from 'react';
import type {TessResult} from '../app/tessellation';
import {readWovenFullEdgeInsets,wovenPeriodicityEnabled,type WovenParams,type WovenFullEdgeInsets,type WovenSegmentInset} from '../app/wovenParams';
import {makeWovenFullInsets,wovenFullInsetsMatch,wovenInsetEdges,wovenInsetStampMatches} from '../app/wovenFullInsets';
import {TessDialog} from './TessellationEditor';
import './WovenSegmentInsetsDialog.css';

type Settings={segmentInsets?:WovenSegmentInset[];fullEdgeInsets?:WovenFullEdgeInsets};
const format=(n:number)=>Number(n.toPrecision(6)).toString();
export default function WovenSegmentInsetsDialog({params,result,onApply,onClose}:{params:WovenParams;result:TessResult;onApply:(settings:Settings)=>void;onClose:()=>void}){
 const edges=wovenInsetEdges(result),graph=result.mother;
 const [initial]=useState(()=>{
  const values:Record<number,string>={};let unmatched=false;
  if(params.fullEdgeInsets){unmatched=!wovenFullInsetsMatch(params.fullEdgeInsets,edges,params.mode==='graph');if(!unmatched)for(const item of params.fullEdgeInsets.entries)values[item.edge]=String(item.inset);}
  else for(const item of params.segmentInsets??[]){const matches=edges.filter(e=>wovenInsetStampMatches(item,e));if(matches.length!==1||matches[0].edge in values)unmatched=true;else values[matches[0].edge]=String(item.inset);}
  return {values,unmatched};
 });
 const [mode,setMode]=useState<'segments'|'full'>(params.fullEdgeInsets||params.mode==='graph'?'full':'segments');
 const [draft,setDraft]=useState(initial.values),[unmatched,setUnmatched]=useState(initial.unmatched),[error,setError]=useState('');
 const [selected,setSelected]=useState(edges.find(e=>mode==='full'||e.line>=0)?.edge??0);
 const available=edges.filter(e=>mode==='full'||e.line>=0),current=available.find(e=>e.edge===selected)??available[0];
 const coords=graph?.vertices_coords??[],xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]);
 const xmin=coords.length?Math.min(...xs):0,xmax=coords.length?Math.max(...xs):1,ymin=coords.length?Math.min(...ys):0,ymax=coords.length?Math.max(...ys):1,span=Math.max(xmax-xmin,ymax-ymin,1e-10),pad=span*.07;
 const value=current?draft[current.edge]??String(mode==='full'?current.current:current.base):'';
 const edgeName=(line:number)=>line<0?'边界':params.mode==='graph'?'内边':`线 ${line+1}`;
 const clear=()=>{if(params.mode==='graph'){onApply({});return;}setDraft({});setMode('segments');setSelected(edges.find(e=>e.line>=0)?.edge??0);setUnmatched(false);setError('');};
 const save=()=>{
  if(unmatched){setError('来源的边数、编号或端点已变化，请清除后按当前母结构重新设置。');return;}
  if(mode==='full'){
   if(Object.values(draft).some(text=>!text.trim())){setError('完整列表的内缩量不得留空。');return;}
   const full=makeWovenFullInsets(edges,draft);if(!readWovenFullEdgeInsets(full,params.mode==='graph')){setError(`完整列表的每段内缩须为 0–${params.mode==='graph'?10:1} 的有限数字。`);return;}onApply({fullEdgeInsets:full});return;
  }
  if(Object.keys(draft).length>128){setError('最多保存 128 个逐段覆盖。');return;}
  const entries:WovenSegmentInset[]=[];
  for(const [key,text] of Object.entries(draft)){
   const e=edges[Number(key)],inset=Number(text);if(!e||e.line<0||!text.trim()||!Number.isFinite(inset)||inset<.0025||inset>1){setError('内边逐段覆盖须为 0.0025–1。边界请使用完整逐边列表。');return;}
   entries.push({line:e.line,from:[...e.from],to:[...e.to],inset});
  }
  onApply({segmentInsets:entries});
 };
 const chooseMode=(next:'segments'|'full')=>{if(next==='full')setDraft(p=>Object.fromEntries(edges.map(e=>[e.edge,p[e.edge]??String(e.current)])));else setDraft({});setMode(next);setSelected(edges.find(e=>next==='full'||e.line>=0)?.edge??0);setError('');};
 return <TessDialog title="逐段内缩" onClose={onClose}><div className="woven-segment-dialog">
  <div className="woven-segment-mode"><label>设置方式<select aria-label="逐边内缩设置方式" value={mode} onChange={e=>chooseMode(e.target.value as typeof mode)}>{params.mode!=='graph'&&<option value="segments">内边逐段覆盖</option>}<option value="full">完整逐边列表</option></select></label><span>{available.length} 段全部可在图上选择</span></div>
  <p className="woven-segment-intro">{mode==='full'?'每条母结构边保存绝对 h，含边界；改变基准宽后保持全表。关闭边界内缩或设周期时，边界实际 h 为零。':'选择内边单段，覆盖其绝对 h；其余内边仍继承线宽。完整列表还可调整各边界段。'}</p>
  <div className="woven-segment-workspace"><div className="woven-segment-map-wrap"><svg className="woven-segment-map" viewBox={`${xmin-pad} ${ymin-pad} ${xmax-xmin+2*pad} ${ymax-ymin+2*pad}`} role="img" aria-label="选择全部母结构边的内缩地图">
   {edges.map(e=><g key={e.edge} data-edge={e.edge} className={e.edge===current?.edge?'woven-segment-selected':e.edge in draft?'woven-segment-edited':e.line<0?'woven-segment-boundary':'woven-segment-available'}>
    <line x1={e.from[0]} y1={e.from[1]} x2={e.to[0]} y2={e.to[1]} className="woven-segment-stroke" vectorEffect="non-scaling-stroke"/>
    {(mode==='full'||e.line>=0)&&<line x1={e.from[0]} y1={e.from[1]} x2={e.to[0]} y2={e.to[1]} className="woven-segment-hit" vectorEffect="non-scaling-stroke" onClick={()=>setSelected(e.edge)}><title>{`段 ${e.edge+1} · ${edgeName(e.line)}`}</title></line>}
    {edges.length<=48&&<text x={(e.from[0]+e.to[0])/2} y={(e.from[1]+e.to[1])/2} dy={-span*.012} textAnchor="middle" fontSize={span/45} fill="currentColor" pointerEvents="none">{e.edge+1}</text>}
   </g>)}
  </svg></div><div className="woven-segment-side">
   <div className="woven-segment-list-head"><strong>段编号</strong><select aria-label="母结构段编号" value={current?.edge??0} onChange={e=>setSelected(Number(e.target.value))}>{available.map(e=><option key={e.edge} value={e.edge}>{e.edge+1} · {edgeName(e.line)}</option>)}</select></div>
   {current&&<div className="woven-segment-editor"><div className="woven-segment-endpoints">段 {current.edge+1} · {edgeName(current.line)}<small>({current.from.map(format).join(', ')}) → ({current.to.map(format).join(', ')})</small></div>
    <div className="woven-segment-input-row"><label>单侧内缩 h<input aria-label="当前段单侧内缩" type="number" min={mode==='full'?0:.0025} max={params.mode==='graph'?10:1} step={params.mode==='graph'?.05:.0025} value={value} onChange={e=>{setDraft(p=>({...p,[current.edge]:e.target.value}));setError('');}}/></label><button type="button" onClick={()=>setDraft(p=>{const n={...p};if(mode==='full')n[current.edge]=String(current.base);else delete n[current.edge];return n;})}>恢复默认</button></div>
    {mode==='full'&&current.line<0&&(params.borderInset==='none'||wovenPeriodicityEnabled(params))&&<p className="woven-segment-intro">此边请求值保留；当前条件强制实际值为 0。</p>}
    <p className="woven-segment-intro">{mode==='full'?'边界允许 h=0；内边 h=0 会使折痕退化，不能采用。':'该段总条带宽为 2h。紫色表示绝对覆盖，青色为当前段。'}</p>
   </div>}
  </div></div>
  <footer className="woven-segment-footer"><span>{unmatched?'来源与当前母结构不匹配':mode==='full'?`完整保存 ${edges.length} 段，含 ${edges.filter(e=>e.line<0).length} 条边界段`:`已覆盖 ${Object.keys(draft).length} 段`}</span><button type="button" onClick={clear}>清除全部</button><button className="primary" disabled={!available.length} onClick={save}>保存逐段内缩</button></footer>
  {error&&<p className="woven-segment-error" role="alert">{error}</p>}
 </div></TessDialog>;
}
