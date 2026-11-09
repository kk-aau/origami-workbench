import {useEffect,useState} from 'react';
import type {FlatFoldResult} from '../core/types';
import type {ModelOverlapRegions} from '../app/modelOverlapRegions';
import type {FlagstoneFaceGroupResult,FlagstoneGroupOcclusion} from '../app/flagstoneFaceGroups';
import './FlagstoneFaceGroupsPanel.css';

export interface FlagstoneFaceGroupsPanelProps {
  /** The current flat-fold result. Never pass a held result from an older parameter set. */
  result:FlatFoldResult|null;
  /** Optional analysis of this exact result; omitted means compute in a Worker. */
  overlapRegions?:ModelOverlapRegions;
  /** Optionally focus an original face in the shared canvas. Face IDs are zero-based. */
  onSelectFace?:(face:number)=>void;
}

interface Completed {result:FlatFoldResult;regions:ModelOverlapRegions|undefined;value:FlagstoneFaceGroupResult}
const failed=(message:string):FlagstoneFaceGroupResult=>({status:'unconfirmed',message,groups:[],occlusions:[]});
const faceName=(id:number)=>`F${id+1}`;

/** Compact, read-only index of proven face-order groups. The Worker prevents
 * overlap decomposition from interrupting live tessellation parameter changes.
 */
