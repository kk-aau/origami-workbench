import {useEffect,useId,useRef,useState} from 'react';
import type {DiagramAnnotation,DiagramLineAnimationTiming,DiagramLineAnnotation} from '../app/diagramAnnotations';
import {isDiagramAnimatedLine} from '../app/diagramAnimationTiming';
import './DiagramCreaseTimingControls.css';

interface Props {
  annotations:readonly DiagramAnnotation[];
  selectedIds:readonly string[];
  disabled?:boolean;
  onChange:(timing:DiagramLineAnimationTiming|undefined)=>void;
  onSelect:(id:string)=>void;
  /** The index counts active mountain/valley lines and starts at zero. */
  getLineLabel?:(line:DiagramLineAnnotation,index:number)=>string;
}
const foldLine=(annotation:DiagramAnnotation):annotation is DiagramLineAnnotation=>annotation.kind==='line'&&(annotation.style==='valley'||annotation.style==='mountain');
const activeLine=isDiagramAnimatedLine;
const defaultLineLabel=(line:DiagramLineAnnotation,index:number)=>`折痕 ${index+1} · ${line.style==='valley'?'谷折':'峰折'}${line.foldAction==='precrease'?'（预折）':''}`;
const timingKey=(line:DiagramLineAnnotation)=>line.animationTiming?`${line.animationTiming.afterLineId}:${line.animationTiming.startAfter}`:'together';

/** Check the proposed dependency before offering it. A multi-selection is one
 * edit: a reference may not lead back to any line in that target group. */
export function diagramCreaseTimingChoices(annotations:readonly DiagramAnnotation[],selectedIds:readonly string[],getLineLabel:Props['getLineLabel']=defaultLineLabel){
  const lines=annotations.filter(isDiagramAnimatedLine),byId=new Map(lines.map(line=>[line.id,line])),targets=new Set(selectedIds);
  return lines.flatMap((line,index)=>{
    if(targets.has(line.id))return [];
    const visited=new Set<string>();let cursor:DiagramLineAnnotation|undefined=line;
    while(cursor){
      if(targets.has(cursor.id)||visited.has(cursor.id))return [];
      visited.add(cursor.id);cursor=cursor.animationTiming?byId.get(cursor.animationTiming.afterLineId):undefined;
    }
    return [{line,label:getLineLabel(line,index)}];
  });
}

/** Per-crease timing lives alongside layer participation. Changing selection
 * only reads its saved values; differing multi-selection values stay mixed. */
