import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,readdir,realpath,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {projectThumbnail} from '../src/core/projectThumbnail.mjs';
import {withProjectBaseRevision} from './helpers/project-base-revision.mjs';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let child,dataDir,tempRoot,base,token;
const doc=(name='折痕文档')=>({name,paper:{width:200,height:140},segments:[
  {id:'boundary',a:[0,0],b:[200,0],assignment:'B',angle:0},
  {id:'mountain',a:[0,0],b:[200,140],assignment:'M',angle:-180},
  {id:'valley',a:[0,140],b:[200,0],assignment:'V',angle:180},
],objects:[{id:'circle',kind:'circle',center:[100,70],radius:20,color:'#448866'}],metadata:{retained:'保留扩展字段'}});
async function request(route,{method='GET',json}={}){
  const response=await fetch(base+route,{method,headers:{...(json===undefined?{}:{'Content-Type':'application/json'}),...(method==='GET'?{}:{'X-Zhezhi-Token':token})},...(json===undefined?{}:{body:JSON.stringify(json)})});
  return {status:response.status,value:await response.json()};
}
const post=async(route,json)=>request(route,{method:'POST',json:await withProjectBaseRevision(route,json,request)});
const file=(id,draft=false)=>path.join(dataDir,'projects',id+(draft?'.draft':'')+'.json');
const stored=async(id,draft=false)=>JSON.parse(await readFile(file(id,draft),'utf8'));
const stamp=async(id,draft,updated)=>{const value=await stored(id,draft);await writeFile(file(id,draft),JSON.stringify({...value,updated}));};

before(async()=>{
  tempRoot=await realpath(os.tmpdir());dataDir=await mkdtemp(path.join(tempRoot,'zhezhi-crease-library-'));
  child=spawn(process.env.ZHEZHI_RUST_SERVER || process.execPath, process.env.ZHEZHI_RUST_SERVER ? [] : ['server.mjs'],{cwd:root,windowsHide:true,env:{...process.env,ZHEZHI_PORT:'0',ZHEZHI_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{
    let output='';const timer=setTimeout(()=>reject(new Error('测试服务启动超时：'+output)),10000);
    child.stdout.on('data',chunk=>{output+=chunk;const ready=/http:\/\/127\.0\.0\.1:(\d+)/.exec(output);if(ready){base=ready[0];clearTimeout(timer);resolve();}});
    child.stderr.on('data',chunk=>{output+=chunk;});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error('测试服务退出 '+code+'：'+output));});
  });
  token=(await request('/api/health')).value.token;
});
after(async()=>{
  if(child&&child.exitCode===null&&!child.signalCode){
    const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');
    let timer;await Promise.race([exited,new Promise(resolve=>{timer=setTimeout(resolve,5000);})]);clearTimeout(timer);
    if(child.exitCode===null&&!child.signalCode){child.kill('SIGKILL');await exited;}
  }
  if(dataDir){assert.equal(path.dirname(path.resolve(dataDir)),tempRoot);assert.match(path.basename(dataDir),/^zhezhi-crease-library-/);await rm(dataDir,{recursive:true,force:true});}
});

test('普通工程 API 保持手动保存内容和原列表字段，草稿独立保存、可覆盖并能加载',async()=>{
  const original=doc('已保存工程'),saved=await post('/api/projects',{doc:original});assert.equal(saved.status,200);
  const id=saved.value.id;await stamp(id,false,'2020-01-01T00:00:00.000Z');
  const manualBytes=await readFile(file(id),'utf8');
  const draft=doc('自动草稿');draft.segments[1].b=[150,120];
  assert.equal((await post('/api/projects/draft',{id,doc:draft})).status,200);
  assert.equal(await readFile(file(id),'utf8'),manualBytes);
  assert.deepEqual((await request('/api/projects/'+id)).value.doc,original);
  const ordinary=(await request('/api/projects')).value.projects.find(p=>p.id===id);
  assert.deepEqual(Object.keys(ordinary).sort(),['id','name','segments','updated']);assert.equal(ordinary.name,original.name);
  const library=(await request('/api/projects?library=1')).value.projects.find(p=>p.id===id);
  assert.equal(library.draft,true);assert.equal(library.name,draft.name);assert.match(library.thumbnail,/<line /);assert.match(library.thumbnail,/stroke-dasharray/);
  const loaded=(await request('/api/projects/'+id+'?draft=1')).value;assert.equal(loaded.draft,true);assert.deepEqual(loaded.doc,draft);
  const replacement=doc('更新草稿');assert.equal((await post('/api/projects/draft',{id,doc:replacement})).status,200);
  assert.deepEqual((await stored(id,true)).doc,replacement);assert.equal(await readFile(file(id),'utf8'),manualBytes);
  assert.deepEqual(JSON.parse(await readFile(file(id,true)+'.bak','utf8')).doc,draft);
});

