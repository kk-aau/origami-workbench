import {useMemo,useState} from 'react';
import type {Doc} from '../core/types';
import {mergeAllCrossTypeVertices} from '../app/mergeAllVertices';
import {getDrawingBounds} from '../app/paper';

export default function MergeCrossVertices({doc,lockBoundary,onApply,onClose}:{doc:Doc;lockBoundary:boolean;onApply:(doc:Doc)=>boolean;onClose:()=>void}){
 const [angle,setAngle]=useState('');
 const preview=useMemo(()=>{try{return {result:mergeAllCrossTypeVertices(doc,lockBoundary,angle===''?undefined:angle==='null'?null:Number(angle)),error:''};}catch(e){return {result:null,error:e instanceof Error?e.message:String(e)};}},[doc,lockBoundary,angle]);
 const result=preview.result,bounds=getDrawingBounds(doc),pad=Math.max(bounds.width,bounds.height)*.05||1;
 return <section aria-label="跨线型批量合点预览"><p className="note">按 Oriedita 跨线型规则合并全图共线分点：边＋山／谷保留折型，山＋谷变为边界。同类型但折角冲突的点默认保留；选择统一折角后才会纳入。</p>
  <p className="note">边界保护{lockBoundary?'已开启：涉及纸边的点不会合并':'未开启：纸边也按规则参与'}。辅助线、未指派线和平线不跨类型静默合并。</p>
  {result&&<><p>可合并 <strong>{result.merged}</strong> 个冗余顶点 · 线段 {doc.segments.length} → {result.doc.segments.length}</p><svg role="img" aria-label="跨线型批量合点结果，紫色为合并后的线段" viewBox={`${bounds.x-pad} ${bounds.y-pad} ${bounds.width+2*pad} ${bounds.height+2*pad}`} style={{width:'100%',height:220,background:'#fffefb',border:'1px solid #d9e1d6'}}>{result.doc.segments.map(s=><line key={s.id} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={result.changedIds.has(s.id)?'#8854b8':'#9aa29c'} strokeWidth={result.changedIds.has(s.id)?2:1} vectorEffect="non-scaling-stroke"/>)}</svg></>}
  <label className="select-field">统一处理同类型折角冲突<select aria-label="跨线型合点折角" value={angle} onChange={e=>setAngle(e.target.value)}><option value="">保留冲突点（推荐）</option><option value="null">合并后设为未指定</option><option value="-180">合并后设为 −180°</option><option value="180">合并后设为 180°</option></select></label>
  {preview.error&&<p role="alert">{preview.error}</p>}
  <div className="button-pair"><button className="primary" disabled={!result?.merged} onClick={()=>{if(result&&onApply(result.doc))onClose();}}>确认跨线型合点</button><button onClick={onClose}>取消，不修改</button></div>
 </section>;
}
