import {useId,useState} from 'react';
import FoldAngleControls,{type FoldAngleControlsProps} from './FoldAngleControls';
import './FoldAnglePanel.css';

export interface FoldAnglePanelProps extends Omit<FoldAngleControlsProps,'label'|'presets'> {
  /** Number of selected mountain/valley creases. No panel appears when zero. */
  selectedCount:number;
  ignoredCount?:number;
  className?:string;
}

const PRESETS=[180,135,120,90,60,45] as const;

/** Selection-only editor. Mount inside a positioned canvas container; this
 * component never changes the angle used for subsequently drawn creases. */
export default function FoldAnglePanel({selectedCount,ignoredCount=0,className='',...controls}:FoldAnglePanelProps){
  const id=useId(),[collapsed,setCollapsed]=useState(true);
  if(selectedCount<=0||controls.value==='none')return null;
  const current=controls.value==='mixed'?'所选折痕的角度不一致':controls.value===null?(controls.unknownLabel==='自适应'?'自适应 · 根据其他折痕推算':'当前角度未知'):`当前 ${controls.value}°`;
  return <section className={`fold-angle-panel ${className}`.trim()} aria-label="折叠角度" onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()} onDoubleClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()} onWheel={event=>event.stopPropagation()}>
    <button type="button" className="fold-angle-panel-toggle" aria-expanded={!collapsed} aria-controls={id} onClick={()=>setCollapsed(value=>!value)}>
      <strong>折叠角度</strong>
      <span className="fold-angle-panel-count">已选 {selectedCount} 条</span>
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true"><path d={collapsed?'m5 6 3 3 3-3':'m5 10 3-3 3 3'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
    <div id={id} className="fold-angle-panel-body" hidden={collapsed}>
      <p className="fold-angle-panel-current" aria-live="polite">{current}</p>
      <FoldAngleControls {...controls} label="自定义" presets={PRESETS}/>
      <p className="fold-angle-panel-help">0° 展开 · 180° 平折</p>
      {ignoredCount>0&&<p className="fold-angle-panel-ignored">另选的 {ignoredCount} 条非折痕保持不变。</p>}
    </div>
  </section>;
}
