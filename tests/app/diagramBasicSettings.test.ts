import test from 'node:test';
import assert from 'node:assert/strict';
import {applyDiagramBasicSettings,canChangeDiagramBasicPaper,defaultDiagramBasicSettings,diagramBasicPaperDoc,ensureDiagramBasicSettings,initializeDiagramBasicPaper,normalizeDiagramBasicSettings,readDiagramBasicSettings} from '../../src/app/diagramBasicSettings';
import {createDiagramProject,exportDiagramProject,importDiagramProject,appendDiagramStep,getDiagramStepInitialView} from '../../src/app/diagramProject';
import {defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import {setPreferenceService} from '../../src/app/preferenceStorage';
import {diagramPDFStepSVG} from '../../src/app/diagramPDF';
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
