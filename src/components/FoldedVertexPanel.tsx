import {useEffect,useState} from 'react';
import type {FlatFoldResult,FoldGraph,Point} from '../core/types';
import {selectFoldedVertex,type FoldedVertexSelection} from '../app/foldedVertexEdit';
import UnfoldedVertexMap from './UnfoldedVertexMap';

/** Unfolded vertex identities disambiguate points coincident in the folded model. */
export default function FoldedVertexPanel({result,source,disabled,onMove,selection,onSelect:setSelection}:{result:FlatFoldResult;source:FoldGraph;disabled:boolean;onMove:(selection:FoldedVertexSelection,destination:Point)=>void;selection:FoldedVertexSelection;onSelect:(s:FoldedVertexSelection)=>void}) {
  const [x,setX]=useState(''),[y,setY]=useState('');
  useEffect(()=>{const p=result.geometry.vertices[selection.selected[0]];setX(p?String(p[0]):'');setY(p?String(p[1]):'');},[result,selection,source]);
  function choose(index:number){if(disabled)return;const next=selectFoldedVertex(result.geometry.vertices,selection,index,'unfolded');setSelection(next);const p=result.geometry.vertices[index];setX(String(p[0]));setY(String(p[1]));}
  const valid=x.trim()!==''&&y.trim()!==''&&[Number(x),Number(y)].every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6);
  return <section data-model-history="true" tabIndex={-1} onPointerDown={e=>{if(!(e.target as Element).closest('input,textarea,select,button'))e.currentTarget.focus({preventScroll:true});}} aria-label="模型顶点坐标编辑" onContextMenu={e=>{e.preventDefault();setSelection({group:[],selected:[]});}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setSelection({group:[],selected:[]});}}}>
    <h2>模型顶点</h2><p className="note">本区 Ctrl+Z 撤销模型，Ctrl+Y / Ctrl+Shift+Z 重做；输入框内仍为文本撤销。</p><p className="note">在展开图点选顶点；同一折后位置的顶点可逐个加选或取消。坐标是模型坐标，不随正背视图翻转。</p>
    <UnfoldedVertexMap source={source} selection={selection} disabled={disabled} onChoose={choose}/>
    <p className="note">{selection.selected.length?`已选 ${selection.selected.map(i=>i+1).join('、')}；全部选点将移至同一目标。`:'请选择顶点。右击或 Esc 清除本次选择。'}</p>
    <div className="button-pair" style={{minWidth:0}}><label style={{minWidth:0}}> X<input aria-label="模型顶点 X" style={{width:'100%',minWidth:0,boxSizing:'border-box'}} type="number" step="any" value={x} disabled={disabled||!selection.selected.length} onChange={e=>setX(e.target.value)}/></label><label style={{minWidth:0}}> Y<input aria-label="模型顶点 Y" style={{width:'100%',minWidth:0,boxSizing:'border-box'}} type="number" step="any" value={y} disabled={disabled||!selection.selected.length} onChange={e=>setY(e.target.value)}/></label></div>
    <button className="outline full" disabled={disabled||!selection.selected.length||!valid} onClick={()=>onMove(selection,[Number(x),Number(y)])}>应用顶点坐标并重分析</button>
    <p className="note warning">只修改折叠结果，可能改变边长；不证明原折痕可折。请导出模型快照或模型集合，顶部保存工程不包含模型。重新计算会保留已有模型；文件不保存撤销历史。</p>
  </section>;
}
