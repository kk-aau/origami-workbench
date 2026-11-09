import {useEffect,useState} from 'react';
import type {FlatFoldResult} from '../core/types';

export default function LayerSolutionsPanel({result,busy,stale,onChoose}:{result:FlatFoldResult|null;busy:boolean;stale:boolean;onChoose:(index:number)=>void}){
  const current=result?.layers.status==='solved'?result.layers.solutionIndex:undefined;
  const total=result?.layers.solutionCountExact;
  const [target,setTarget]=useState('1');
  useEffect(()=>{setTarget(current===undefined?'1':String(current+1));},[result]);
  const number=Number(target),valid=/^\d+$/.test(target)&&Number.isSafeInteger(number)&&number>=1&&(!total||BigInt(number)<=BigInt(total));
  const disabled=busy||stale||result?.geometry.status!=='ready';
  return <section aria-label="层序候选"><h2>层序候选</h2>
    <p className="note" data-layer-candidate={current===undefined?'unknown':current+1}>{current===undefined?(result?.layers.status==='solved'?'已确认一个候选 · 尚未编号':'当前尚无已确认候选'):`当前第 ${current+1} 解`}{total?` · 共 ${total} 个引擎候选`:''}{busy?' · 正在计算…':''}{stale?' · 结果已过期':''}</p>
    <div className="button-pair"><button disabled={disabled||current===undefined||current===0} onClick={()=>onChoose(current!-1)}>上一解</button><button disabled={disabled||current===undefined||!total||BigInt(current+1)>=BigInt(total)||current>=Number.MAX_SAFE_INTEGER-1} onClick={()=>onChoose(current!+1)}>下一解</button></div>
    <label className="note">指定解编号<input aria-label="层序解编号" type="text" inputMode="numeric" value={target} disabled={disabled} onChange={e=>setTarget(e.target.value)} style={{width:'100%',minWidth:0,boxSizing:'border-box'}} onKeyDown={e=>{if(e.key==='Enter'&&valid&&!disabled){e.preventDefault();onChoose(number-1);}}}/></label>
    <button className="outline full" disabled={disabled||!valid} onClick={()=>onChoose(number-1)}>跳转到指定解</button>
    {!valid&&<p className="note warning">请输入范围内的正整数编号（最大安全整数以内）。</p>}
    <p className="note">只切换当前模型的层序，不修改顶点。每次在后台重新搜索，受时间预算约束；编号不代表 Oriedita 的解序，候选也不证明连续可折。</p>
  </section>;
}
