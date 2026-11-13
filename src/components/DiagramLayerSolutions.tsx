import DiagramRelativeLayerControls from './DiagramRelativeLayerControls';
import {useId,type ReactNode} from 'react';
import type {FlatFoldResult,FlatLayerPreference} from '../core/types';
import './DiagramLayerSolutions.css';

export type DiagramLayerAdjustmentDirection='up'|'down'|'top'|'bottom';
export interface DiagramLayerSolutionsProps {
  result:FlatFoldResult;
  toolbarActions?:ReactNode;
  side?:'front'|'back';
  onRelativeConstraints?:(required:FlatLayerPreference[])=>void;
  adjustmentMode?:boolean;
  adjustmentFace?:number;
  /** One-based rank from the current view, only when the full stack is certified. */
  position?:number;
  onAdjustmentModeChange?:(enabled:boolean)=>void;
  disabled?:boolean;
  busy?:boolean;
  error?:string;
  feedback?:string;
  /** The caller resolves each requested move to a solver-certified layer result. */
  onAdjust?:(face:number,direction:DiagramLayerAdjustmentDirection)=>void;
}

const actions:readonly {direction:DiagramLayerAdjustmentDirection;label:string}[]=[
  {direction:'up',label:'上移'},
  {direction:'down',label:'下移'},
  {direction:'top',label:'置顶'},
  {direction:'bottom',label:'置底'},
];

export default function DiagramLayerSolutions({result,toolbarActions,side='front',onRelativeConstraints,adjustmentMode=false,adjustmentFace,position,onAdjustmentModeChange,disabled=false,busy=false,error,feedback,onAdjust}:DiagramLayerSolutionsProps){
  const id=useId(),face=Number.isInteger(adjustmentFace)&&adjustmentFace!>=0&&adjustmentFace!<result.geometry.faces.length?adjustmentFace:undefined;
  const solved=result.layers.status==='solved',unique=result.layers.solutionCountExact?/^0*1$/.test(result.layers.solutionCountExact):result.layers.solutionCount===1;
  const rank=Number.isInteger(position)&&position!>=1&&position!<=result.geometry.faces.length?position:undefined;
  const locked=disabled||busy||!solved||unique||face===undefined||!onAdjust;
  const selectionMessage=face===undefined?(toolbarActions?'请在下方列表选择纸面。':'点击上方叠片或下方列表选纸面。'):!solved?'层序分析完成后可调整所选纸面的层位。':undefined;
  return <section className="diagram-layer-solutions" aria-label="纸面层位调整" aria-busy={busy} data-diagram-layer-adjustment="">
    <header className={toolbarActions?'diagram-layer-command-row':undefined}>
      {toolbarActions}
      <button type="button" className="diagram-layer-solutions-mode" data-diagram-layer-adjustment-mode="" aria-pressed={adjustmentMode} disabled={disabled||busy||!onAdjustmentModeChange} onClick={()=>onAdjustmentModeChange?.(!adjustmentMode)}>
        {toolbarActions&&<svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 8l8-4 8 4-8 4zM2 12l8 4 5-2.5M2 16l8 4 5-2.5M20 9v11m-3-8 3-3 3 3"/></svg>}
        {adjustmentMode?'完成调整':'调整层序'}
      </button>
      {!toolbarActions&&<span>{adjustmentMode&&face!==undefined?`纸面 F${face+1}`:'有效解范围内'}</span>}
    </header>
    {toolbarActions&&adjustmentMode&&face!==undefined&&<strong>纸面 F{face+1}</strong>}
    {adjustmentMode&&<>
    {face!==undefined&&<p className="diagram-layer-solutions-position" title="从当前观察方向的最上层开始编号">{rank===undefined?'当前层位未确认':`当前第 ${rank} 层 / 共 ${result.geometry.faces.length} 层`}</p>}
    {selectionMessage&&<p className="diagram-layer-solutions-selection">{selectionMessage}</p>}
    <div className="diagram-layer-solutions-actions" role="group" aria-label={face===undefined?'选中单个纸面后调整层位':`调整纸面 F${face+1} 的层位`} aria-describedby={`${id}-help`}>
      {actions.map(({direction,label})=><button key={direction} type="button" data-diagram-layer-adjust={direction} disabled={locked||((direction==='up'||direction==='top')&&rank===1)||((direction==='down'||direction==='bottom')&&rank===result.geometry.faces.length)} onClick={()=>{if(!locked&&face!==undefined)onAdjust?.(face,direction);}}>{label}</button>)}
    </div>
    {onRelativeConstraints&&<DiagramRelativeLayerControls faceCount={result.geometry.faces.length} selectedFace={face} side={side} required={result.layers.relativeConstraints??[]} disabled={disabled||busy||!solved} onChange={onRelativeConstraints}/>}
    {busy&&<p className="diagram-layer-solutions-feedback" role="status">正在查找符合层序的调整…</p>}
    {!busy&&feedback&&<p className="diagram-layer-solutions-feedback" role="status">{feedback}</p>}
    {error&&<p className="diagram-layer-solutions-error" role="alert">{error}</p>}
    <p id={`${id}-help`} className="diagram-layer-solutions-help">{unique?'当前仅有一个有效解，层位无法调整。':'有效解范围内调整，主图同步。'}</p>
    </>}
  </section>;
}
