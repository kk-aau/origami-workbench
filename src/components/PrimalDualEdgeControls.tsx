import {useState} from 'react';
import {changeTessParams,type TessParams,type TessResult} from '../app/tessellation';
import {TessDialog} from './TessellationEditor';
import UnsafeTwistRangeControls from './UnsafeTwistRangeControls';

type Params=Extract<TessParams,{family:'primal-dual'}>;
const key=([a,b]:[number,number])=>`${Math.min(a,b)},${Math.max(a,b)}`;

/** A stable mother shared edge identifies the primal/dual pair; output crease IDs do not. */
export default function PrimalDualEdgeControls({params,result,onChange}:{
  params:Params;result:TessResult|null;onChange:(p:TessParams)=>void}){
  const [open,setOpen]=useState(false),[draft,setDraft]=useState<Set<string>>(new Set());
  const mother=result?.mother;
  const edges=mother?.edges_vertices.flatMap((edge,i)=>
    mother.edges_assignment[i]==='B'?[]:[{edge:[...edge].sort((a,b)=>a-b) as [number,number],
      points:edge.map(v=>mother.vertices_coords[v])}])??[];
  const edit=()=>{setDraft(new Set((params.dualEdgeFlips??[]).map(key)));setOpen(true);};
  const apply=()=>{
    const selected=edges.map(row=>row.edge).filter(edge=>draft.has(key(edge)));
    onChange(changeTessParams(params,{dualEdgeFlips:selected.length?selected:undefined}));
    setOpen(false);
  };
  return <>
    <UnsafeTwistRangeControls/>
    <button className="text-button" disabled={!mother} onClick={edit}>
      成对定向{params.dualEdgeFlips?.length?` · ${params.dualEdgeFlips.length} 条已翻转`:''}
    </button>
    {open&&<TessDialog title="原始边／对偶边成对定向" onClose={()=>setOpen(false)}>
      <p>每条内部共享边对应一条有向对偶边。勾选表示相对自动方向反转；对应原始边同步反转，以保持原版要求的有向正交。确认后重新检查山谷、局部和整片层序。</p>
      <div style={{maxHeight:'min(46vh,370px)',overflowY:'auto'}}>
        {edges.map(({edge,points})=>{
          const id=key(edge);
          return <label key={id} className="checkbox" style={{display:'flex',gap:8,alignItems:'center'}}>
            <input type="checkbox" checked={draft.has(id)} onChange={event=>setDraft(before=>{
              const next=new Set(before);if(event.target.checked)next.add(id);else next.delete(id);return next;
            })}/>
            母边 {edge[0]+1}–{edge[1]+1} · ({points[0][0].toFixed(3)}, {points[0][1].toFixed(3)}) — ({points[1][0].toFixed(3)}, {points[1][1].toFixed(3)}) · {draft.has(id)?'反向':'自动'}
          </label>;
        })}
      </div>
      <p className="note">定向只改变对应褶线的山谷候选；不保证全局层序有解。</p>
      <footer><button className="primary" onClick={apply}>应用定向并重新检查</button></footer>
    </TessDialog>}
  </>;
}
