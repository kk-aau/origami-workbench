import test from 'node:test';
import assert from 'node:assert/strict';
import {SimulatorBridge,type SimulatorStatus,type SimulatorCommand} from '../../src/engine/simulator';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import {DEFAULT_SIMULATION_SOLVER_SETTINGS} from '../../src/engine/simSettings';

const image={dataUrl:'data:image/png;base64,AQID',width:800,height:600};
const origin='http://127.0.0.1:5173';
function savedPose(){
  const source={vertices_coords:[[0,0],[1,0],[0,1]],edges_vertices:[[0,1],[1,2],[2,0]],edges_assignment:['B','B','B'],faces_vertices:[[0,1,2]]};
  const solver=new ReferenceSolver(new OrigamiModel(prepareSimulationDocument(source).prepared));
  try{return {version:1,source,solver:solver.capturePose(),settings:{...DEFAULT_SIMULATION_SOLVER_SETTINGS},progress:0,view:{yaw:0,pitch:0,zoom:1}};}finally{solver.dispose();}
}

function fixture(){
  const previousWindow=globalThis.window,previousLocation=globalThis.location;
  const target=new EventTarget(),frame=new EventTarget(),posted:SimulatorCommand[]=[],statuses:SimulatorStatus[]=[];
  const source={postMessage(message:SimulatorCommand,destination:string){assert.equal(destination,origin);posted.push(message);}};
  const iframe=Object.assign(frame,{contentWindow:source}) as unknown as HTMLIFrameElement;
  globalThis.window=target as unknown as Window&typeof globalThis;
  globalThis.location={origin} as Location;
  const bridge=new SimulatorBridge(iframe,status=>statuses.push(status));
  const emit=(data:unknown,overrides:{origin?:string;source?:unknown}={})=>target.dispatchEvent(Object.assign(new Event('message'),{data,origin,source,...overrides}));
  const load=(revision:string|number='model-a')=>{
    bridge.send({type:'zhezhi-sim-load',revision,fold:{}});
    emit({type:'zhezhi-sim-status',status:'ready',message:''});
    emit({type:'zhezhi-sim-status',status:'loaded',revision,message:''});
  };
  const request=()=>posted.filter((command):command is Extract<SimulatorCommand,{type:'zhezhi-sim-capture-image'}>=>command.type==='zhezhi-sim-capture-image').at(-1)!;
  const reply=(command=request(),result:unknown={image})=>emit({type:'zhezhi-sim-image',requestId:command.requestId,revision:command.revision,...result as object});
  const cleanup=()=>{bridge.dispose();globalThis.window=previousWindow;globalThis.location=previousLocation;};
  return {bridge,posted,statuses,iframe,frame,emit,load,request,reply,cleanup};
}

test('capture uses the loaded revision, returns dimensions, and correlates simultaneous requests',async()=>{
  const f=fixture();
  try{
    await assert.rejects(f.bridge.captureImage(),/载入完成/);
    f.load(0);
    const first=f.bridge.captureImage(),firstRequest=f.request();
    const second=f.bridge.captureImage({scale:2,transparent:false}),secondRequest=f.request();
    assert.equal(firstRequest.revision,0);assert.equal(firstRequest.scale,1);assert.equal(firstRequest.transparent,true);
    assert.equal(secondRequest.scale,2);assert.equal(secondRequest.transparent,false);assert.notEqual(firstRequest.requestId,secondRequest.requestId);
    f.reply(secondRequest,{image:{...image,width:1600,height:1200}});f.reply(firstRequest);
    assert.deepEqual(await first,image);assert.equal((await second).width,1600);
    assert.equal(f.posted.filter(command=>command.type==='zhezhi-sim-pause').length,0,'capture does not change solver playback');
  }finally{f.cleanup();}
});

test('complete artwork pose requests validate replies and ignore stale or foreign frames',async()=>{
  const f=fixture();
  try{
    await assert.rejects(f.bridge.capturePose(),/载入完成/);f.load();
    let resolved=false;const pending=f.bridge.capturePose().then(pose=>{resolved=true;return pose;});
    const request=f.posted.at(-1)! as Extract<SimulatorCommand,{type:'zhezhi-sim-capture-pose'}>,pose=savedPose();
    const reply={type:'zhezhi-sim-pose',requestId:request.requestId,revision:request.revision,pose};
    f.emit(reply,{origin:'https://unrelated.invalid'});f.emit(reply,{source:{}});f.emit({...reply,revision:'other'});
    await Promise.resolve();assert.equal(resolved,false);f.emit(reply);assert.deepEqual(await pending,pose);
    const invalid=f.bridge.capturePose(),next=f.posted.at(-1) as typeof request;
    f.emit({...reply,requestId:next.requestId,pose:{...pose,progress:Infinity}});await assert.rejects(invalid,/三维姿态/);
  }finally{f.cleanup();}
});

