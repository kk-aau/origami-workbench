import {useEffect,useMemo,useRef,useState} from 'react';
import AppDialog from './AppDialog';
import {exportDiagramProject,importDiagramProject,type DiagramProject} from '../app/diagramProject';
import {newLearningDesignTask,type LearningDesign,type LearningDesignTask,type LearningDesignGuide,type LearningDesignRule} from '../app/diagramLearningDesign';
import type {LearningObservation} from '../app/diagramLearning';
import {selectProjectFile} from '../app/selectProjectFile';
import './DiagramLearningDesigner.css';

export type LearningDesignPick='control'|'point'|'line';
export default function DiagramLearningDesigner({design,selected,onSelect,project,observation,onChange,onPick,onLoadScene,onResume,onPreview,onExport,onClose,error}:{design:LearningDesign;selected:string|null;onSelect:(id:string)=>void;project:()=>DiagramProject;observation:LearningObservation;onChange:(d:LearningDesign)=>void;onPick:(id:string,kind:LearningDesignPick)=>void;onLoadScene:(scene:string)=>void;onResume:()=>void;onPreview:()=>void;onExport:()=>void;onClose:()=>void;error:string}){
 const [notice,setNotice]=useState('');const fileInput=useRef<HTMLInputElement>(null);
 const initialStepCount=useMemo(()=>importDiagramProject(design.initial).steps.length,[design.initial]);
 const task=design.tasks.find(t=>t.id===selected)??design.tasks[0],index=design.tasks.indexOf(task);
 useEffect(()=>{setNotice('');},[task.id]);
 const edit=(patch:Partial<LearningDesignTask>)=>onChange({...design,tasks:design.tasks.map(t=>t.id===task.id?{...t,...patch,...(patch.guide?{route:undefined}:{})}:t)});
 const safe=(fn:()=>void)=>{try{fn();}catch(e){setNotice(e instanceof Error?e.message:String(e));}};
 const recordScene=()=>safe(()=>{edit({scene:exportDiagramProject(project())});setNotice('已记录本环节的起始画面。预览到这里时会载入此画面。');});
 const recordRule=()=>safe(()=>{const s=project().steps.find(s=>s.id===project().activeStepId)!;
  if(task.rule.kind==='fixed'){if(!s.foldLink?.fixed)throw Error('请先返回画布，实际选择要固定的纸面，再回来记录。');edit({rule:{kind:'fixed',expected:structuredClone(s.foldLink.fixed)}});}
  if(task.rule.kind==='scope'){if(observation.selectedLineCount)throw Error('请先按 Esc 取消已有折线选择，再记录后续画线的纸层范围。');if(!s.foldLink)throw Error('当前步骤没有纸层范围设置。');edit({rule:{kind:'scope',expected:{layers:s.foldLink.layers,faces:[...s.foldLink.selectedFaces]}}});}
  setNotice('已记录实际设置作为完成条件。');
 });
 const cpFace=()=>safe(()=>{const pick=observation.cpSelection,p=project(),s=p.steps.find(s=>s.id===p.activeStepId)!;
  if(!pick||pick.kind!=='face')throw Error('请返回画布，在操作前或操作后 CP 中点击所需纸面，再回来记录。');
  if(pick.stateId!==s.beforeId&&pick.stateId!==s.afterId)throw Error('请在当前步骤的 CP 中重新选择纸面。');
  edit({guide:{kind:'cp-face',phase:pick.stateId===s.beforeId?'before':'after',face:pick.index}});setNotice('已记录 CP 中所选纸面，指引会随 CP 缩放和平移。');
 });
 const readInitial=async(file:File)=>{try{const initial=exportDiagramProject(importDiagramProject(await file.text()));onChange({...design,initial});setNotice('已导入起始工程；返回画布后可重新载入进行设计。');}catch(e){setNotice(e instanceof Error?e.message:String(e));}};
 const guideText=(g:LearningDesignGuide)=>g.kind==='none'?'不显示蒙版，仅显示文字':g.kind==='control'?`界面控件：${g.control.value}`:g.kind==='cp-face'?`${g.phase==='before'?'操作前':'操作后'} CP · F${g.face+1}`:g.kind==='point'?`画布点 (${g.point.map(n=>n.toFixed(1)).join(', ')})`:`画线：${g.points.map(p=>`(${p.map(n=>n.toFixed(1)).join(', ')})`).join(' → ')}`;
 const ruleKind=(kind:LearningDesignRule['kind'])=>edit({rule:kind==='question'?{kind,answers:['选项一','选项二'],correct:0}:kind==='scope'?{kind}:kind==='fixed'?{kind}:{kind}});
 const move=(direction:number)=>{const tasks=[...design.tasks],target=index+direction;if(target<0||target>=tasks.length)return;[tasks[index],tasks[target]]=[tasks[target],tasks[index]];onChange({...design,tasks});};
 return <AppDialog title="教学设计 · 高级编辑" size="workspace" className="learning-designer" onClose={onResume} footer={<><span role="status">{error||notice||'修改保存在本机。导出教学方案后，可交给开发者接入。'}</span><button onClick={onClose}>结束设计</button><button onClick={onExport}>导出教学方案</button><button className="diagram-primary" onClick={onPreview}>从头预览</button></>}>
  <div className="learning-design-heading"><label>教学名称<input value={design.title} onChange={e=>onChange({...design,title:e.target.value})}/></label><label>教学简介<input value={design.description} onChange={e=>onChange({...design,description:e.target.value})}/></label><button onClick={onResume}>返回画布操作</button></div>
  <details className="learning-design-start"><summary>整个教学的起始工程 · 已包含 {initialStepCount} 个折序步骤</summary><p>在隔离的设计画布中准备教材，再记录起始工程。可为每个环节单独记录画面，比较同一个 CP 固定不同纸面的结果。</p><div><button onClick={()=>safe(()=>{onChange({...design,initial:exportDiagramProject(project())});setNotice('已将当前设计画布记录为教学起始工程。');})}>用当前画布作为起始工程</button><button onClick={()=>void selectProjectFile(fileInput.current,'diagram').then(f=>f&&readInitial(f)).catch(e=>setNotice(String(e)))}>导入折序工程</button></div><input ref={fileInput} hidden type="file" accept=".json" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void readInitial(f);}}/></details>
  <div className="learning-design-layout"><nav aria-label="教学环节"><ol>{design.tasks.map((t,i)=><li key={t.id}><button aria-current={task.id===t.id?'step':undefined} onClick={()=>{onSelect(t.id);setNotice('');}}><span>{i+1}</span>{t.title||'未命名环节'}</button></li>)}</ol><button onClick={()=>{const t=newLearningDesignTask();onChange({...design,tasks:[...design.tasks,t]});onSelect(t.id);}}>＋ 添加环节</button></nav>
  <section className="learning-design-fields" aria-label="编辑教学环节"><div className="learning-design-step-heading"><strong>环节 {index+1}</strong><button disabled={index===0} onClick={()=>move(-1)}>上移</button><button disabled={index===design.tasks.length-1} onClick={()=>move(1)}>下移</button><button disabled={design.tasks.length===1} onClick={()=>{onChange({...design,tasks:design.tasks.filter(t=>t.id!==task.id)});onSelect(design.tasks[index?index-1:1].id);}}>删除本环节</button></div>
   <label>环节名称<input value={task.title} onChange={e=>edit({title:e.target.value})}/></label>
   <label>对用户说的话<textarea rows={3} value={task.message} placeholder="由你说明要做什么，以及为什么这样做" onChange={e=>edit({message:e.target.value})}/></label>
   <label>补充提示<textarea rows={2} value={task.hint} onChange={e=>edit({hint:e.target.value})}/></label>
   {!!task.route?.length&&<p>已自动记录 {task.route.length} 个操作位置。<button onClick={()=>edit({route:undefined})}>改用手动指引</button></p>}
   <fieldset><legend>本环节的起始画面</legend><p>{task.scene?'进入本环节时，载入你记录的画面。':'沿用上一环节的操作结果；首环节使用教学起始工程。'}</p><button onClick={recordScene}>记录当前画面</button>{task.scene&&<><button onClick={()=>onLoadScene(task.scene!)}>载入本环节画面继续设计</button><button onClick={()=>edit({scene:undefined})}>改为沿用上一环节</button></>}</fieldset>
   <fieldset><legend>画布与界面指引</legend><p>{guideText(task.guide)}</p><div className="learning-design-actions"><button onClick={()=>onPick(task.id,'control')}>从界面选取控件</button><button onClick={()=>onPick(task.id,'point')}>在画布选一个点</button><button onClick={()=>onPick(task.id,'line')}>在画布选折线两端</button><button onClick={cpFace}>记录 CP 所选纸面</button><button onClick={()=>edit({guide:{kind:'none'}})}>仅文字</button></div><small>选取不会执行操作。CP 纸面请先在真实画布中选好，再回来记录。</small></fieldset>
   <label>什么时候完成本环节<select value={task.rule.kind} onChange={e=>ruleKind(e.target.value as LearningDesignRule['kind'])}><option value="manual">用户点“我已完成”（观察、比较或自由操作）</option><option value="click">点击指引的控件、画布点或 CP 纸面</option><option value="line">在指定两端之间实际画出新线段</option><option value="next">进入后续步骤并完成折图计算</option><option value="fixed">固定设置与我记录的设置相同</option><option value="scope">后续画线的纸层范围与我记录的相同</option><option value="question">回答我设计的问题</option></select></label>
   {(task.rule.kind==='fixed'||task.rule.kind==='scope')&&<div className="learning-design-record"><button onClick={recordRule}>记录当前{task.rule.kind==='fixed'?'固定设置':'纸层范围'}</button><span>{task.rule.expected?'已有记录；可返回画布调整后重新记录。':'尚未记录。请先在画布中完成示范操作。'}</span></div>}
   {task.rule.kind==='question'&&<fieldset><legend>问答选项 · 勾选正确答案</legend>{task.rule.answers.map((answer,i)=><div className="learning-design-answer" key={i}><input type="radio" name="learning-design-answer" aria-label={`选项 ${i+1} 为正确答案`} checked={task.rule.kind==='question'&&task.rule.correct===i} onChange={()=>{if(task.rule.kind==='question')edit({rule:{...task.rule,correct:i}});}}/><input aria-label={`选项 ${i+1}`} value={answer} onChange={e=>{if(task.rule.kind==='question')edit({rule:{...task.rule,answers:task.rule.answers.map((a,j)=>i===j?e.target.value:a)}});}}/><button disabled={task.rule.kind!=='question'||task.rule.answers.length<=2} onClick={()=>{if(task.rule.kind==='question')edit({rule:{...task.rule,answers:task.rule.answers.filter((_,j)=>j!==i),correct:task.rule.correct===i?0:task.rule.correct>i?task.rule.correct-1:task.rule.correct}});}}>删除选项</button></div>)}<button onClick={()=>{if(task.rule.kind==='question')edit({rule:{...task.rule,answers:[...task.rule.answers,'新选项']}});}}>添加选项</button></fieldset>}
   {task.rule.kind==='line'&&task.guide.kind!=='line'&&<p role="alert">请先选择“在画布选折线两端”。</p>}
   {task.rule.kind==='click'&&['none','line'].includes(task.guide.kind)&&<p role="alert">请选择一个控件、画布点或 CP 纸面作为点击目标。</p>}
  </section></div>
 </AppDialog>;
}
