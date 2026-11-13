import {forwardRef,useCallback,useEffect,useImperativeHandle,useMemo,useRef,useState,type ComponentType,type RefAttributes} from 'react';
import type {DiagramWorkspaceProps,DiagramWorkspaceHandle} from './DiagramWorkspace';
import {importDiagramProject,type DiagramProject} from '../app/diagramProject';
import {compileLearningDesign,exportLearningDesign,importLearningDesign,learningDesignIssues,loadLearningDesigns,newLearningDesign,saveLearningDesigns,type LearningDesign,type LearningDesignGuide} from '../app/diagramLearningDesign';
import {learningControlFromElement,matchesLearningGuide} from '../app/learningDesignDom';
import {recordedLearningTask,type LearningRecordedAction} from '../app/diagramLearningRecording';
import {saveDownload,safeName} from '../app/api';
import {selectProjectFile} from '../app/selectProjectFile';
import {DIAGRAM_LESSONS,createLearningProject,loadLearningProgress,saveLearningProgress,learningBottomFace,type LearningProgress,type LearningObservation} from '../app/diagramLearning';
import AppDialog from './AppDialog';
import DiagramLearningSpotlight from './DiagramLearningSpotlight';
import DiagramLearningDesigner,{type LearningDesignPick} from './DiagramLearningDesigner';
import DiagramLearningDesignPicker from './DiagramLearningDesignPicker';
import DiagramLearningRecorder from './DiagramLearningRecorder';
import './DiagramLearning.css';

