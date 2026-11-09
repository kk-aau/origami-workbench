import {useMemo} from 'react';
import type {Doc} from '../core/types';
import {mergeAllVertices} from '../app/mergeAllVertices';
import {getDrawingBounds} from '../app/paper';
export default function MergeAllVertices({doc,lockBoundary,onApply,onClose}:{doc:Doc;lockBoundary:boolean;onApply:(doc:Doc)=>boolean;onClose:()=>void}){
 const preview=useMemo(()=>{try{return {result:mergeAllVertices(doc,lockBoundary),error:''};}catch(e){return {result:null,error:e instanceof Error?e.message:String(e)};}},[doc,lockBoundary]);
 const result=preview.result,bounds=getDrawingBounds(doc),pad=Math.max(bounds.width,bounds.height)*.05||1;
 return <section aria-label="批量合点预览"><p className="note">仅移除恰好连接两条共线线段的公共顶点，线型与折角必须一致。辅助线不参与合并；T 接点、交叉点、折角及线型冲突均保留。此操作针对全图，不限于选区。</p>
 <p className="note">边界保护{lockBoundary?'已开启：纸边不会合并':'未开启：同类型共线纸边也会合并'}。圆、文字、标记与底图不变；确认后清空选区，可一次撤销。</p>
 {result&&<><p>可合并 <strong>{result.merged}</strong> 个冗余顶点 · 线段 {doc.segments.length} → {result.doc.segments.length}</p>
 <svg role="img" aria-label="批量合点结果，紫色为合并后的线段" viewBox={`${bounds.x-pad} ${bounds.y-pad} ${bounds.width+2*pad} ${bounds.height+2*pad}`} style={{width:'100%',height:220,background:'#fffefb',border:'1px solid #d9e1d6'}}>{result.doc.segments.map(s=><line key={s.id} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={result.changedIds.has(s.id)?'#8854b8':'#9aa29c'} strokeWidth={result.changedIds.has(s.id)?2:1} vectorEffect="non-scaling-stroke"/>)}</svg></>}
 {preview.error&&<p role="alert">{preview.error}</p>}
 <div className="button-pair"><button className="primary" disabled={!result?.merged} onClick={()=>{if(result&&onApply(result.doc))onClose();}}>确认批量合点</button><button onClick={onClose}>取消，不修改</button></div>
 </section>;
}
