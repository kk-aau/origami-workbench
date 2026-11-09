import {useState} from 'react';
import {changeTessParams,type TessGraph,type TessParams,type TessResult} from '../app/tessellation';
import {TessDialog} from './TessellationEditor';

type Params=Extract<TessParams,{family:'primal-dual'}>;

export default function PrimalDualVisibleFaceControls({params,result,onChange}:{
  params:Params;result:TessResult|null;onChange:(p:TessParams)=>void}){
  const [open,setOpen]=useState(false),[face,setFace]=useState(1),[side,setSide]=useState<1|-1>(1);
  const [seedOpen,setSeedOpen]=useState(false),[seedFace,setSeedFace]=useState(1),[seedSide,setSeedSide]=useState<1|-1>(1);
  const count=(result?.fold as TessGraph|undefined)?.faces_vertices?.length??0;
  const edit=()=>{setFace(Math.min(count,Math.max(1,Math.abs(params.visibleTopFace??1))));setSide((params.visibleTopFace??1)<0?-1:1);setOpen(true);};
  const apply=()=>{onChange(changeTessParams(params,{visibleTopFace:side*face}));setOpen(false);};
  const editSeed=()=>{setSeedFace(Math.min(count,Math.max(1,Math.abs(params.faceupFace??1))));setSeedSide((params.faceupFace??1)<0?-1:1);setSeedOpen(true);};
  const applySeed=()=>{onChange(changeTessParams(params,{faceupFace:seedSide*seedFace}));setSeedOpen(false);};
  return <>
    <button className="text-button" disabled={!count} onClick={editSeed}>
      FaceupFace{params.faceupFace?` · ${params.faceupFace>0?'正':'反'} F${Math.abs(params.faceupFace)}`:' · 自动'}
    </button>
    <button className="text-button" disabled={!count} onClick={edit}>
      可见顶面{params.visibleTopFace?` · ${params.visibleTopFace>0?'正':'反'} F${Math.abs(params.visibleTopFace)}`:' · 自动'}
    </button>
    {seedOpen&&<TessDialog title="FaceupFace · 局部面向种子" onClose={()=>setSeedOpen(false)}>
      <p>指定一个折痕面在平折结果中正面或反面朝上。按原版二染色规则向相邻面传播，并用山谷类型确认每条共享折痕两侧的局部上下关系；不要求它成为整片纸的最上层。</p>
      <div className="tess-pair"><label className="select-field">折痕面编号<input aria-label="FaceupFace 面编号" type="number" min={1} max={count} step={1} value={seedFace} onChange={e=>setSeedFace(Number(e.target.value))}/></label>
        <label className="select-field">该面朝上纸面<select aria-label="FaceupFace 纸面" value={seedSide} onChange={e=>setSeedSide(Number(e.target.value) as 1|-1)}><option value={1}>正面</option><option value={-1}>反面</option></select></label></div>
      <p className="note">F1…F{count} 是工作区规范化后的折痕面编号。编号可能与 Mathematica 原始面序不同；保存输入前请按当前折痕图选择对应物理面。</p>
      <footer><button className="text-button" onClick={()=>{onChange(changeTessParams(params,{faceupFace:undefined}));setSeedOpen(false);}}>恢复自动</button>
        <button className="primary" disabled={!Number.isInteger(seedFace)||seedFace<1||seedFace>count} onClick={applySeed}>应用并验证局部层序</button></footer>
    </TessDialog>}
    {open&&<TessDialog title="可见顶面约束" onClose={()=>setOpen(false)}>
      <p>要求选定折痕面成为当前平折视图的全局最上层，并指定朝上的纸张一面。若没有满足条件的层序，候选不能采用。</p>
      <div className="tess-pair"><label className="select-field">折痕面编号<input aria-label="可见顶面编号" type="number" min={1} max={count} step={1} value={face} onChange={e=>setFace(Number(e.target.value))}/></label>
        <label className="select-field">朝上纸面<select aria-label="可见顶面纸面" value={side} onChange={e=>setSide(Number(e.target.value) as 1|-1)}><option value={1}>正面</option><option value={-1}>反面</option></select></label></div>
      <p className="note">F1…F{count} 是工作区规范化后的折痕面编号，与 Mathematica 原始面序未必相同。这里是严格的全局可见顶面约束，范围比原版 FaceupFace 的局部层序传播种子更窄。</p>
      <footer><button className="text-button" onClick={()=>{onChange(changeTessParams(params,{visibleTopFace:undefined}));setOpen(false);}}>恢复自动</button>
        <button className="primary" disabled={!Number.isInteger(face)||face<1||face>count} onClick={apply}>应用并检查层序</button></footer>
    </TessDialog>}
  </>;
}
