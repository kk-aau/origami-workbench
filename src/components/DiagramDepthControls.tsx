import {useEffect,useState} from 'react';
import type {DiagramPose} from '../app/diagramProject';
import {defaultDiagramDepth,diagramDepthAvailable,type DiagramDepth} from '../app/diagramDepth';
import {NumberField} from './Fields';
import './DiagramDepthControls.css';

export default function DiagramDepthControls({pose,disabled,onChange}:{pose:DiagramPose;disabled:boolean;onChange:(depth:DiagramDepth)=>void}){
 const value=pose.view?.depth??{...defaultDiagramDepth(),amount:0},available=diagramDepthAvailable(pose),active=available&&value.amount>0;
 const [draft,setDraft]=useState(value.amount);useEffect(()=>setDraft(value.amount),[value.amount]);
 const commit=()=>{if(draft!==value.amount)onChange({...value,amount:draft});};
 const reason=pose.spatial?'当前采用真实立体姿态。':pose.paperDeformation?.nodes.length?'当前采用拖角造型。':'需要保持纸面尺寸且层序已确认的多层平折图。';
 return <details className="diagram-depth-controls"><summary>图解立体化{active?' · 已开启':''}</summary><div className="diagram-depth-fields">
  <label><input type="checkbox" aria-label="自动展开纸层" checked={active} disabled={disabled||!available} onChange={e=>onChange({...value,amount:e.target.checked ? .05 : 0})}/>自动展开纸层</label>
  {!available?<p>{reason}</p>:<>
   <label className="diagram-depth-range"><span>展开量 {Math.round(draft*1000)/10}%</span><input aria-label="纸层展开量" type="range" min="0" max="0.15" step="0.005" value={draft} disabled={disabled} onChange={e=>setDraft(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit}/></label>
   <NumberField label="展开方向" value={value.direction} min={0} max={359} step={5} suffix="°" disabled={disabled||!active} onChange={direction=>onChange({...value,direction})}/>
   <button type="button" disabled={disabled||!active} onClick={()=>onChange({...value,amount:0})}>恢复平折显示</button>
   <p>仅展开图解纸层，CP 和折角保持不变。可继续选纸层、画折线；拖角时恢复原纸面。细小纸面会自动减小展开幅度。</p>
  </>}
 </div></details>;
}