test('无编号草稿创建独立文档，新手动版及相同时间优先显示已保存状态',async()=>{
  const created=await post('/api/projects/draft',{doc:doc('未手动保存')});assert.equal(created.status,200);const id=created.value.id;
  assert.equal((await request('/api/projects/'+id)).status,404);
  assert.equal((await request('/api/projects?library=1')).value.projects.find(p=>p.id===id).draft,true);
  await stamp(id,true,'2020-01-01T00:00:00.000Z');
  assert.equal((await post('/api/projects',{id,doc:doc('最新手动保存')})).status,200);
  let summary=(await request('/api/projects?library=1')).value.projects.find(p=>p.id===id);assert.equal(summary.draft,false);assert.equal(summary.name,'最新手动保存');
  const time='2026-10-16T00:00:00.000Z';await stamp(id,false,time);await stamp(id,true,time);
  summary=(await request('/api/projects?library=1')).value.projects.find(p=>p.id===id);assert.equal(summary.draft,false);
  const loaded=(await request('/api/projects/'+id+'?draft=1')).value;assert.equal(loaded.draft,false);assert.equal(loaded.doc.name,'最新手动保存');
});

test('重命名同时修改手动版与草稿的名称，保留几何、扩展内容、时间及草稿状态',async()=>{
  const id=(await post('/api/projects',{doc:doc('原名称')})).value.id;
  const draft=doc('原草稿');draft.segments[0].b=[180,0];
  await post('/api/projects/draft',{id,doc:draft});await stamp(id,false,'2020-01-01T00:00:00.000Z');await stamp(id,true,'2021-01-01T00:00:00.000Z');
  const beforeManual=await stored(id),beforeDraft=await stored(id,true);
  assert.equal((await post('/api/projects/'+id+'/rename',{name:'  中文新名称  '})).status,200);
  assert.deepEqual(await stored(id),{...beforeManual,doc:{...beforeManual.doc,name:'中文新名称'}});
  assert.deepEqual(await stored(id,true),{...beforeDraft,doc:{...beforeDraft.doc,name:'中文新名称'}});
  assert.equal((await request('/api/projects?library=1')).value.projects.find(p=>p.id===id).draft,true);
  for(const name of ['', '  ', 'x'.repeat(161),null])assert.equal((await post('/api/projects/'+id+'/rename',{name})).status,400);
  const draftId=(await post('/api/projects/draft',{doc:doc('只有草稿')})).value.id;
  assert.equal((await post('/api/projects/'+draftId+'/rename',{name:'草稿新名称'})).status,200);
  assert.equal((await request('/api/projects/'+draftId+'?draft=1')).value.doc.name,'草稿新名称');
});

