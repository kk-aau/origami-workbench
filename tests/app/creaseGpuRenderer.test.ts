import {test} from 'node:test';
import assert from 'node:assert/strict';
import {packCreaseGpuScene,CreaseGpuRenderer,CREASE_GPU_STRIDE,creaseGpuHoverTitle,type CreaseGpuScene} from '../../src/components/creaseGpuRenderer';
import {defaultCreaseDisplay,DISPLAY_PIXEL_MM} from '../../src/app/creaseDisplay';
import {creaseLineStyle,LINE_STYLES} from '../../src/app/creaseLineStyle';
import type {Segment} from '../../src/core/types';
import {prepareCreaseGpuScene,prepareCreaseGpuPoints} from '../../src/components/creaseGpuScenePreparation';

const segment=(id:string,assignment:Segment['assignment'],y=0):Segment=>({id,assignment,a:[0,y],b:[100,y],angle:assignment==='M'?-180:assignment==='V'?180:0});
function scene():CreaseGpuScene{return {segments:[segment('m','M'),segment('a','A',1),segment('v','V',2),segment('b','B',3)],selected:new Set(['m']),diagnostic:new Set(['m']),hiddenId:null,main:true,auxiliary:true,display:defaultCreaseDisplay(),vertices:[[0,0],[100,0]]};}

test('GPU presentation preserves paint order, assignment, selection and original coordinates',()=>{
  const input=scene(),before=structuredClone(input),packed=packCreaseGpuScene(input);
  assert.equal(packed.count,4);assert.equal(packed.lines.length,4*CREASE_GPU_STRIDE);
  for(let i=0;i<4;i++){assert.equal(packed.lines[i*CREASE_GPU_STRIDE+1],i);assert.equal(packed.lines[i*CREASE_GPU_STRIDE+19],i===0?1:0);assert.equal(packed.lines[i*CREASE_GPU_STRIDE+20],i===0?1:0);}
  assert.deepEqual(input,before);
});

test('GPU filtering hides exactly the same authored layers and temporary trace',()=>{
  const input=scene();
  for(const [main,auxiliary,expected] of [[true,false,[0,2,3]],[false,true,[1]],[false,false,[]]] as const){
    const packed=packCreaseGpuScene({...input,main,auxiliary});
    assert.deepEqual(Array.from({length:packed.count},(_,i)=>packed.lines[i*CREASE_GPU_STRIDE+1]),expected);
  }
  assert.equal(packCreaseGpuScene({...input,hiddenId:'v'}).count,3);
});

test('all GPU base patterns and auxiliary colors derive from the existing SVG contract',()=>{
  for(const style of Object.keys(LINE_STYLES) as (keyof typeof LINE_STYLES)[])for(const assignment of ['M','V','B','A','U','F'] as const)for(const auxLineStyle of ['solid','dashed'] as const){
    const source={...segment('test',assignment),displayColor:'#123456'},input={...scene(),segments:[source],display:{...defaultCreaseDisplay(),lineStyle:style,auxLineStyle,auxLineWidth:3.5}};
    const packed=packCreaseGpuScene(input).lines,expected=creaseLineStyle(source,style,1,auxLineStyle),dash=expected.dash?.split(' ').map(Number)??[];
    assert.deepEqual(Array.from(packed.subarray(12,12+dash.length)),dash);
    assert.equal(packed[21],dash.length);assert.equal(packed[18],assignment==='A'?3.5:Math.fround(1.6));
    for(let i=0;i<3;i++)assert.ok(Math.abs(packed[8+i]-parseInt(expected.color.slice(1+i*2,3+i*2),16)/255)<1e-7);
  }
});

test('high/low GPU coordinates retain tiny features at large coordinate offsets',()=>{
  const s={...segment('tiny','M'),a:[1e8+.0123456789,-1e8+.0123456789],b:[1e8+.0123466789,-1e8+.0123466789]} as Segment;
  const values=packCreaseGpuScene({...scene(),segments:[s]}).lines;
  for(const [i,n] of [...s.a,...s.b].entries())assert.ok(Math.abs(values[i]+values[i+4]-n)<1e-8);
  assert.ok((values[2]-values[0])+(values[6]-values[4])>0);
  assert.throws(()=>packCreaseGpuScene({...scene(),segments:[{...s,a:[Infinity,0]}]}),/Invalid GPU coordinate/);
  assert.throws(()=>packCreaseGpuScene({...scene(),segments:[{...s,a:[1e200,0]}]}),/representable range/);
});

