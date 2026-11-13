import test from 'node:test';
import assert from 'node:assert/strict';
import {applyDiagramBasicSettings,canChangeDiagramBasicPaper,defaultDiagramBasicSettings,diagramBasicPaperDoc,diagramBasicPaperFromRatio,diagramCustomPaperDoc,diagramPolygonPaperDoc,ensureDiagramBasicSettings,initializeDiagramBasicPaper,normalizeDiagramBasicSettings,readDiagramBasicSettings} from '../../src/app/diagramBasicSettings';
import {createDiagramProject,exportDiagramProject,importDiagramProject,appendDiagramStep,getDiagramStepInitialView} from '../../src/app/diagramProject';
import {defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import {setPreferenceService} from '../../src/app/preferenceStorage';
import {diagramPDFStepSVG} from '../../src/app/diagramPDF';
import {blankDoc} from '../../src/app/state';
import {paperPath} from '../../src/app/paper';
import type {Point,Segment} from '../../src/core/types';
const create=(shape:'square'|'rectangle'|'triangle'|'regular'='square')=>{const s=defaultDiagramBasicSettings(240,180);s.paper.shape=shape;return initializeDiagramBasicPaper(createDiagramProject(diagramBasicPaperDoc('测试绘图',s)),s);};
test('all selectable shapes are real solved single paper sheets; regular sides stay equal and dimensions are normalized',()=>{
 for(const shape of ['square','rectangle','triangle','regular'] as const){const p=create(shape),pose=p.steps[0].pose!;assert.equal(pose.result.geometry.status,'ready');assert.equal(pose.result.layers.status,'solved');assert.equal(pose.result.geometry.faces.length,1);assert.ok(p.basicSettings);const lines=p.states[0].doc.segments;
 if(shape==='triangle'||shape==='regular'){const lengths=lines.map(s=>Math.hypot(s.a[0]-s.b[0],s.a[1]-s.b[1]));assert.ok(lengths.every(n=>Math.abs(n-lengths[0])<1e-8));}assert.doesNotThrow(()=>importDiagramProject(exportDiagramProject(p)));}
 assert.equal(create().basicSettings!.paper.height,240);assert.equal(create('rectangle').basicSettings!.paper.height,180);
});
test('appearance and adaptive settings roundtrip in their project, without writing or reading later shared preferences',()=>{
 const values=new Map<string,string>();setPreferenceService({getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)});
 try{const a=create(),b=create();const settings=readDiagramBasicSettings(a);settings.colors.front='#abcdef';settings.colors.back='#654321';settings.lineDefaults.valley.color='#123456';settings.lineDefaults.valley.strokePattern='dotted';settings.adaptiveLines=false;const changed=applyDiagramBasicSettings(a,'自己的图',settings),copy=importDiagramProject(exportDiagramProject(changed));assert.equal(copy.basicSettings!.colors.front,'#abcdef');assert.equal(copy.basicSettings!.lineDefaults.valley.color,'#123456');assert.equal(copy.steps[0].pose!.view!.colors!.back,'#654321');assert.equal(b.basicSettings!.colors.front,'#c5dac2');assert.equal(values.size,0);
 const line={id:'test-line',kind:'line' as const,style:'valley' as const,a:[0,0] as [number,number],b:[240,240] as [number,number],color:'#293d35',width:.7};changed.steps[0].annotations=[line];changed.steps[0].foldLink!.enabled=false;assert.match(diagramPDFStepSVG(changed,changed.steps[0]),/#123456/);
 const next=appendDiagramStep(changed);assert.equal(getDiagramStepInitialView(next,next.activeStepId).colors!.front,'#abcdef');}finally{setPreferenceService(undefined);}
});
test('appearance preserves CP geometry, and the paper can only be rebuilt before drawing begins',()=>{
 const p=create(),settings=readDiagramBasicSettings(p);settings.colors.back='#112233';const painted=applyDiagramBasicSettings(p,p.name,settings);assert.equal(painted.states,p.states);assert.equal(painted.steps[0].pose!.result,p.steps[0].pose!.result);assert.equal(canChangeDiagramBasicPaper(p),true);
 const resized=structuredClone(settings);resized.paper.width=300;const next=applyDiagramBasicSettings(p,p.name,resized);assert.equal(next.states[0].doc.paper.width,300);assert.equal(next.steps[0].pose!.sourceRevision,next.states[0].revision);assert.doesNotThrow(()=>exportDiagramProject(next));p.steps[0].annotations=[{id:'text',kind:'line',style:'auxiliary',a:[10,10],b:[20,20],width:.7,color:'#123456'}];assert.equal(canChangeDiagramBasicPaper(p),false);assert.throws(()=>applyDiagramBasicSettings(p,p.name,resized),/不能直接替换/);
 const legacy=create();delete legacy.steps[0].canvas;assert.doesNotThrow(()=>exportDiagramProject(applyDiagramBasicSettings(legacy,legacy.name,resized)),'legacy sheets without canvas settings still resize into a valid project');
});
test('legacy custom boundaries are retained; malformed basic information is rejected on import',()=>{
 const p=create('triangle');delete p.basicSettings;const lines=p.states[0].doc.segments,legacy=ensureDiagramBasicSettings(p,defaultDiagramLineDefaults(),false);assert.equal(legacy.basicSettings!.paper.shape,'custom');assert.equal(legacy.states[0].doc.segments,lines);assert.equal(legacy.basicSettings!.adaptiveLines,false);const malformed=JSON.parse(exportDiagramProject(legacy));malformed.basicSettings.colors.front='invalid';assert.throws(()=>importDiagramProject(JSON.stringify(malformed)),/RGB/);const bad=defaultDiagramBasicSettings();bad.paper.width=-1;assert.throws(()=>normalizeDiagramBasicSettings(bad),/尺寸/);
});
test('new paper proportions create the same geometry regardless of the ratio scale',()=>{
 const input=defaultDiagramBasicSettings(100,200),before=structuredClone(input),created=diagramBasicPaperFromRatio('比例纸张',input);
 for(const [width,height] of [[1,2],[2,4],[100,200],[1000,2000]]){
  const next=diagramBasicPaperFromRatio('比例纸张',defaultDiagramBasicSettings(width,height));
  assert.deepEqual(next.doc.paper,{width:100,height:200});
  assert.deepEqual(next.doc.segments.map(({a,b})=>({a,b})),created.doc.segments.map(({a,b})=>({a,b})));
  assert.deepEqual(next.settings.paper,created.settings.paper);
 }
 assert.deepEqual(diagramBasicPaperFromRatio('横向纸张',defaultDiagramBasicSettings(2,1)).doc.paper,{width:200,height:100});
 assert.deepEqual(input,before);
 for(const shape of ['square','triangle','regular'] as const){
  const a=defaultDiagramBasicSettings(1,1),b=defaultDiagramBasicSettings(100,100);a.paper.shape=shape;b.paper.shape=shape;
  const first=diagramBasicPaperFromRatio('固定比例',a),second=diagramBasicPaperFromRatio('固定比例',b);
  assert.ok(Math.abs(Math.max(first.doc.paper.width,first.doc.paper.height)-200)<1e-9);
  assert.ok(Math.abs(first.doc.paper.width-second.doc.paper.width)<1e-9&&Math.abs(first.doc.paper.height-second.doc.paper.height)<1e-9);
  const p=initializeDiagramBasicPaper(createDiagramProject(first.doc),first.settings);assert.equal(p.steps[0].pose!.result.layers.status,'solved');
 }
 for(const invalid of [0,-1,NaN,Infinity])assert.throws(()=>diagramBasicPaperFromRatio('错误比例',defaultDiagramBasicSettings(invalid,2)),/尺寸/);
 const legacy=create('rectangle'),appearance=readDiagramBasicSettings(legacy);appearance.colors.front='#123456';
 const painted=applyDiagramBasicSettings(legacy,legacy.name,appearance);assert.equal(painted.states,legacy.states);assert.deepEqual(painted.states[0].doc.paper,{width:240,height:180});
});
const boundary=(points:Point[],prefix:string):Segment[]=>points.map((a,i)=>({id:prefix+i,a,b:points[(i+1)%points.length],assignment:'B',angle:0}));
test('custom paper copies the real concave boundary and hole without source artwork or metadata',()=>{
 const source=blankDoc('原工程',800,600);source.segments=[...boundary([[-40,-20],[60,-20],[60,20],[0,20],[0,80],[-40,80]],'outer'),...boundary([[-30,0],[-10,0],[-10,20],[-30,20]],'hole'),{id:'crease',a:[-40,0],b:[60,0],assignment:'V',angle:180},{id:'outside',a:[1000,1000],b:[2000,2000],assignment:'A',angle:0}];
 source.objects=[{id:'text',kind:'text',position:[1000,1000],text:'不带入绘图',fontSize:12,color:'#123456'}];
 source.background={name:'参考图',dataUrl:'data:image/png;base64,iVBORw0KGgo=',width:1,height:1,opacity:1,visible:true,placement:{origin:[0,0],axis:[1,0]}};
 source.metadata={note:'不带入新纸张'};const before=structuredClone(source),doc=diagramCustomPaperDoc('自定义纸张',source);
 assert.deepEqual(source,before);assert.equal(doc.name,'自定义纸张');assert.deepEqual(doc.paper,{width:100,height:100});assert.equal(doc.segments.length,10);assert.ok(doc.segments.every(s=>s.assignment==='B'&&s.angle===0));assert.deepEqual(doc.objects,[]);assert.equal(doc.background,undefined);assert.equal(doc.metadata,undefined);
 assert.deepEqual(doc.segments.slice(0,6).map(s=>s.a),[[0,0],[100,0],[100,40],[40,40],[40,100],[0,100]]);
 assert.equal((paperPath(doc).match(/Z/g)??[]).length,2);
 const settings=defaultDiagramBasicSettings(doc.paper.width,doc.paper.height);settings.paper.shape='custom';
 const project=initializeDiagramBasicPaper(createDiagramProject(doc),settings),result=project.steps[0].pose!.result;
 assert.equal(result.geometry.status,'ready');assert.equal(result.layers.status,'solved');assert.equal(result.geometry.faces.length,1);assert.equal(result.geometry.graph!.faces_holes![0].length,1);
 assert.equal(importDiagramProject(exportDiagramProject(project)).basicSettings!.paper.shape,'custom');
});
test('custom paper rejects missing, open, self-crossing and degenerate boundaries without inventing a rectangle',()=>{
 const square=boundary([[0,0],[100,0],[100,100],[0,100]],'square');
 for(const segments of [[],square.slice(0,3),boundary([[0,0],[100,100],[0,100],[100,0]],'cross'),boundary([[0,0],[50,0],[100,0]],'flat')]){
  const source=blankDoc('未闭合',100,100);source.segments=segments;const before=structuredClone(source);
  assert.throws(()=>diagramCustomPaperDoc('不能创建',source),/闭合边界/);assert.deepEqual(source,before);
 }
});
test('manual polygon proportions retain concave corners and accept shifted negative coordinates',()=>{
 const vertices:Point[]=[[-1,-1],[3,-1],[3,0],[0,0],[0,3],[-1,3]],before=structuredClone(vertices),doc=diagramPolygonPaperDoc('凹多边形',vertices);
 assert.deepEqual(vertices,before);assert.deepEqual(doc.paper,{width:200,height:200});assert.equal(doc.segments.length,6);
 for(const [index,expected] of ([[0,0],[200,0],[200,50],[50,50],[50,200],[0,200]] as Point[]).entries())assert.ok(Math.hypot(doc.segments[index].a[0]-expected[0],doc.segments[index].a[1]-expected[1])<1e-9);
 const closed=diagramPolygonPaperDoc('重复闭合点',[...vertices,[...vertices[0]]]);assert.equal(closed.segments.length,6);
 const huge=diagramPolygonPaperDoc('有限比例',[[-1e308,-1e308],[1e308,-1e308],[1e308,0],[-1e308,0]]);assert.deepEqual(huge.paper,{width:200,height:100});
 const settings=defaultDiagramBasicSettings(doc.paper.width,doc.paper.height);settings.paper.shape='custom';const project=initializeDiagramBasicPaper(createDiagramProject(doc),settings);
 assert.equal(project.steps[0].pose!.result.geometry.faces[0].length,6);assert.equal(project.steps[0].pose!.result.layers.status,'solved');
});
test('manual polygons reject insufficient or nonfinite vertices, crossings and zero area',()=>{
 for(const vertices of [[],[[0,0],[1,1]],[[0,0],[1,0],[NaN,1]],[[0,0],[1,0],[1,Infinity]],[[0,0],[2,2],[0,2],[2,0]],[[0,0],[1,1],[2,2]],[[1,1],[1,1],[1,1]]] as Point[][])assert.throws(()=>diagramPolygonPaperDoc('无效多边形',vertices),/顶点|闭合边界/);
});
test('custom boundary settings retain the document size limit through initialisation and roundtrip',()=>{
 const source=blankDoc('大纸张',1_000_000,500_000);source.segments=boundary([[-500_000,-250_000],[500_000,-250_000],[500_000,250_000],[-500_000,250_000]],'large');
 const doc=diagramCustomPaperDoc('大边界',source),settings=defaultDiagramBasicSettings(doc.paper.width,doc.paper.height);settings.paper.shape='custom';
 const project=initializeDiagramBasicPaper(createDiagramProject(doc),settings),reopened=importDiagramProject(exportDiagramProject(project));
 assert.equal(project.steps[0].pose!.result.layers.status,'solved');assert.deepEqual(reopened.states[0].doc.paper,{width:1_000_000,height:500_000});assert.deepEqual(reopened.basicSettings!.paper,settings.paper);
 assert.throws(()=>normalizeDiagramBasicSettings(defaultDiagramBasicSettings(100_001,50_000)),/尺寸/,'non-custom inputs retain their existing bound');
 const tooWide=blankDoc('坐标跨度超限',1_000_000,100);tooWide.segments=boundary([[-1_000_000,0],[1_000_000,0],[1_000_000,100],[-1_000_000,100]],'span');
 assert.throws(()=>diagramCustomPaperDoc('超限',tooWide),/纸张宽高/,'individually valid coordinates cannot create a document wider than 1000000');
});