test('非法编号被拒绝；损坏和编号不符文件保留且从文档库跳过',async()=>{
  for(const id of ['../outside','------------------------------------','not-a-uuid']){
    assert.equal((await post('/api/projects/draft',{id,doc:doc()})).status,400);
    assert.equal((await post('/api/projects/'+encodeURIComponent(id)+'/rename',{name:'名称'})).status,400);
  }
  const corruptId=randomUUID(),mismatchId=randomUUID();await writeFile(file(corruptId,true),'{');
  await writeFile(file(mismatchId,true),JSON.stringify({format:'zhezhi-project',version:1,id:randomUUID(),doc:doc(),updated:new Date().toISOString()}));
  const library=(await request('/api/projects?library=1')).value.projects;
  assert.ok(!library.some(p=>[corruptId,mismatchId].includes(p.id)));assert.equal(await readFile(file(corruptId,true),'utf8'),'{');
  const id=(await post('/api/projects',{doc:doc('健康手动版')})).value.id;await writeFile(file(id,true),'{');
  assert.equal((await request('/api/projects/'+id+'?draft=1')).value.doc.name,'健康手动版');
  assert.ok(!(await readdir(path.join(dataDir,'projects'))).some(n=>n.endsWith('.tmp')));
});

test('缩略图采用真实边界及山谷几何，采样和 XML 输出有界安全',()=>{
  const value=doc('<script>alert(1)</script>');
  value.segments.push(...Array.from({length:2000},(_,i)=>({id:'line-'+i,a:[0,i/20],b:[200,i/20],assignment:i%2?'V':'M',angle:null})));
  value.background={url:'https://example.com/private.png'};value.objects.push({kind:'text',text:'<foreignObject/>',position:[0,0]});
  value.segments[1].displayColor='" onload="alert(1)';
  const svg=projectThumbnail(value);assert.ok(svg.length<120000);assert.equal((svg.match(/<line /g)??[]).length,550);
  assert.match(svg,/stroke="#58615e"/);assert.match(svg,/stroke="#bd5147"/);assert.match(svg,/stroke="#477caa"/);assert.match(svg,/<circle /);
  assert.doesNotMatch(svg,/script|foreignObject|https:|onload|NaN|Infinity/);
  assert.match(projectThumbnail({...doc(),segments:[],objects:[],metadata:{curveDesign:{format:'zhezhi-curve-design'}}}),/<rect .*stroke="#87918b"/);
  const bad=projectThumbnail({paper:{width:Infinity,height:1e308},segments:[{a:[Infinity,0],b:[1,1],assignment:'M'}]});assert.doesNotMatch(bad,/NaN|Infinity/);
});