test('GPU short-line tooltip preserves assignment guidance, visibility and selection movement',()=>{
  const short={...segment('short','M'),b:[.1,0]} as Segment,input={...scene(),segments:[short],selected:new Set(['short'])};
  assert.match(creaseGpuHoverTitle(input,[.05,0],1,[0,0],true)!,/峰折.*放大/);
  assert.match(creaseGpuHoverTitle({...input,segments:[{...short,assignment:'V'}]},[.05,0],1,[0,0],true)!,/谷折/);
  assert.equal(creaseGpuHoverTitle(input,[.05,0],1,[0,0],false),undefined);
  assert.equal(creaseGpuHoverTitle({...input,main:false},[.05,0],1,[0,0],true),undefined);
  assert.equal(creaseGpuHoverTitle({...input,hiddenId:'short'},[.05,0],1,[0,0],true),undefined);
  assert.equal(creaseGpuHoverTitle(input,[.05,0],1,[100,100],true),undefined);
  assert.match(creaseGpuHoverTitle(input,[100.05,100],1,[100,100],true)!,/峰折/);
  assert.equal(creaseGpuHoverTitle(input,[.05,0],.0001,[0,0],true),undefined,'zoom restores complete pattern without a limited-line tooltip');
});

function fakeCanvas(){
  const calls:{name:string;args:unknown[]}[]=[],objects=new Set<object>();let lost=false;
  const enums={NO_ERROR:0,ARRAY_BUFFER:1,STATIC_DRAW:2,MAX_RENDERBUFFER_SIZE:3,VERTEX_SHADER:4,FRAGMENT_SHADER:5,COMPILE_STATUS:6,LINK_STATUS:7,TRIANGLES:8};
  const gl=new Proxy({...enums},{get(target,name){
    if(name in target)return target[name as keyof typeof target];
    if(name==='isContextLost')return ()=>lost;
    if(name==='getParameter')return ()=>16384;
    if(name==='getError')return ()=>0;
    if(name==='getShaderParameter'||name==='getProgramParameter')return ()=>true;
    if(typeof name==='string'&&name.startsWith('create'))return ()=>{const o={};objects.add(o);return o;};
    if(name==='getUniformLocation')return (_p:unknown,n:string)=>({name:n});
    return (...args:unknown[])=>{calls.push({name:String(name),args});if(String(name).startsWith('delete'))objects.delete(args[0] as object);};
  }}) as unknown as WebGL2RenderingContext;
  const canvas={getContext:()=>gl,width:0,height:0,dataset:{}} as unknown as HTMLCanvasElement;
  return {canvas,calls,objects,lose:()=>{lost=true;}};
}

test('camera navigation, drag and adaptive toggles never upload segment buffers',()=>{
  const old=Object.getOwnPropertyDescriptor(globalThis,'window');Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:2}});
  const fake=fakeCanvas(),renderer=new CreaseGpuRenderer(fake.canvas);
  try{
    renderer.setScene({...scene(),display:{...defaultCreaseDisplay(),pointSize:2}});
    assert.equal(fake.calls.filter(c=>c.name==='bufferData').length,2);
    for(let i=0;i<120;i++)renderer.draw({x:i/10,y:-i/10,w:200-i,h:150-i*.75},{w:800,h:600},[i/100,0],i%2===0,i%3===0);
    assert.equal(renderer.uploads,1);assert.equal(renderer.draws,120);
    assert.equal(fake.calls.filter(c=>c.name==='bufferData').length,2);
    assert.equal(fake.canvas.width,1600);assert.equal(fake.canvas.height,1200);
    assert.equal(fake.canvas.dataset.segmentCount,'4');
    renderer.setScene({...scene(),auxiliary:false});assert.equal(renderer.uploads,2);
    fake.lose();assert.throws(()=>renderer.draw({x:0,y:0,w:200,h:150},{w:800,h:600},[0,0],true,true),/context lost/);
  }finally{renderer.dispose();if(old)Object.defineProperty(globalThis,'window',old);else Reflect.deleteProperty(globalThis,'window');}
  assert.equal(fake.objects.size,0,'all owned GPU objects released on unmount/fallback');
});

