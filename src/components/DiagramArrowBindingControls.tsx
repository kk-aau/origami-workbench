import {useState} from 'react';
import './DiagramArrowBindingControls.css';
import type {DiagramPose} from '../app/diagramProject';
import type {DiagramSymbolAnnotation} from '../app/diagramAnnotations';
import {bindDiagramArrow,canBindDiagramArrow,diagramArrowBindingFaces,resolveDiagramArrowBinding} from '../app/diagramPaperBinding';

export function DiagramArrowBindingControls({pose,annotation,disabled,onChange,onMessage}:{pose:DiagramPose|null;annotation:DiagramSymbolAnnotation;disabled:boolean;onChange:(annotation:DiagramSymbolAnnotation)=>boolean;onMessage:(message:string)=>void}) {
  const [choice,setChoice]=useState<{id:string;face:number}|null>(null);
  if(!canBindDiagramArrow(annotation)&&!annotation.paperBinding)return null;
  const faces=diagramArrowBindingFaces(pose,annotation),binding=annotation.paperBinding,issue=resolveDiagramArrowBinding(pose,annotation).issue;
  const selected=choice?.id===annotation.id&&faces.includes(choice.face)?choice.face:binding&&faces.includes(binding.face)?binding.face:faces.length===1?faces[0]:'';
  function attach(){
    if(!pose||selected==='')return;
    try{if(onChange(bindDiagramArrow(pose,annotation,selected)))onMessage(`箭尾已绑定纸面 F${selected+1}，翻面、旋转和修形时会跟随。`);}
    catch(error){onMessage(error instanceof Error?error.message:String(error));}
  }
  function detach(){const {paperBinding:_binding,...free}=annotation;if(onChange(free))onMessage('已解除箭尾绑定，保留当前位置，可自由移动。');}
  return <div className="diagram-arrow-binding" aria-label="箭尾纸面绑定">
    <h4 className="diagram-field-caption">箭尾纸面绑定</h4>
    <p className="diagram-binding-status" role="status">{binding?`已绑定纸面 F${binding.face+1}`:'未绑定 · 箭尾可自由移动'}</p>
    {issue&&<p className="diagram-note" role="status">{issue}</p>}
    {faces.length>0&&<label className="diagram-text-field"><span>绑定纸面</span><select aria-label="箭尾绑定纸面" value={selected} disabled={disabled} onChange={event=>setChoice({id:annotation.id,face:Number(event.target.value)})}>
      <option value="" disabled>选择箭尾下的纸面</option>{faces.map(face=><option key={face} value={face}>纸面 F{face+1}</option>)}
    </select></label>}
    <div className="diagram-button-row"><button type="button" disabled={disabled||!pose||selected===''} onClick={attach}>{binding?'重新绑定':'绑定箭尾'}</button>{binding&&<button type="button" disabled={disabled} onClick={detach}>解除绑定</button>}</div>
    <p className="diagram-note">{!pose?'先计算或采用本步折图。':!faces.length?'把箭尾放在可见纸面内，再选择绑定。':faces.length>1?'箭尾下有多层纸，请按纸面编号选择。':'绑定后随纸面移动；箭身仍可调整。'}</p>
  </div>;
}
