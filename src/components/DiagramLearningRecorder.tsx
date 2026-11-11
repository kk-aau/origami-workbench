import {useRef,useState} from 'react';
import type {LearningDesign} from '../app/diagramLearningDesign';
import './DiagramLearningRecorder.css';

export default function DiagramLearningRecorder({design,selected,onSelect,onChange,recording,actionCount,onStart,onCommit,onCancel,onLoad,onAdvanced,onPreview,onExport,onExit,error}:{design:LearningDesign;selected:string|null;onSelect:(id:string|null)=>void;onChange:(d:LearningDesign)=>void;recording:boolean;actionCount:number;onStart:()=>void;onCommit:(message:string)=>boolean;onCancel:()=>void;onLoad:(scene:string)=>void;onAdvanced:()=>void;onPreview:()=>void;onExport:()=>void;onExit:()=>void;error:string}){
 const [draft,setDraft]=useState(''),[collapsed,setCollapsed]=useState(false),[offset,setOffset]=useState({x:0,y:0}),drag=useRef<{x:number;y:number;ox:number;oy:number;id:number}|null>(null);
 const task=design.tasks.find(t=>t.id===selected),tasks=design.tasks.filter(t=>t.message.trim()||t.demo),message=recording||!task?draft:task.message;
 const updateText=(text:string)=>{if(recording||!task)setDraft(text);else onChange({...design,tasks:design.tasks.map(t=>t.id===task.id?{...t,message:text,title:text.slice(0,24)}:t)});};
 return <aside className={'learning-recorder'+(collapsed?' is-collapsed':'')} aria-label="录制教学" style={{transform:`translate(${offset.x}px,${offset.y}px)`}}>
  <header onPointerDown={e=>{if(e.button!==0||(e.target as Element).closest('button,input'))return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,ox:offset.x,oy:offset.y,id:e.pointerId};}} onPointerMove={e=>{const d=drag.current;if(d?.id===e.pointerId)setOffset({x:Math.max(-innerWidth*.7,Math.min(0,d.ox+e.clientX-d.x)),y:Math.max(-80,Math.min(innerHeight-230,d.oy+e.clientY-d.y))});}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}><strong>{recording?'正在记录操作':'录制教学'}</strong><button aria-label={collapsed?'展开录制面板':'收起录制面板'} onClick={()=>setCollapsed(v=>!v)}>{collapsed?'展开':'收起'}</button></header>
  {!collapsed&&<><div className="learning-recorder-body">
   <label className="learning-recorder-name">教学名称<input value={design.title} onChange={e=>onChange({...design,title:e.target.value})}/></label>
   <p className="learning-recorder-instruction">{recording?'像平时一样在画布操作，完成后记为一步。':task?'可直接修改这一步的说明，也可以回到起点重新示范。':'先点开始，在画布示范，再写一句说明。'}</p>
   <label>{task&&!recording?'这一步的说明':'给学生的一句话'}<textarea rows={3} value={message} placeholder="例如：固定这张纸面，再进入下一步比较结果" onChange={e=>updateText(e.target.value)}/></label>
   {recording&&<p className="learning-recorder-status" role="status">已记录 {actionCount} 次点击 · 录制不会遮挡或限制画布操作</p>}
   <div className="learning-recorder-primary">{recording?<><button className="diagram-primary" onClick={()=>{if(onCommit(draft)){setDraft('');onSelect(null);}}}>记为一步</button><button onClick={onCancel}>取消本次录制</button></>:<><button className="diagram-primary" onClick={()=>{setDraft(task?.message??draft);onStart();}}>{task?'重新录制这一步':'开始录制这一步'}</button>{task&&<button onClick={()=>{onSelect(null);setDraft('');}}>录制下一步</button>}</>}</div>
   {error&&<p className="learning-recorder-error" role="alert">{error}</p>}
   {!recording&&<details className="learning-recorder-steps"><summary>已录 {tasks.length} 步 · 点击可修改说明</summary><ol>{tasks.map((t,i)=><li key={t.id}><button aria-current={task?.id===t.id?'step':undefined} onClick={()=>onSelect(t.id)}><span>{i+1}</span>{t.message||t.title}</button></li>)}</ol>{task?.scene&&<button onClick={()=>onLoad(task.scene!)}>回到这一步起点</button>}</details>}
  </div><footer><button disabled={recording} onClick={onPreview}>预览</button><button disabled={recording} onClick={onExport}>导出</button><details><summary>更多</summary><div><button disabled={recording} onClick={onAdvanced}>高级编辑</button><button disabled={recording} onClick={()=>onLoad(design.initial)}>回到教学起点</button><button onClick={onExit}>结束设计</button></div></details></footer></>}
 </aside>;
}
