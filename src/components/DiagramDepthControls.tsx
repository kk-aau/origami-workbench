import {useEffect,useId,useRef,useState} from 'react';
import type {DiagramPose} from '../app/diagramProject';
import {defaultDiagramDepth,diagramDepthAvailable,type DiagramDepth} from '../app/diagramDepth';
import {NumberField} from './Fields';
import './DiagramDepthControls.css';

export default function DiagramDepthControls({pose,preview,disabled,onChange,onPreview,onCameraVisibleChange}:{pose:DiagramPose;preview?:DiagramDepth;disabled:boolean;onChange:(depth:DiagramDepth)=>void;onPreview:(depth:DiagramDepth|null)=>void;onCameraVisibleChange:(visible:boolean)=>void}){
 const amount=pose.view?.depth?.amount??0,direction=pose.view?.depth?.direction??defaultDiagramDepth().direction;
 const fieldId=useId();
 const value={amount,direction},available=diagramDepthAvailable(pose),active=available&&(preview?.amount??amount)>0;
 const [draft,setDraft]=useState(value),latest=useRef(draft),[camera,setCamera]=useState(true),lastCommit=useRef('');
 useEffect(()=>{const next=preview??{amount,direction};latest.current=next;setDraft(next);},[amount,direction,preview]);
 useEffect(()=>{onCameraVisibleChange(camera&&active&&!disabled);return()=>onCameraVisibleChange(false);},[camera,active,disabled,onCameraVisibleChange]);
 useEffect(()=>()=>onPreview(null),[onPreview]);
 const update=(next:DiagramDepth)=>{lastCommit.current='';latest.current=next;setDraft(next);onPreview(next);};
 const apply=(next=latest.current)=>{const key=JSON.stringify(next);if((next.amount!==amount||next.direction!==direction)&&key!==lastCommit.current){lastCommit.current=key;onChange(next);}onPreview(null);};
 const cancel=()=>{latest.current=value;setDraft(value);onPreview(null);};
 const reason=pose.paperDeformation?.nodes.length?'当前采用拖角造型。':pose.spatial?'需要完整且已确认的纸层顺序；只有局部层序的立体结构暂不支持展开。':'需要保持纸面尺寸且层序已确认的多层折图。';
 return <details className="diagram-depth-controls" onToggle={e=>{if(!e.currentTarget.open)cancel();}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();}}}><summary>图解立体化{active?' · 已开启':''}</summary><div className="diagram-depth-fields">
  <label><input type="checkbox" aria-label="自动展开纸层" checked={active} disabled={disabled||!available} onChange={e=>apply({...latest.current,amount:e.target.checked ? .05 : 0})}/>自动展开纸层</label>
  {!available?<p>{reason}</p>:<>
   <div className="diagram-depth-slider-row"><label htmlFor={fieldId+'-amount'}>展开量</label><input id={fieldId+'-amount'} aria-label="纸层展开量" type="range" min="0" max="0.15" step="0.005" value={draft.amount} disabled={disabled} onChange={e=>update({...latest.current,amount:Number(e.currentTarget.value)})} onPointerUp={e=>apply({...latest.current,amount:Number(e.currentTarget.value)})} onPointerCancel={cancel} onKeyUp={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key))apply();}} onBlur={()=>apply()}/><output>{Number((draft.amount*100).toFixed(1))}%</output></div>
   <div className="diagram-depth-slider-row"><label htmlFor={fieldId+'-direction'}>方向</label><input id={fieldId+'-direction'} aria-label="展开方向滑条" type="range" min="0" max="359" step="1" value={draft.direction} disabled={disabled||!active} onChange={e=>update({...latest.current,direction:Number(e.currentTarget.value)})} onPointerUp={e=>apply({...latest.current,direction:Number(e.currentTarget.value)})} onPointerCancel={cancel} onKeyUp={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key))apply();}} onBlur={()=>apply()}/><output>{Math.round(draft.direction)}°</output></div>
   <NumberField label="展开方向" value={draft.direction} min={0} max={359} step={1} suffix="°" disabled={disabled||!active} onChange={direction=>apply({...latest.current,direction})}/>
   <label><input type="checkbox" aria-label="显示相机方向" checked={camera} disabled={disabled||!active} onChange={e=>setCamera(e.target.checked)}/>显示相机方向 · 可在画布拖动相机</label>
   <button type="button" disabled={disabled||!active} onClick={()=>apply({...latest.current,amount:0})}>{pose.spatial?'恢复原始立体显示':'恢复平折显示'}</button>
   <p>拖动时预览，松开后应用。仅调整图解纸层，CP 与折角保持不变。</p>
  </>}
 </div></details>;
}
