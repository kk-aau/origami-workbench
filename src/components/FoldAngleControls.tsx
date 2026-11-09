import {useEffect,useId,useRef,useState} from 'react';
import {parseFoldAngleDraft,type FoldAngleValue} from '../app/foldAngles';
import './FoldAngleControls.css';

export interface FoldAngleControlsProps {
  value:FoldAngleValue;
  onApply:(magnitude:number|null)=>boolean|void;
  label?:string;
  disabled?:boolean;
  disabledReason?:string;
  /** Pass the selected Set or another stable selection identity to discard drafts. */
  selectionKey?:unknown;
  allowUnknown?:boolean;
  presets?:readonly number[];
  unknownLabel?:string;
}
const numericText=(value:FoldAngleValue)=>typeof value==='number'?String(value):'';

// Recreated selection containers must not erase an unfinished numeric draft.
function sameSelection(a:unknown,b:unknown):boolean {
  if(Object.is(a,b))return true;
  if(a instanceof Set&&b instanceof Set)return a.size===b.size&&[...a].every(item=>b.has(item));
  if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((item,index)=>Object.is(item,b[index]));
  return false;
}

/** Drafting and selecting never write to the document. Only Apply/Enter or the
 * explicit unknown action publishes one angle-property transaction. */
export default function FoldAngleControls({value,onApply,label='折叠角度',disabled=false,disabledReason,selectionKey,allowUnknown=true,presets=[],unknownLabel='设为未知'}:FoldAngleControlsProps){
  const id=useId(),[text,setText]=useState(()=>numericText(value)),[error,setError]=useState('');
  const previous=useRef({value,selectionKey});
  useEffect(()=>{
    if(!Object.is(previous.current.value,value)||!sameSelection(previous.current.selectionKey,selectionKey)){
      setText(numericText(value));setError('');
    }
    previous.current={value,selectionKey};
  },[value,selectionKey]);
  const locked=disabled||value==='none';
  const unavailable=locked?(disabledReason??(value==='none'?'请选择山折或谷折折痕。':'当前无法修改折角，请待操作完成或切换到可编辑状态。')):'';
  function apply(magnitude:number|null){
    if(locked)return;
    try{
      if(onApply(magnitude)===false){setError('未能修改折叠角度，请检查所选折痕是否可编辑。');return;}
      setText(magnitude===null?'':String(magnitude));setError('');
    }
    catch(error){setError(error instanceof Error?error.message:String(error));}
  }
  function commit(){
    if(locked)return;
    try{apply(parseFoldAngleDraft(text));}
    catch(error){setError(error instanceof Error?error.message:String(error));}
  }
  return <div className="fold-angle-controls" role="group" aria-label={label}>
    {presets.length>0&&<div className="fold-angle-presets" role="group" aria-label="常用折叠角度">
      {presets.map(angle=><button key={angle} type="button" disabled={locked} aria-pressed={value===angle} onClick={()=>apply(angle)}>{angle}°</button>)}
    </div>}
    <div className="fold-angle-custom">
      <label htmlFor={id}>{label}</label>
      <span className="fold-angle-input"><input id={id} aria-label={label} type="number" inputMode="decimal" min={0} max={180} step="any" value={text} placeholder={value==='mixed'?'角度不一':value===null?'未知':value==='none'?'未选折痕':undefined} disabled={locked} aria-invalid={!!error} aria-describedby={error?`${id}-error`:unavailable?`${id}-unavailable`:undefined} onChange={event=>{setText(event.target.value);setError('');}} onKeyDown={event=>{
      if(event.nativeEvent.isComposing||event.keyCode===229)return;
      if(event.key==='Enter'){event.preventDefault();event.stopPropagation();commit();}
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setText(numericText(value));setError('');}
      }}/><span aria-hidden="true">°</span></span>
      <button className="fold-angle-apply" type="button" disabled={locked} onClick={commit}>应用</button>
    </div>
    {allowUnknown&&<button className="fold-angle-unknown" type="button" disabled={locked} onClick={()=>apply(null)} title={unknownLabel==='自适应'?'根据其他已知折角和纸面连接推算':'明确设为未知折角；需要计算姿态时再指定角度'}>{unknownLabel}</button>}
    {unavailable&&<small id={`${id}-unavailable`} className="fold-angle-unavailable">{unavailable}</small>}
    {error&&<small id={`${id}-error`} className="fold-angle-error" role="alert">{error}</small>}
  </div>;
}