test('原生曲面文档以真实二维展开生成缩略图，图库 API 保留空直折痕并显示纸带和曲折线',async()=>{
  const fixtures=JSON.parse(await readFile(path.join(root,'tests','fixtures','curved-nonuniform-helix-native-20261001.json'),'utf8'));
  const result=fixtures.find(row=>row.name==='original-in3968').response,flat=result.flattening.result;
  const design={format:'zhezhi-curve-design',version:1,name:'原非均匀螺旋曲面',millimetersPerUnit:73,query:result.query,result};
  const boundary=['targetLeft','targetRight'].flatMap(side=>[...flat.grid.map(row=>row[side][0]),...flat.grid.map(row=>row[side].at(-1))]);
  const paper={width:(Math.max(...boundary.map(p=>p[0]))-Math.min(...boundary.map(p=>p[0])))*73,height:(Math.max(...boundary.map(p=>p[1]))-Math.min(...boundary.map(p=>p[1])))*73};
  const value={schemaVersion:2,name:design.name,paper,segments:[],objects:[],metadata:{curveDesign:design}},before=JSON.stringify(value);
  const svg=projectThumbnail(value);assert.ok(svg.length<120000);assert.equal(JSON.stringify(value),before);
  assert.equal((svg.match(/ Z"/g)??[]).length,2);assert.equal((svg.match(/<path /g)??[]).length,3+2*Math.min(32,flat.grid.length));
  assert.doesNotMatch(svg,/<line |#87918b|script|foreignObject|https:|onload|NaN|Infinity/);
  // Compare real stored sample positions to the thumbnail, independently of its
  // curve/boundary traversal. SVG export negates the source's vertical axis.
  const points=[...flat.sample.rows.map(row=>row.targetBase),...flat.grid.flatMap(row=>[...row.targetLeft,...row.targetRight])].map(p=>[p[0]*73,-p[1]*73]);
  const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
  const width=maxX-minX,height=maxY-minY,scale=Math.min(292/width,192/height),round=n=>Math.round(n*100)/100;
  const projected=p=>`${round((320-width*scale)/2+(p[0]*73-minX)*scale)} ${round((220-height*scale)/2+(-p[1]*73-minY)*scale)}`;
  const curve=/<path d="([^"]+)" fill="none" stroke="#008b9a"/.exec(svg)?.[1];assert.ok(curve);
  assert.ok(curve.startsWith('M'+projected(flat.sample.rows[0].targetBase)));assert.ok(curve.endsWith('L'+projected(flat.sample.rows.at(-1).targetBase)));
  assert.ok(svg.includes(projected(flat.grid[0].targetLeft.at(-1))));assert.ok(svg.includes(projected(flat.grid.at(-1).targetRight.at(-1))));
  const saved=await post('/api/projects',{doc:value});assert.equal(saved.status,200);
  const entry=(await request('/api/projects?library=1')).value.projects.find(project=>project.id===saved.value.id);
  assert.equal(entry.kind,'curve-design');assert.equal(entry.segments,0);assert.equal(entry.samples,result.sample.rows.length);assert.equal(entry.thumbnail,svg);
  assert.deepEqual((await request('/api/projects/'+saved.value.id)).value.doc,value);
});

test('缺失或损坏曲面坐标安全回退纸张预览，元数据采样规模有界且不导出文本或外链',()=>{
  const design={format:'zhezhi-curve-design',version:1,millimetersPerUnit:10,result:{flattening:{status:'computed',result:{
    sample:{rows:[{targetBase:[0,0]},{targetBase:[1,1]}]},
    grid:[{targetLeft:[[0,0],[0,1]],targetRight:[[0,0],[0,-1]]},{targetLeft:[[1,1],[1,2]],targetRight:[[1,1],[1,0]]}],
  }}}};
  const value={name:'安全预览',paper:{width:200,height:100},segments:[],objects:[]};
  const base=projectThumbnail(value),render=curveDesign=>projectThumbnail({...value,metadata:{curveDesign}});
  assert.match(render(design),/stroke="#008b9a"/);
  const broken=[null,[],{}, {format:'zhezhi-curve-design'},
    {...design,version:2},{...design,millimetersPerUnit:Infinity},{...design,millimetersPerUnit:0}];
  for(const mutate of [
    d=>{d.result.flattening.result=null;},
    d=>{d.result.flattening.result.sample.rows[0].targetBase=[NaN,0];},
    d=>{d.result.flattening.result.sample.rows[0].targetBase=['<image href="https://example.com"/>',0];},
    d=>{d.result.flattening.result.grid[0].targetLeft=[[0,0,1],[1,1,1]];},
    d=>{d.result.flattening.result.grid[1].targetRight[1]=[1,Infinity];},
    d=>{d.result.flattening.result.grid[1].targetRight.pop();},
    d=>{d.result.flattening.result.grid[0].targetLeft=Array.from({length:66},()=>[0,0]);},
    d=>{const flat=d.result.flattening.result;flat.sample.rows=Array.from({length:130},()=>flat.sample.rows[0]);flat.grid=Array.from({length:130},()=>flat.grid[0]);},
  ]){const damaged=structuredClone(design);mutate(damaged);broken.push(damaged);}
  for(const damaged of broken){const svg=render(damaged);assert.equal(svg,base);assert.doesNotMatch(svg,/script|https:|image|onload|NaN|Infinity/);}
  const large=structuredClone(design),flat=large.result.flattening.result;
  flat.sample.rows=Array.from({length:129},(_,i)=>({targetBase:[i,i/2]}));
  flat.grid=Array.from({length:129},(_,i)=>({targetLeft:Array.from({length:65},(_,j)=>[i,i/2+j/64]),targetRight:Array.from({length:65},(_,j)=>[i,i/2-j/64])}));
  const svg=render(large);assert.equal((svg.match(/<path /g)??[]).length,67);assert.ok(svg.length<120000);assert.doesNotMatch(svg,/NaN|Infinity/);
});