test('switching models or closing a view cancels pending complete artwork captures',async()=>{
  for(const action of ['switch','close','reload']as const){
    const f=fixture();try{
      f.load();const pending=f.bridge.capturePose(),rejection=assert.rejects(pending,/已切换|已关闭|重新载入/);
      if(action==='switch')f.load('another');else if(action==='close')f.bridge.dispose();else f.frame.dispatchEvent(new Event('load'));
      await rejection;
    }finally{f.cleanup();}
  }
});

test('capture ignores messages from another origin, window, request, or model revision',async()=>{
  const f=fixture();
  try{
    f.load();let resolved=false;
    const pending=f.bridge.captureImage().then(value=>{resolved=true;return value;}),command=f.request();
    const reply={type:'zhezhi-sim-image',requestId:command.requestId,revision:command.revision,image};
    f.emit(reply,{origin:'https://other.invalid'});f.emit(reply,{source:{}});
    f.emit({...reply,requestId:'unrelated'});f.emit({...reply,revision:'stale'});
    await Promise.resolve();assert.equal(resolved,false);
    f.reply(command);assert.deepEqual(await pending,image);
  }finally{f.cleanup();}
});

test('switching steps cancels pending images and a late response cannot satisfy a new capture',async()=>{
  const f=fixture();
  try{
    f.load();const pending=f.bridge.captureImage(),old=f.request(),rejection=assert.rejects(pending,/已切换/);
    f.bridge.send({type:'zhezhi-sim-load',revision:'model-b',fold:{}});await rejection;
    await assert.rejects(f.bridge.captureImage(),/载入完成/);
    f.emit({type:'zhezhi-sim-status',status:'loaded',revision:'model-b',message:''});
    let resolved=false;const next=f.bridge.captureImage().then(value=>{resolved=true;return value;});
    f.reply(old);await Promise.resolve();assert.equal(resolved,false);
    f.reply();assert.deepEqual(await next,image);
  }finally{f.cleanup();}
});

test('clear, view closure, iframe reload, timeout and abort all reject pending screenshots',async()=>{
  for(const action of ['clear','dispose','reload','timeout','abort'] as const){
    const f=fixture();
    try{
      f.load();const controller=new AbortController();
      const pending=f.bridge.captureImage({timeoutMs:action==='timeout'?5:1000,signal:controller.signal});
      const rejected=assert.rejects(pending,action==='clear'?/已切换/:action==='dispose'?/已关闭/:action==='reload'?/重新载入/:action==='timeout'?/超时/:/已取消/);
      if(action==='clear')f.bridge.send({type:'zhezhi-sim-clear',revision:'empty'});
      if(action==='dispose')f.bridge.dispose();
      if(action==='reload')f.frame.dispatchEvent(new Event('load'));
      if(action==='abort')controller.abort();
      await rejected;
      f.reply();
      if(action==='dispose')await assert.rejects(f.bridge.captureImage(),/已关闭/);
    }finally{f.cleanup();}
  }
});

test('capture rejects invalid replies and renderer failures instead of inserting a blank image',async()=>{
  const f=fixture();
  try{
    f.load();let pending=f.bridge.captureImage();f.reply(undefined,{error:'当前视图没有可截取的纸面或折线。'});
    await assert.rejects(pending,/没有可截取/);
    for(const invalid of [{...image,dataUrl:'data:,'},{...image,width:0},{...image,height:Infinity},{...image,width:8192,height:8192}]){
      pending=f.bridge.captureImage();f.reply(undefined,{image:invalid});await assert.rejects(pending,/PNG 图像无效/);
    }
    pending=f.bridge.captureImage();f.emit({type:'zhezhi-sim-status',status:'error',revision:'model-a',message:'失败',error:'模型不可用'});
    await assert.rejects(pending,/模型不可用/);await assert.rejects(f.bridge.captureImage(),/载入完成/);
  }finally{f.cleanup();}
});

test('a reloaded iframe cannot reuse the preceding document loaded status',async()=>{
  const f=fixture();
  try{
    f.load();const pending=f.bridge.captureImage(),rejection=assert.rejects(pending,/重新载入/);
    f.emit({type:'zhezhi-sim-status',status:'ready',message:''});await rejection;
    await assert.rejects(f.bridge.captureImage(),/载入完成/);
    f.emit({type:'zhezhi-sim-status',status:'loaded',revision:'model-a',message:''});
    const restored=f.bridge.captureImage();f.reply();assert.deepEqual(await restored,image);
  }finally{f.cleanup();}
});