type Props=DiagramWorkspaceProps&{Editor:ComponentType<DiagramWorkspaceProps&RefAttributes<DiagramWorkspaceHandle>>};
export default forwardRef<DiagramWorkspaceHandle,Props>(function DiagramLearningHost({Editor,...props},ref){
 const main=useRef<DiagramWorkspaceHandle>(null),practice=useRef<DiagramWorkspaceHandle>(null),host=useRef<HTMLDivElement>(null),recoveryError=useRef('');
 const [designs,setDesigns]=useState<LearningDesign[]>(()=>{try{return loadLearningDesigns();}catch{recoveryError.current='本机教学方案无法读取，请从导出的教学文件恢复。';return [];}}),designsRef=useRef(designs);designsRef.current=designs;
 const lessons=useMemo(()=>[...DIAGRAM_LESSONS,...designs.map(compileLearningDesign)],[designs]);
 const [catalog,setCatalog]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState<Record<string,LearningProgress>>(()=>{try{return loadLearningProgress(lessons);}catch{recoveryError.current='上次教学进度无法读取。原工程未受影响，可以重新开始练习。';return {};}});
 useEffect(()=>{if(recoveryError.current)setError(recoveryError.current);},[]);
 const [session,setSession]=useState<{lesson:string;initial:DiagramProject;token:number;authoring?:boolean;preview?:boolean}|null>(null),sessionRef=useRef(session);sessionRef.current=session;
 const [authorId,setAuthorId]=useState<string|null>(null),[designerOpen,setDesignerOpen]=useState(false),[picking,setPicking]=useState<{id:string;kind:LearningDesignPick}|null>(null),authorProject=useRef<DiagramProject|null>(null),importInput=useRef<HTMLInputElement>(null);
 const authorDesign=designs.find(d=>d.id===authorId);
 const [authorTask,setAuthorTask]=useState<string|null>(null);
 const recordingBuffer=useRef<{before:DiagramProject;actions:LearningRecordedAction[];replaceId:string|null}|null>(null),[recording,setRecording]=useState(false),[recordCount,setRecordCount]=useState(0),[routeIndex,setRouteIndex]=useState(0);
 const [manualReady,setManualReady]=useState(false);
 const [observation,setObservation]=useState<LearningObservation>({comparison:false,editCP:null,tool:'select',selectedLineCount:0,side:'front'});
 const [hint,setHint]=useState(0),[answer,setAnswer]=useState<number|null>(null),[collapsed,setCollapsed]=useState(false),[offset,setOffset]=useState({x:0,y:0});
 const [guideEnabled,setGuideEnabled]=useState(true),[guideStage,setGuideStage]=useState('');
 const offsetRef=useRef(offset);offsetRef.current=offset;
 const avoidGuide=useCallback((target:{x:number;y:number;width:number;height:number})=>{
  const root=host.current,card=root?.querySelector('.diagram-learning-card');if(!root||!card)return;
  const r=card.getBoundingClientRect(),bounds=root.getBoundingClientRect(),gap=22;
  const overlaps=(x:number,y:number)=>x<target.x+target.width+gap&&x+r.width>target.x-gap&&y<target.y+target.height+gap&&y+r.height>target.y-gap;
  if(!overlaps(r.x,r.y))return;
  const top=Math.max(bounds.top+80,Math.min(r.y,bounds.bottom-r.height-12));
  const positions=[[bounds.left+16,top],[bounds.right-r.width-16,top],[r.x,target.y+target.height+gap],[r.x,target.y-r.height-gap]];
  const next=positions.find(([x,y])=>x>=bounds.left+8&&x+r.width<=bounds.right-8&&y>=bounds.top+12&&y+r.height<=bounds.bottom-8&&!overlaps(x,y));
  if(next)setOffset({x:offsetRef.current.x+next[0]-r.x,y:offsetRef.current.y+next[1]-r.y});
 },[]);
 const drag=useRef<{id:number;x:number;y:number;ox:number;oy:number}|null>(null),progressRef=useRef(progress);progressRef.current=progress;
 const lesson=lessons.find(l=>l.id===session?.lesson),entry=lesson?progress[lesson.id]:undefined,task=lesson&&entry?lesson.tasks[entry.task]:undefined;
 const route=task?.design?.route,routeFinished=!route?.length||routeIndex>=route.length;
 const guidedTask=useMemo(()=>task?.design&&route?.length?{...task,design:{...task.design,guide:route[routeIndex]??{kind:'none' as const}}}:task,[task,route,routeIndex]);
 const titleChanged=lesson?.id!=='symbols'||task?.id!=='title'||entry?.project.steps[0].title!==entry?.baseline?.steps[0].title;
 const ready=!!task&&!!entry&&titleChanged&&routeFinished&&(task.question?answer===task.question.correct:manualReady||(task.check?.(entry.project,observation,entry.baseline)??false));
 const persist=useCallback((next:Record<string,LearningProgress>)=>{progressRef.current=next;setProgress(next);try{saveLearningProgress(next);setError('');}catch{setError('教学进度未能保存到本机。请先导出练习备份，勿直接关闭应用。');}},[]);
 const observe=useCallback((project:DiagramProject,value:LearningObservation)=>{
  const s=sessionRef.current;if(!s)return;
  setObservation(old=>JSON.stringify(old)===JSON.stringify(value)?old:value);
  if(s.authoring){authorProject.current=project;return;}
  const current=progressRef.current[s.lesson];if(current&&current.project!==project)persist({...progressRef.current,[s.lesson]:{...current,project}});
 },[persist]);
 useEffect(()=>{
  if(!session)return;const timer=window.setTimeout(()=>{try{saveLearningProgress(progressRef.current);}catch{setError('教学进度未保存，请导出练习备份。');}},500);
  return()=>clearTimeout(timer);
 },[session,progress]);
 useEffect(()=>{setHint(0);setAnswer(null);setManualReady(false);setRouteIndex(0);},[task?.id,session?.token]);
 const returnToAuthor=()=>{if(!authorDesign||!authorProject.current)return;setSession({lesson:authorDesign.id,initial:authorProject.current,token:Date.now(),authoring:true});setDesignerOpen(false);setCollapsed(false);};
 const exit=()=>{practice.current?.checkpoint();recordingBuffer.current=null;setRecording(false);if(session?.preview&&authorId){returnToAuthor();return;}setSession(null);setCatalog(false);setCollapsed(false);setAuthorId(null);setDesignerOpen(false);setPicking(null);};
 const begin=(id:string,restart=false)=>{
  const l=lessons.find(l=>l.id===id);if(!l||l.withdrawn)return;
  try{const design=designsRef.current.find(d=>d.id===id);if(design){const issues=learningDesignIssues(design);if(issues.length)throw Error(issues.join('\n'));}const previous=progressRef.current[id],saved=restart||(previous?.revision??1)!==(l.revision??1)?undefined:previous,p=saved??{task:0,completed:[],skipped:[],project:design?importDiagramProject(design.tasks[0]?.scene??design.initial):createLearningProject(l),revision:l.revision??1};p.baseline??=p.project;persist({...progressRef.current,[id]:p});setSession({lesson:id,initial:p.project,token:Date.now(),preview:authorId===id});setCatalog(false);setDesignerOpen(false);setCollapsed(false);setOffset({x:0,y:0});}catch(e){setError(e instanceof Error?e.message:'无法建立练习。');}
 };
 const advance=(skip=false)=>{if(!lesson||!entry||!task||!skip&&!ready)return;
  try{const scene=lesson.tasks[entry.task+1]?.design?.scene,project=scene?importDiagramProject(scene):entry.project;persist({...progressRef.current,[lesson.id]:{...entry,task:entry.task+1,project,baseline:project,completed:skip?entry.completed:[...new Set([...entry.completed,task.id])],skipped:skip?[...new Set([...entry.skipped,task.id])]:entry.skipped}});if(scene&&session)setSession({...session,initial:project,token:Date.now()});}catch(e){setError(String(e));}
 };
 const storeDesign=(design:LearningDesign)=>{
  const previous=designsRef.current.find(d=>d.id===design.id),nextDesign={...design,revision:previous?previous.revision+1:design.revision},next=previous?designsRef.current.map(d=>d.id===design.id?nextDesign:d):[...designsRef.current,nextDesign];
  designsRef.current=next;setDesigns(next);try{saveLearningDesigns(next);setError('');}catch{setError('教学方案未能保存到本机，请先导出教学方案，勿直接关闭。');}
 };
 const startAuthor=(design?:LearningDesign)=>{
  try{const d=design??newLearningDesign(main.current?.capture({deferValidation:true})??undefined),initial=importDiagramProject(d.initial);if(!design)storeDesign(d);authorProject.current=initial;setAuthorId(d.id);setAuthorTask(null);recordingBuffer.current=null;setRecording(false);setRecordCount(0);setSession({lesson:d.id,initial,token:Date.now(),authoring:true});setCatalog(false);setDesignerOpen(false);}catch(e){setError(String(e));}
 };
 const captureAuthor=()=>{const p=practice.current?.capture({deferValidation:true})??authorProject.current;if(!p)throw Error('教学设计画布尚未就绪。');return p;};
 const startRecording=()=>{try{const previous=authorDesign?.tasks.find(t=>t.id===authorTask),before=previous?.scene?importDiagramProject(previous.scene):structuredClone(captureAuthor());
  if(previous?.scene&&session){authorProject.current=before;setSession({...session,initial:before,token:Date.now()});}
  recordingBuffer.current={before:structuredClone(before),actions:[],replaceId:authorTask};setRecordCount(0);setRecording(true);setError('');
 }catch(e){setError(String(e));}};
 const finishRecording=(message:string)=>{try{const buffer=recordingBuffer.current;if(!buffer||!authorDesign)return false;
  const task=recordedLearningTask(buffer.before,captureAuthor(),buffer.actions,message,observation),placeholder=authorDesign.tasks.length===1&&!authorDesign.tasks[0].message.trim()&&!authorDesign.tasks[0].demo;
  const tasks=buffer.replaceId?authorDesign.tasks.map(t=>t.id===buffer.replaceId?{...task,id:t.id}:t):placeholder?[task]:[...authorDesign.tasks,task];
  storeDesign({...authorDesign,tasks});recordingBuffer.current=null;setRecording(false);setRecordCount(0);setAuthorTask(null);return true;
 }catch(e){setError(e instanceof Error?e.message:String(e));return false;}};
 const pushAction=(action:LearningRecordedAction)=>{const buffer=recordingBuffer.current;if(!buffer)return;buffer.actions.push(action);setRecordCount(buffer.actions.length);};
 const loadAuthorScene=(scene:string)=>{if(!session)return;try{authorProject.current=importDiagramProject(scene);setSession({...session,initial:authorProject.current,token:Date.now()});setDesignerOpen(false);}catch(e){setError(String(e));}};
 const exportDesign=async(d:LearningDesign)=>{try{const result=await saveDownload(new Blob([exportLearningDesign(d)],{type:'application/json'}),safeName(d.title)+'.learning.json');if(result.status!=='cancelled')props.onMessage('教学方案已导出，包含起始工程、环节、指引位置和完成条件。');}catch(e){setError(String(e));}};
 const readDesign=async(file:File)=>{try{const parsed=importLearningDesign(await file.text()),design={...parsed,id:'custom-'+crypto.randomUUID(),revision:1};storeDesign(design);props.onMessage('教学方案已导入，可编辑或从头预览。');}catch(e){setError(e instanceof Error?e.message:String(e));}};
 const pickDone=useCallback((guide:LearningDesignGuide)=>{const pending=picking,d=designsRef.current.find(d=>d.id===sessionRef.current?.lesson);if(pending&&d)storeDesign({...d,tasks:d.tasks.map(t=>t.id===pending.id?{...t,guide,route:undefined}:t)});setPicking(null);setDesignerOpen(true);},[picking]);
 const pickCancel=useCallback(()=>{setPicking(null);setDesignerOpen(true);},[]);
 const trackDesignClick=(event:React.MouseEvent<HTMLDivElement>)=>{
  const root=host.current?.querySelector('[data-learning-editor]');if(!root||!(event.target instanceof Element)||!root.contains(event.target))return;
  if(session?.authoring){
   if(!recordingBuffer.current)return;const control=learningControlFromElement(root,event.target);
   if(control){const el=event.target.closest('button,input,textarea,select')!;pushAction({guide:{kind:'control',control},label:el.getAttribute('aria-label')||el.textContent?.trim()||'点击输入框'});return;}
   const face=event.target.closest('[data-cp-face]'),card=face?.closest('section[data-teach]'),phase=card?.getAttribute('data-teach');
   if(face&&(phase==='cp-before'||phase==='cp-after'))pushAction({guide:{kind:'cp-face',phase:phase==='cp-before'?'before':'after',face:Number(face.getAttribute('data-cp-face'))},label:'选择 CP 纸面 F'+(Number(face.getAttribute('data-cp-face'))+1)});
   return;
  }
  const g=guidedTask?.design?.guide;if(!task?.design||!g||route?.length&&g.kind==='point')return;
  if(matchesLearningGuide(root,g,event,observation.tool)){if(route?.length){setRouteIndex(i=>i+1);if(routeIndex===route.length-1&&task.design.rule.kind==='click')setManualReady(true);}else if(task.design.rule.kind==='click')setManualReady(true);}
 };
 const trackDesignPointer=(event:React.PointerEvent<HTMLDivElement>)=>{
  if(event.button!==0)return;const root=host.current?.querySelector('[data-learning-editor]');if(!root||!(event.target instanceof Element)||!root.contains(event.target))return;
  const svg=event.target.closest('svg[data-diagram-model]'),matrix=svg?.querySelector<SVGGElement>('[data-diagram-viewport-scene]')?.getScreenCTM();if(!matrix||svg?.getAttribute('data-diagram-disabled')==='true')return;
  if(session?.authoring&&recordingBuffer.current){const q=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());pushAction({guide:{kind:'point',point:[q.x,q.y],tool:observation.tool},label:observation.tool==='line'?'点击折线端点':observation.tool==='fixed'?'选择固定侧':'点击纸面'});}
  else if(route?.length&&guidedTask?.design?.guide.kind==='point'&&matchesLearningGuide(root,guidedTask.design.guide,event,observation.tool)){setRouteIndex(i=>i+1);if(routeIndex===route.length-1&&task?.design?.rule.kind==='click')setManualReady(true);}
 };
 useImperativeHandle(ref,()=>({currentCP:()=>(sessionRef.current?practice:main).current?.currentCP()??null,applyReturnedCP:(target,doc)=>{if(!main.current)throw Error('折序编辑器尚未就绪。');main.current.applyReturnedCP(target,doc);},newDrawing:()=>main.current?.newDrawing(),startFile:async(file)=>{await main.current?.startFile(file);},save:async()=>{await(sessionRef.current?practice:main).current?.save();},open:()=>{if(sessionRef.current){setError('先退出教学，再打开外部工程。');return;}main.current?.open();},export:()=>{(sessionRef.current?practice:main).current?.export();},print:()=>{(sessionRef.current?practice:main).current?.print();},library:async()=>{if(sessionRef.current)exit();else await main.current?.library();},enter:()=>{if(!sessionRef.current)main.current?.enter();},storageChanged:()=>main.current?.storageChanged(),capture:options=>main.current?.capture(options)??null,restore:(p,options)=>main.current?.restore(p,options)??Promise.resolve(false),undo:()=>{(sessionRef.current?practice:main).current?.undo();},redo:()=>{(sessionRef.current?practice:main).current?.redo();},status:()=>{const primary=main.current?.status(),learning=sessionRef.current?practice.current?.status():undefined;return {name:learning?.name??primary?.name??null,present:!!primary?.present||!!learning?.present,dirty:!!primary?.dirty||!!learning?.dirty,busy:!!primary?.busy||!!learning?.busy};},checkpoint:async()=>{if(sessionRef.current)await practice.current?.checkpoint();return await main.current?.checkpoint()??true;}}));
 const scopeError=lesson?.id==='layers'&&task?.id==='scoped-line'&&entry?.project.steps[0].annotations?.some(a=>a.kind==='line'&&a.style==='valley'&&!(a.foldFaces?.length===1&&a.foldFaces[0]===learningBottomFace(entry.project)));
 useEffect(()=>{
  if(!scopeError||!entry)return;const nodes:Element[]=[];
  for(const a of entry.project.steps[0].annotations??[])if(a.kind==='line'&&a.style==='valley'&&!(a.foldFaces?.length===1&&a.foldFaces[0]===learningBottomFace(entry.project))){const node=host.current?.querySelector(`[data-learning-editor] [data-diagram-annotation="${CSS.escape(a.id)}"]`);if(node){node.classList.add('learning-wrong-line');nodes.push(node);}}
  return()=>nodes.forEach(node=>node.classList.remove('learning-wrong-line'));
 },[scopeError,entry?.project]);
 return <div className="diagram-learning-host" ref={host} hidden={props.active===false} onClickCapture={trackDesignClick} onPointerDownCapture={trackDesignPointer}>
  <div style={{display:session?'none':'contents'}}><Editor {...props} active={props.active!==false&&!session} ref={main} onLearning={()=>setCatalog(true)}/></div>
  {session&&<div data-learning-editor style={{display:'contents'}}><Editor key={session.token} {...props} doc={session.initial.states[0].doc} model={null} ref={practice} active={props.active!==false} incomingImage={null} onArtworkChange={undefined} onRevealCP={undefined} onLearning={()=>{if(session.authoring){if(!recording)setDesignerOpen(true);}else setCatalog(true);}} learningPractice={{initial:session.initial,onChange:observe,onExit:exit}}/></div>}
  {catalog&&props.active!==false&&<AppDialog title="折序绘图 · 学习与引导" onClose={()=>setCatalog(false)} size="large" className="diagram-learning-catalog">
   <p>用真实工具完成练习。原工作区保留，练习进度单独保存。</p>{error&&<p role="alert">{error}</p>}
   <div className="learning-catalog-tools"><button className="diagram-primary" onClick={()=>startAuthor()}>设计自己的教学</button><button onClick={()=>void selectProjectFile(importInput.current,'diagram').then(f=>f&&readDesign(f)).catch(e=>setError(String(e)))}>导入教学方案</button></div>
   <p className="learning-catalog-note">固定纸层和下层画线的旧教学已停用，等待你设计的新内容。自定义教学保存在本机，导出后可以共享和接入。</p>
   <input hidden type="file" ref={importInput} accept=".learning.json,.json" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void readDesign(file);}}/>
   <ol>{lessons.filter(l=>!l.withdrawn).map((l,i)=>{const design=designs.find(d=>d.id===l.id),saved=progress[l.id],updated=!!saved&&(saved.revision??1)!==(l.revision??1),done=!updated&&saved?.completed.length===l.tasks.length;return <li key={l.id}><div><strong>{i+1}. {l.title}</strong><p>{l.description}</p><small>{updated?'内容已更新，可重新开始练习':done?'已完成':saved?`已完成 ${saved.completed.length} / ${l.tasks.length} 项${saved.skipped.length?' · 含跳过任务':''}`:design?'自定义教学 · '+l.tasks.length+' 个环节':'尚未开始'}</small></div><div className="learning-custom-controls">{design&&<><button onClick={()=>startAuthor(design)}>编辑教学</button><button onClick={()=>void exportDesign(design)}>导出</button></>}<button onClick={()=>begin(l.id)}>{updated?'开始新版练习':saved?'继续练习':design?'预览教学':'开始练习'}</button>{saved&&!updated&&<button onClick={()=>begin(l.id,true)}>重新练习</button>}</div></li>;})}</ol>
  </AppDialog>}
  {session?.authoring&&authorDesign&&props.active!==false&&!designerOpen&&!picking&&<DiagramLearningRecorder design={authorDesign} selected={authorTask} onSelect={setAuthorTask} onChange={storeDesign} recording={recording} actionCount={recordCount} onStart={startRecording} onCommit={finishRecording} onCancel={()=>{recordingBuffer.current=null;setRecording(false);setRecordCount(0);}} onLoad={loadAuthorScene} onAdvanced={()=>setDesignerOpen(true)} onPreview={()=>begin(authorDesign.id,true)} onExport={()=>void exportDesign(authorDesign)} onExit={exit} error={error}/>}
  {session?.authoring&&authorDesign&&designerOpen&&props.active!==false&&<DiagramLearningDesigner design={authorDesign} selected={authorTask} onSelect={setAuthorTask} project={captureAuthor} observation={observation} onChange={storeDesign} onPick={(id,kind)=>{setDesignerOpen(false);setPicking({id,kind});}} onLoadScene={loadAuthorScene} onResume={()=>setDesignerOpen(false)} onPreview={()=>begin(authorDesign.id,true)} onExport={()=>void exportDesign(authorDesign)} onClose={exit} error={error}/>}
  {session?.authoring&&picking&&props.active!==false&&<DiagramLearningDesignPicker host={host} kind={picking.kind} tool={observation.tool} onPick={pickDone} onCancel={pickCancel}/>}
  {session&&!session.authoring&&lesson&&entry&&props.active!==false&&<aside className={'diagram-learning-card'+(collapsed?' is-collapsed':'')} aria-label="教学当前任务" style={{transform:`translate(${offset.x}px,${offset.y}px)`}}>
   <header onPointerDown={e=>{if((e.target as Element).closest('button')||e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,ox:offset.x,oy:offset.y};}} onPointerMove={e=>{const d=drag.current;if(d?.id===e.pointerId)setOffset({x:Math.max(-window.innerWidth*.5,Math.min(100,d.ox+e.clientX-d.x)),y:Math.max(-150,Math.min(window.innerHeight*.45,d.oy+e.clientY-d.y))});}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}><strong>{lesson.title}</strong><button aria-label={collapsed?'展开教学任务':'收起教学任务'} onClick={()=>setCollapsed(v=>!v)}>{collapsed?'展开':'收起'}</button></header>
   {!collapsed&&<><div className="learning-task-content">{task?<>
    {!ready&&(!guideEnabled||!guideStage||task.question)&&<h3>{task.title}</h3>}
    <p className="learning-chat-message" role="status">{ready?(task.question?'答对了。':'这一步完成了。'):(guideEnabled&&guideStage?guideStage:task.goal)}</p>
    {ready&&lesson.tasks[entry.task+1]&&<p className="learning-chat-next">接下来，{lesson.tasks[entry.task+1].title}。</p>}
    {!ready&&lesson.id==='layers'&&observation.selectedLineCount>0&&<p className="learning-error">先按 Esc 取消折线选择，才能设置之后画线的纸层。</p>}
    {!ready&&task.question&&<div className="learning-answers">{task.question.answers.map((text,i)=><button key={i} aria-pressed={answer===i} onClick={()=>setAnswer(i)}>{text}</button>)}</div>}
    {!ready&&answer!==null&&task.question&&answer!==task.question.correct&&<p role="status">再想一下，或看看提示。</p>}
    {scopeError&&!ready&&<p className="learning-error" role="status">这条线的作用纸层不对。按 Esc 后选中它，改为 F{learningBottomFace(entry.project)+1}。</p>}
    {!ready&&hint>0&&<p className="learning-hint">{task.hints[Math.min(1,hint-1)]}</p>}
   </>:<><p className="learning-chat-message" role="status">{entry.completed.length===lesson.tasks.length?'这课完成了！':'这课已经走完。'}</p>{entry.skipped.length>0&&<p>还有 {entry.skipped.length} 项跳过的任务，可以重新练习。</p>}</>}
   {error&&<p className="learning-error" role="alert">{error}</p>}</div>
   <footer>
    {task?(ready?<button className="diagram-primary" onClick={()=>advance()}>继续</button>:<>{task.design?.rule.kind==='manual'&&routeFinished&&<button className="diagram-primary" onClick={()=>setManualReady(true)}>我已完成</button>}<button onClick={()=>setHint(v=>Math.min(2,v+1))}>{hint?'详细提示':'提示'}</button></>):<><button className="diagram-primary" onClick={()=>setCatalog(true)}>选择下一课</button><button onClick={exit}>{session.preview?'返回教学设计':'返回工作区'}</button></>}
    <details className="learning-more"><summary aria-label="更多教学操作">更多</summary><div>
     {task&&<><button onClick={()=>{const project=entry.baseline??session.initial;persist({...progressRef.current,[lesson.id]:{...entry,project}});setSession({...session,initial:project,token:Date.now()});}}>重试本任务</button><button onClick={()=>advance(true)}>跳过本任务</button></>}
     <button onClick={()=>void practice.current?.save()}>保存练习备份</button><button onClick={()=>setCatalog(true)}>选择课程</button><button onClick={exit}>退出教学</button>
     <label className="learning-guide-switch"><input type="checkbox" checked={guideEnabled} onChange={e=>setGuideEnabled(e.target.checked)}/>画布引导</label>
    </div></details>
   </footer></>}

  </aside>}
  {session&&!session.authoring&&entry&&guidedTask&&<DiagramLearningSpotlight host={host} project={entry.project} observation={observation} lessonId={session.lesson} task={guidedTask} ready={ready} compact={collapsed} enabled={guideEnabled&&props.active!==false&&!catalog} onStage={setGuideStage} onAvoid={avoidGuide}/>}
 </div>;
});