export default function DiagramCreaseTimingControls({annotations,selectedIds,disabled=false,onChange,onSelect,getLineLabel=defaultLineLabel}:Props){
  const selected=new Set(selectedIds),targets=annotations.filter(foldLine).filter(line=>selected.has(line.id));
  const choices=diagramCreaseTimingChoices(annotations,selectedIds,getLineLabel),active=annotations.filter(isDiagramAnimatedLine);
  const allTimed=targets.length>0&&targets.every(line=>!!line.animationTiming),same=targets.every(line=>timingKey(line)===timingKey(targets[0]));
  const commonReference=allTimed&&targets.every(line=>line.animationTiming!.afterLineId===targets[0].animationTiming!.afterLineId)?targets[0].animationTiming!.afterLineId:'';
  const commonProgress=allTimed&&targets.every(line=>line.animationTiming!.startAfter===targets[0].animationTiming!.startAfter)?targets[0].animationTiming!.startAfter*100:undefined;
  const selectionKey=targets.map(line=>line.id).join('\u0000'),savedKey=targets.map(timingKey).join('\u0000');
  const [draftAfter,setDraftAfter]=useState(false),[progressText,setProgressText]=useState(commonProgress===undefined?'':String(Number(commonProgress.toFixed(6)))),[error,setError]=useState('');
  const skipCommit=useRef(false),id=useId();
  useEffect(()=>{setDraftAfter(false);setError('');},[selectionKey]);
  useEffect(()=>{setProgressText(commonProgress===undefined?'':String(Number(commonProgress.toFixed(6))));setError('');},[selectionKey,savedKey,commonProgress]);
  if(!targets.length)return null;
  const suspended=targets.some(line=>!activeLine(line)),readOnly=disabled||suspended,afterMode=draftAfter||allTimed,mode=afterMode?'after':same?'together':'mixed';
  const reference=choices.find(choice=>choice.line.id===commonReference),missingReference=!!commonReference&&!reference;
  const selectedIndex=targets.length===1?active.findIndex(line=>line.id===targets[0].id):-1;
  const selectedLabel=targets.length===1?getLineLabel(targets[0],selectedIndex<0?annotations.filter(foldLine).findIndex(line=>line.id===targets[0].id):selectedIndex):`已选 ${targets.length} 条折痕`;
  const chooseReference=(afterLineId:string)=>{
    if(readOnly||!choices.some(choice=>choice.line.id===afterLineId))return;
    onChange({afterLineId,startAfter:(commonProgress??80)/100});
  };
  const commitProgress=()=>{
    if(skipCommit.current){skipCommit.current=false;return;}
    if(readOnly||!reference)return;
    const value=Number(progressText);
    if(!progressText.trim()||!Number.isFinite(value)||value<0||value>100){setError('请输入 0 到 100 之间的进度。');return;}
    setError('');if(commonProgress!==value)onChange({afterLineId:reference.line.id,startAfter:value/100});
  };
  return <section className="diagram-crease-timing" data-diagram-crease-timing="true" aria-labelledby={`${id}-heading`}>
    <header><strong id={`${id}-heading`}>动画启动</strong><span title={selectedLabel}>{selectedLabel}</span></header>
    <fieldset disabled={readOnly}>
      <label className="diagram-crease-timing-field"><span>开始方式</span><select aria-label="折痕动画开始方式" value={mode} onChange={event=>{
        setError('');if(event.currentTarget.value==='together'){setDraftAfter(false);onChange(undefined);}else setDraftAfter(true);
      }}>
        {mode==='mixed'&&<option value="mixed" disabled>所选折痕设置不同</option>}
        <option value="together">同时开始</option><option value="after">按折痕进度开始</option>
      </select></label>
      {afterMode&&<>
        <label className="diagram-crease-timing-field"><span>参考折痕</span><select aria-label="动画启动参考折痕" value={commonReference} onChange={event=>chooseReference(event.currentTarget.value)}>
          <option value="" disabled>{choices.length?'选择参考折痕':'没有可用参考折痕'}</option>
          {missingReference&&<option value={commonReference} disabled>原参考折痕不可用</option>}
          {choices.map(choice=><option key={choice.line.id} value={choice.line.id}>{choice.label}</option>)}
        </select></label>
        <div className="diagram-crease-timing-progress"><label htmlFor={`${id}-progress`}>参考折痕完成</label><div><input id={`${id}-progress`} aria-label="参考折痕完成百分比" aria-invalid={!!error} aria-describedby={`${id}-help${error?` ${id}-error`:''}`} type="number" inputMode="decimal" min={0} max={100} step="any" placeholder={commonReference&&commonProgress===undefined?'不同':'80'} value={progressText} disabled={!reference} onChange={event=>{setProgressText(event.currentTarget.value);setError('');}} onBlur={commitProgress} onKeyDown={event=>{
          if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}
          if(event.key==='Escape'){event.preventDefault();skipCommit.current=true;setProgressText(commonProgress===undefined?'':String(Number(commonProgress.toFixed(6))));setError('');event.currentTarget.blur();}
        }}/><span aria-hidden="true">%</span><span>时开始</span></div></div>
        {reference&&<button type="button" className="diagram-crease-timing-locate" onClick={()=>onSelect(reference.line.id)} aria-label={`定位参考${reference.label}`}>定位参考折痕</button>}
      </>}
    </fieldset>
    {error&&<p id={`${id}-error`} className="diagram-crease-timing-error" role="alert">{error}</p>}
    {suspended?<p id={`${id}-help`} className="diagram-crease-timing-help">所选折痕尚未参与折叠，请先选择作用纸层。</p>:<>
      {!same&&<p className="diagram-crease-timing-help">所选折痕的启动条件不同；修改后统一应用到所选折痕。</p>}
      {afterMode&&<p id={`${id}-help`} className="diagram-crease-timing-help">{!choices.length?'没有可用参考折痕：需要另一条参与折叠且不会形成循环等待的折痕。':missingReference?'原参考折痕已删除、停止参与或会形成循环等待，请重新选择。':!reference?'先选择参考折痕，再设置开始进度。':'例如设为 80%，参考折痕完成八成后，本折痕才开始。'}{reference?.line.foldAction==='precrease'?'预折进度包含折起与展开的完整动作。':''}</p>}
    </>}
  </section>;
}
