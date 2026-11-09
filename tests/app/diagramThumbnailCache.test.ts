import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DiagramThumbnailCache,type DiagramThumbnailSource} from '../../src/app/diagramThumbnailCache';
import {defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject,adoptDiagramPose,updateDiagramPoseViewport,type DiagramProject} from '../../src/app/diagramProject';
import {computeFlatFold} from '../../src/core/flatFold';
import {defaultModelView} from '../../src/app/modelViewState';

const tick=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
async function until(condition:()=>boolean){for(let attempt=0;attempt<100&&!condition();attempt++)await tick();assert.ok(condition(),'queued rendering completed');}
function freeze<T>(value:T):T{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
function fixture():DiagramThumbnailSource {
  let serial=0;const doc=blankDoc('图片缓存',100,100),initial=createDiagramProject(doc,()=>`cache-${++serial}`);
  const project=adoptDiagramPose(initial,initial.activeStepId,initial.steps[0].beforeId,computeFlatFold(doc));
  return {step:project.steps[0],states:project.states,lineDefaults:defaultDiagramLineDefaults(),adaptiveLines:true,size:{width:200,height:140},zoom:{kind:'circle',center:[50,50],radius:30}};
}
function edit(source:DiagramThumbnailSource):DiagramThumbnailSource {
  return {...source,step:{...source.step,annotations:[{id:'new-ink',kind:'line',a:[10,10],b:[90,90],style:'valley',color:'#345678',width:.7}]}};
}
function harness(maxBytes?:number){
  const calls:{source:DiagramThumbnailSource;resolve:(value:{src:string;bytes:number})=>void;reject:(error:Error)=>void}[]=[],released:string[]=[];
  const cache=new DiagramThumbnailCache(source=>new Promise((resolve,reject)=>calls.push({source,resolve,reject})),url=>released.push(url),maxBytes);
  const complete=async(index:number,url:string,bytes=4)=>{calls[index].resolve({src:url,bytes});await tick();};
  return {cache,calls,released,complete};
}

test('editing sessions hold the last image, refresh on leave and refresh inherited dependencies on entry',async()=>{
  const h=harness(),source=freeze(fixture()),saved=structuredClone(source),id=source.step.id,session={};
  h.cache.request(id,source,session);await until(()=>h.calls.length===1);await h.complete(0,'old');
  const changed=freeze(edit(source));h.cache.request(id,changed,session);await tick();
  assert.equal(h.calls.length,1);assert.equal(h.cache.getSnapshot(id).src,'old');
  h.cache.request(id,changed);assert.deepEqual(h.cache.getSnapshot(id),{src:'old',status:'loading'});assert.deepEqual(h.released,[]);
  await until(()=>h.calls.length===2);await h.complete(1,'edited');
  assert.equal(h.cache.getSnapshot(id).src,'edited');assert.deepEqual(h.released,['old']);
  const inherited={...changed,states:changed.states.map((state,index)=>index?state:{...state,doc:{...state.doc,name:'新的来源 CP'}})},nextSession={};
  h.cache.request(id,inherited,nextSession);await until(()=>h.calls.length===3);await h.complete(2,'inherited');
  h.cache.request(id,edit(inherited),nextSession);await tick();
  assert.equal(h.calls.length,3);assert.equal(h.cache.getSnapshot(id).src,'inherited');assert.deepEqual(source,saved);
  h.cache.clear();assert.deepEqual(h.released,['old','edited','inherited']);
});

test('viewport-only edits preserve the image across leaving and reentering a step, while drawing edits still refresh',async()=>{
  const h=harness(),initial=fixture();
  const source=freeze({...initial,step:{...initial.step,pose:{...initial.step.pose!,view:{...defaultModelView(),colors:{front:'#bbddaa',back:'#ffeedd',line:'#345678'}}}}});
  const id=source.step.id,session={};
  let project:DiagramProject={format:'zhezhi-diagram',version:1,name:'相机缓存',steps:[source.step],states:[...source.states],activeStepId:id};
  h.cache.request(id,source,session);await until(()=>h.calls.length===1);await h.complete(0,'unchanged-artwork');
  project=updateDiagramPoseViewport(project,id,{'front-solid':{rotation:0,x:12,y:23,width:200,height:140}});
  project=updateDiagramPoseViewport(project,id,{'front-solid':{rotation:0,x:42,y:38,width:100,height:70}});
  const navigated={...source,step:project.steps[0],states:project.states};
  assert.notEqual(navigated.step.pose,source.step.pose);assert.notEqual(navigated.step.pose!.view!.colors,source.step.pose!.view!.colors);
  h.cache.request(id,navigated,session);h.cache.request(id,navigated);await tick();
  const nextSession={};h.cache.request(id,navigated,nextSession);await tick();
  assert.equal(h.calls.length,1,'pan/zoom and copied view values do not replace the PDF artwork');
  assert.deepEqual(h.cache.getSnapshot(id),{src:'unchanged-artwork',status:'ready'});assert.deepEqual(h.released,[]);
  const changed=edit(navigated);h.cache.request(id,changed,nextSession);await tick();assert.equal(h.calls.length,1);
  h.cache.request(id,changed);await until(()=>h.calls.length===2);await h.complete(1,'changed-artwork');
  assert.deepEqual(h.released,['unchanged-artwork']);h.cache.clear();
});

test('queued edits coalesce and an obsolete running render can never replace the newer snapshot',async()=>{
  const h=harness(),source=fixture(),id=source.step.id,second=edit(source),third={...second,size:{width:230,height:170}};
  h.cache.request(id,source);h.cache.request(id,second);
  await until(()=>h.calls.length===1);assert.equal(h.calls[0].source,second);
  h.cache.request(id,third);await tick();assert.equal(h.calls.length,1,'only one render runs at a time');
  await h.complete(0,'obsolete');await until(()=>h.calls.length===2);
  assert.deepEqual(h.released,['obsolete']);assert.equal(h.cache.getSnapshot(id).src,undefined);assert.equal(h.calls[1].source,third);
  await h.complete(1,'latest');assert.deepEqual(h.cache.getSnapshot(id),{src:'latest',status:'ready'});
  h.cache.clear();assert.deepEqual(h.released,['obsolete','latest']);
});

test('clearing a document drops queued work, retains subscriptions and rejects old asynchronous completions',async()=>{
  const h=harness(),source=fixture(),id=source.step.id;let notifications=0;
  const unsubscribe=h.cache.subscribe(id,()=>{notifications++;});
  h.cache.request(id,source);await until(()=>h.calls.length===1);h.cache.request('queued-step',source);
  h.cache.clear();assert.equal(h.cache.getSnapshot(id).status,'idle');assert.equal(h.cache.getSnapshot('queued-step').status,'idle');
  h.cache.request(id,source,{});await h.complete(0,'old-document');await until(()=>h.calls.length===2);
  assert.deepEqual(h.released,['old-document']);await h.complete(1,'new-document');
  assert.equal(h.calls.length,2,'the old queued step never rendered');assert.equal(h.cache.getSnapshot(id).src,'new-document');assert.ok(notifications>=4);
  unsubscribe();h.cache.clear();assert.deepEqual(h.released,['old-document','new-document']);
});

test('pruning removed steps releases ready images and discards their queued or running replacements',async()=>{
  const h=harness(),source=fixture();
  h.cache.request('ready',source);await until(()=>h.calls.length===1);await h.complete(0,'ready-image');
  h.cache.request('running',source);await until(()=>h.calls.length===2);h.cache.request('queued',source);
  h.cache.prune(new Set(['ready']));await h.complete(1,'removed-image');await tick();
  assert.equal(h.calls.length,2);assert.deepEqual(h.released,['removed-image']);assert.equal(h.cache.getSnapshot('running').status,'idle');
  h.cache.prune(new Set());assert.deepEqual(h.released,['removed-image','ready-image']);
  h.cache.request('running',source);await until(()=>h.calls.length===3);await h.complete(2,'restored-step');
  assert.equal(h.cache.getSnapshot('running').src,'restored-step');h.cache.clear();
});

test('unrelated edits reuse images while CP, pose, style, crop and PDF panel changes invalidate them',async()=>{
  const h=harness(),source=fixture(),id=source.step.id,pose=source.step.pose!,view=pose.view??defaultModelView();
  h.cache.request(id,source);await until(()=>h.calls.length===1);await h.complete(0,'image-0');
  h.cache.request(id,{...source,step:{...source.step,title:'只改标题'},states:[...source.states,{...source.states[0],id:'unrelated'}],size:{...source.size},zoom:structuredClone(source.zoom)});
  await tick();assert.equal(h.calls.length,1,'equivalent dependencies do not regenerate images');
  const variants:DiagramThumbnailSource[]=[
    {...source,states:source.states.map((state,index)=>index?state:{...state,revision:state.revision+1})},
    {...source,states:source.states.map((state,index)=>index?state:{...state,doc:structuredClone(state.doc)})},
    {...source,step:{...source.step,pose:structuredClone(source.step.pose)}},
    {...source,step:{...source.step,pose:{...pose,view:{...view,side:'back'}}}},
    {...source,step:{...source.step,pose:{...pose,view:{...view,rotation:90}}}},
    {...source,step:{...source.step,pose:{...pose,view:{...view,xray:true}}}},
    {...source,step:{...source.step,pose:{...pose,view:{...view,colors:{front:'#aabbcc',back:'#ddccbb',line:'#123456'}}}}},
    {...source,step:{...source.step,pose:{...pose,hiddenFaces:[0]}}},
    {...source,step:{...source.step,pose:{...pose,displayOrder:[0]}}},
    {...source,step:{...source.step,pose:{...pose,paperDeformation:{nodes:[{face:0,cp:[25,25],point:[30,25]}]}}}},
    edit(source),
    {...source,lineDefaults:{...source.lineDefaults}},
    {...source,adaptiveLines:false},
    {...source,zoom:{kind:'circle',center:[40,50],radius:30}},
    {...source,size:{width:210,height:140}},
    {...source,step:{...source.step,canvas:{...source.step.canvas!,drawingRotation:90}}},
  ];
  for(let index=0;index<variants.length;index++){
    const before=h.calls.length;
    h.cache.request(id,variants[index]);await until(()=>h.calls.length===before+1);await h.complete(before,`changed-${index}`);
    h.cache.request(id,source);await until(()=>h.calls.length===before+2);await h.complete(before+1,`baseline-${index}`);
  }
  assert.equal(h.released.length,variants.length*2);h.cache.clear();
});

test('preparation and rendering errors preserve the last image until a successful refreshed replacement',async()=>{
  const h=harness(),source=fixture(),id=source.step.id;
  h.cache.request(id,{...source,preparation:{pending:true,message:'纸层准备中'}},{});await tick();
  assert.equal(h.calls.length,0);assert.equal(h.cache.getSnapshot(id).status,'preparation');
  h.cache.request(id,source);await until(()=>h.calls.length===1);await h.complete(0,'prepared');
  h.cache.request(id,{...edit(source),preparation:{pending:false,message:'纸层尚未确认'}});
  assert.deepEqual(h.cache.getSnapshot(id),{src:'prepared',status:'preparation',message:'纸层尚未确认'});
  const failedSource=edit(source);h.cache.request(id,failedSource);await until(()=>h.calls.length===2);h.calls[1].reject(new Error('解码失败'));await tick();
  assert.deepEqual(h.cache.getSnapshot(id),{src:'prepared',status:'error',message:'解码失败'});assert.deepEqual(h.released,[]);
  h.cache.request(id,failedSource);await until(()=>h.calls.length===3);await h.complete(2,'recovered');
  assert.equal(h.cache.getSnapshot(id).status,'ready');assert.deepEqual(h.released,['prepared']);h.cache.clear();
});

test('memory trimming evicts unused images while visible or actively edited images remain available',async()=>{
  const h=harness(10),source=fixture(),unsub=h.cache.subscribe('visible',()=>{});
  h.cache.request('visible',source);await until(()=>h.calls.length===1);await h.complete(0,'visible-image',8);
  h.cache.request('unused',source);await until(()=>h.calls.length===2);await h.complete(1,'unused-image',8);
  assert.equal(h.cache.getSnapshot('visible').src,'visible-image');assert.equal(h.cache.getSnapshot('unused').status,'idle');assert.deepEqual(h.released,['unused-image']);
  h.cache.request('editing',source,{});await until(()=>h.calls.length===3);await h.complete(2,'editing-image',8);
  assert.equal(h.cache.getSnapshot('editing').src,'editing-image');assert.equal(h.cache.getSnapshot('visible').src,'visible-image');
  unsub();h.cache.request('replacement',source);await until(()=>h.calls.length===4);await h.complete(3,'replacement-image',2);
  assert.equal(h.cache.getSnapshot('visible').status,'idle');assert.equal(h.cache.getSnapshot('editing').src,'editing-image');
  assert.deepEqual(h.released,['unused-image','visible-image']);h.cache.clear();
});