export default function FlagstoneFaceGroupsPanel({result,overlapRegions,onSelectFace}:FlagstoneFaceGroupsPanelProps){
  const [completed,setCompleted]=useState<Completed|null>(null);
  const [selectedLevel,setSelectedLevel]=useState(0);
  useEffect(()=>{
    if(!result||result.geometry.status!=='ready'||result.layers.status!=='solved')return;
    let live=true,worker:Worker|undefined,deadline:ReturnType<typeof setTimeout>|undefined;
    const finish=(value:FlagstoneFaceGroupResult)=>{
      if(!live)return;
      live=false;
      if(deadline!==undefined)clearTimeout(deadline);
      worker?.terminate();
      setCompleted({result,regions:overlapRegions,value});
    };
    // Wait for a short quiet period; the shared canvas may render many frames
    // while a slider is dragged. Previous analyses are discarded immediately.
    const start=setTimeout(()=>{
      if(!live)return;
      try{
        worker=new Worker(new URL('../workers/flagstoneFaceGroups.worker.ts',import.meta.url),{type:'module'});
        worker.onmessage=(event:MessageEvent<FlagstoneFaceGroupResult>)=>finish(event.data);
        worker.onerror=()=>finish(failed('层序分组线程失败；请重新计算当前平折结果。'));
        worker.onmessageerror=()=>finish(failed('无法读取层序分组结果。'));
        worker.postMessage({result,regions:overlapRegions});
        deadline=setTimeout(()=>finish(failed('层序分组分析超时；当前面组仍未确认。')),30_000);
      }catch(error){finish(failed(`无法启动层序分组：${error instanceof Error?error.message:String(error)}`));}
    },160);
    return()=>{live=false;clearTimeout(start);if(deadline!==undefined)clearTimeout(deadline);worker?.terminate();};
  },[result,overlapRegions]);

  const current=completed?.result===result&&completed.regions===overlapRegions?completed.value:null;
  const grouped=current?.status==='grouped'?current:null;
  const group=grouped?.groups.find(item=>item.level===selectedLevel)??grouped?.groups[0];
  const edges=group?grouped!.occlusions.filter(edge=>edge.belowGroup===group.level||edge.aboveGroup===group.level):[];
  const pending=!!result&&result.geometry.status==='ready'&&result.layers.status==='solved'&&!current;
  const explanation=!result?'生成铺石平折后可检查面层序。':result.geometry.status!=='ready'?result.geometry.message||'平折几何尚未确认。':result.layers.status!=='solved'?result.layers.message||'平折层序尚未求解。':current?.status!=='grouped'?current?.message||'正在核对重叠区域与层序关系…':'';

  return <section className="flagstone-face-groups" aria-label="铺石层序面组" data-group-status={grouped?'grouped':pending?'pending':current?.status??'unconfirmed'}>
    <div className="ffg-heading"><div><small>FLAGSTONE / GROUP FACES</small><h2>层序面组</h2></div><span className="ffg-state" role="status">{grouped?'已验证':pending?'计算中':'未确认'}</span></div>
    {!grouped?<p className="ffg-message" role="status">{explanation}</p>:<>
      <div className="ffg-metrics" aria-label="层序分组统计"><span><strong>{grouped.groups.length}</strong> 组</span><span><strong>{result!.geometry.faces.length}</strong> 面</span><span><strong>{grouped.occlusions.length}</strong> 组间关系</span></div>
      <p className="ffg-definition">L 为偏序最长链等级，表示正面 +Z 的先后关系；不是纸层的物理高度。背面观察顺序相反。</p>
      <div className="ffg-group-list" role="group" aria-label="选择层序等级">
        {grouped.groups.map(item=><button type="button" key={item.level} className="ffg-group" aria-pressed={group?.level===item.level} onClick={()=>setSelectedLevel(item.level)} aria-label={`等级 L${item.level}，${item.faces.length} 个面`}>
          <span className="ffg-level">L{item.level}</span><span className="ffg-group-count">{item.faces.length} 面</span><span className="ffg-group-preview">{item.faces.slice(0,3).map(faceName).join(' · ')}{item.faces.length>3?' …':''}</span>
        </button>)}
      </div>
      {group&&<div className="ffg-inspection" aria-label={`等级 L${group.level} 的面与遮挡证据`}>
        <div className="ffg-inspection-title"><strong>L{group.level} 的面</strong><span>{group.faces.length} 个</span></div>
        <div className="ffg-faces">{group.faces.slice(0,18).map(face=>onSelectFace?<button type="button" key={face} onClick={()=>onSelectFace(face)} title={`在画布定位 ${faceName(face)}`}>{faceName(face)}</button>:<span key={face}>{faceName(face)}</span>)}</div>
        {group.faces.length>18&&<details className="ffg-more"><summary>展开另外 {group.faces.length-18} 个面</summary><div className="ffg-faces">{group.faces.slice(18).map(face=>onSelectFace?<button type="button" key={face} onClick={()=>onSelectFace(face)}>{faceName(face)}</button>:<span key={face}>{faceName(face)}</span>)}</div></details>}
        <div className="ffg-inspection-title ffg-evidence-title"><strong>实际遮挡证据</strong><span>{edges.length} 条组间关系</span></div>
        {edges.length?edges.map(edge=><OcclusionEvidence key={`${edge.belowGroup}-${edge.aboveGroup}`} edge={edge}/>):<p className="ffg-no-edges">此等级的面与其他等级没有已证实的面积遮挡。</p>}
      </div>}
      {!!grouped.omittedThinRegions&&<p className="ffg-precision">有 {grouped.omittedThinRegions} 处过窄区域未绘制；分组依据已验证的面积区域与求解器层序。</p>}
    </>}
  </section>;
}

function OcclusionEvidence({edge}:{edge:FlagstoneGroupOcclusion}){
  const visible=edge.facePairs.slice(0,4),remaining=edge.facePairs.length-visible.length;
  return <div className="ffg-edge">
    <div className="ffg-edge-heading"><strong>L{edge.belowGroup} <span aria-hidden="true">↑</span> L{edge.aboveGroup}</strong><small>{edge.cellIndices.length} 个重叠区域</small></div>
    <div className="ffg-pairs">{visible.map(([below,above])=><span key={`${below}-${above}`}>{faceName(below)} 在下 <b>→</b> {faceName(above)} 在上</span>)}</div>
    {remaining>0&&<details className="ffg-more"><summary>另有 {remaining} 对面片证据</summary><div className="ffg-pairs">{edge.facePairs.slice(4).map(([below,above])=><span key={`${below}-${above}`}>{faceName(below)} 在下 <b>→</b> {faceName(above)} 在上</span>)}</div></details>}
  </div>;
}