test('unavailable WebGL signals the caller to retain SVG without touching CP data',()=>{
  assert.throws(()=>new CreaseGpuRenderer({getContext:()=>null} as unknown as HTMLCanvasElement),/WebGL2 unavailable/);
});

test('GPU hollow and solid point shapes share an outer size independent of line width and hide at zero',()=>{
  const old=Object.getOwnPropertyDescriptor(globalThis,'window');Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:1}});
  const fake=fakeCanvas(),renderer=new CreaseGpuRenderer(fake.canvas),base=scene(),before=structuredClone(base);
  const uniform=(name:string)=>fake.calls.filter(c=>c.name==='uniform1f'&&(c.args[0] as {name:string}).name===name).at(-1)?.args[1];
  const color=(name:string)=>fake.calls.filter(c=>c.name==='uniform3f'&&(c.args[0] as {name:string}).name===name).at(-1)?.args.slice(1);
  try{
    const pointFragment=fake.calls.filter(c=>c.name==='shaderSource').map(c=>String(c.args[1])).find(s=>s.includes('u_pointRound'))!;
    assert.match(pointFragment,/outer=coverage\(radius-u_radius\),inner=coverage\(radius-u_radius\+u_border\)/,'the ring occupies only the inside of the requested outer radius');
    assert.match(pointFragment,/u_pointFill\*inner\+u_pointStroke\*\(outer-inner\),outer/,'ring and center stay premultiplied through antialias edges');
    for(const pointStyle of ['hollow','circle','square'] as const)for(const lineWidth of [1,2.5,20]){
      renderer.setScene({...base,display:{...base.display,pointStyle,lineWidth,pointSize:4}});
      renderer.draw({x:0,y:0,w:200,h:150},{w:800,h:600},[0,0],true,true);
      assert.equal(uniform('u_radius'),4);
      assert.equal(uniform('u_pointRound'),pointStyle==='square'?0:1);
      assert.equal(uniform('u_border'),pointStyle==='hollow'?1.15:0);
      assert.deepEqual(color('u_pointFill'),(pointStyle==='hollow'?[255,254,251]:[0,0,0]).map(v=>v/255));
      assert.deepEqual(color('u_pointStroke'),(pointStyle==='hollow'?[90,115,101]:[0,0,0]).map(v=>v/255));
      const count=fake.calls.filter(c=>c.name==='bufferData').length;
      renderer.draw({x:0,y:0,w:800,h:600},{w:800,h:600},[0,0],true,true);
      assert.equal(uniform('u_radius'),4*DISPLAY_PIXEL_MM);
      assert.equal(uniform('u_border'),pointStyle==='hollow'?1.15*DISPLAY_PIXEL_MM:0);
      assert.equal(fake.calls.filter(c=>c.name==='bufferData').length,count,'zoom only changes uniforms');
    }
    for(const options of [{pointSize:0,main:true,showMarkers:true},{pointSize:4,main:false,showMarkers:true},{pointSize:4,main:true,showMarkers:false}]){
      renderer.setScene({...base,main:options.main,display:{...base.display,pointStyle:'circle',pointSize:options.pointSize}});
      const start=fake.calls.length;renderer.draw({x:0,y:0,w:200,h:150},{w:800,h:600},[0,0],true,options.showMarkers);
      assert.equal(fake.calls.slice(start).filter(c=>c.name==='drawArraysInstanced').length,1,'hidden points retain only the line draw');
    }
    assert.deepEqual(base,before);
  }finally{renderer.dispose();if(old)Object.defineProperty(globalThis,'window',old);else Reflect.deleteProperty(globalThis,'window');}
});

test('large uploads publish counts only after every bounded GPU buffer chunk completes',async()=>{
  const fake=fakeCanvas(),renderer=new CreaseGpuRenderer(fake.canvas),base=scene();
  const input={...base,segments:Array.from({length:50000},(_,index)=>({...base.segments[index%4],id:`full-${index}`})),vertices:Array.from({length:25000},(_,index)=>[index,index/2] as [number,number])};
  const packed=await prepareCreaseGpuScene(input);renderer.setScene(base);const uploads=renderer.uploads;renderer.clearScene();
  const start=fake.calls.length;let turns=0;
  try{
    const promise=renderer.setPackedSceneAsync(input,packed,{onBatch(){turns++;},onProgress(){assert.equal(fake.canvas.dataset.segmentCount,'0');assert.equal(renderer.uploads,uploads);}});
    renderer.draw({x:0,y:0,w:200,h:150},{w:800,h:600},[0,0],true,true);
    assert.equal(fake.canvas.dataset.segmentCount,'0');assert.equal(fake.canvas.dataset.sceneState,'uploading');await promise;
    const chunks=fake.calls.slice(start).filter(call=>call.name==='bufferSubData');assert.ok(chunks.length>4);assert.ok(chunks.every(call=>(call.args[2] as Float32Array).byteLength<=1024*1024));
    assert.equal(chunks.reduce((bytes,call)=>bytes+(call.args[2] as Float32Array).byteLength,0),packed.lines.byteLength+packed.points.byteLength);
    assert.ok(turns>1);assert.equal(fake.canvas.dataset.segmentCount,'50000');assert.equal(fake.canvas.dataset.sceneState,'ready');assert.equal(renderer.uploads,uploads+1);
  }finally{renderer.dispose();}assert.equal(fake.objects.size,0);
});

test('cancelled, superseded, disposed or failed uploads cannot publish their old geometry',async()=>{
  const base=scene(),input={...base,segments:Array.from({length:50000},(_,index)=>({...base.segments[index%4],id:`old-${index}`}))},packed=await prepareCreaseGpuScene(input);
  for(const cause of ['cancel','supersede','dispose','context']){
    const fake=fakeCanvas(),renderer=new CreaseGpuRenderer(fake.canvas),controller=new AbortController();let changed=false;
    try{
      const promise=renderer.setPackedSceneAsync(input,packed,{signal:controller.signal,onProgress(fraction){
        if(!fraction||changed)return;changed=true;if(cause==='cancel')controller.abort();if(cause==='supersede')renderer.setScene(base);if(cause==='dispose')renderer.dispose();if(cause==='context')fake.lose();
      }});
      await assert.rejects(promise,cause==='context'?/GPU upload failed/:{name:'AbortError'});
      assert.equal(fake.canvas.dataset.segmentCount,cause==='supersede'?'4':'0');assert.equal(renderer.uploads,cause==='supersede'?1:0);
    }finally{renderer.dispose();}assert.equal(fake.objects.size,0);
  }
});

test('late point discovery preserves ready lines and updates only the point GPU buffer',async()=>{
  const fake=fakeCanvas(),renderer=new CreaseGpuRenderer(fake.canvas),base=scene(),packed=packCreaseGpuScene(base);renderer.setPackedScene(base,packed);
  const next={...base,vertices:[...base.vertices,[20,30] as [number,number]]},points=await prepareCreaseGpuPoints(next.vertices),start=fake.calls.length;
  try{
    const promise=renderer.setPackedSceneAsync(next,{...packed,points});assert.equal(fake.canvas.dataset.segmentCount,'4');await promise;
    const calls=fake.calls.slice(start);assert.equal(calls.filter(call=>call.name==='bufferData').length,1);assert.equal(calls.filter(call=>call.name==='bufferSubData').reduce((bytes,call)=>bytes+(call.args[2] as Float32Array).byteLength,0),points.byteLength);
    assert.equal(renderer.lineUploads,1);assert.equal(renderer.uploads,2);assert.equal(fake.canvas.dataset.segmentCount,'4');
  }finally{renderer.dispose();}assert.equal(fake.objects.size,0);
});

