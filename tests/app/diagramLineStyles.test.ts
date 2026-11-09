import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {DIAGRAM_STROKE_PATTERNS,validateDiagramAnnotations,type DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {DIAGRAM_LINE_DEFAULTS_KEY,DIAGRAM_LINE_STYLES,defaultDiagramLineDefaults,diagramLineAppearance,diagramLineDasharray,readDiagramLineDefaults,saveDiagramLineDefaults,validateDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import {diagramAnnotationMarkup} from '../../src/app/diagramAnnotationSVG';
import {createDiagramProject,adoptDiagramPose,updateDiagramAnnotations,updateDiagramFoldLink,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {drawingSVG,diagramModelMarkup,diagramFoldPreviewAttributes,diagramFoldPreviewAppearanceSegments} from '../../src/app/diagramDrawing';
import {changeDiagramLineCategory,changeGlobalDiagramLineStyle} from '../../src/app/diagramLineStyles';
import {diagramPDFStepSVG} from '../../src/app/diagramPDF';
import {mapDiagramFoldLines,projectDiagramFoldCP} from '../../src/app/diagramFoldLink';
import {reconcileDiagramFoldAnnotations,refreshDiagramFoldDrawing} from '../../src/app/diagramFoldTransactions';
import {diagramCreaseCPEdges} from '../../src/app/diagramCreaseSelection';

const line=(patch:Partial<DiagramLineAnnotation>={}):DiagramLineAnnotation=>({id:'line',kind:'line',a:[0,30],b:[50,30],style:'valley',color:'#293d35',width:.7,...patch});
const settings={enabled:true,layers:'all' as const,selectedFaces:[]};
function fixture(){
  const doc=blankDoc('线条样式',100,100);doc.segments.push({id:'old-fold',a:[50,0],b:[50,100],assignment:'V',angle:180});
  let id=0,project=createDiagramProject(doc,()=>`line-style-${++id}`),stepId=project.activeStepId;
  const result=computeFlatFold(doc);assert.equal(result.geometry.status,'ready');
  project=adoptDiagramPose(project,stepId,project.states[0].id,result);
  project=updateDiagramFoldLink(project,stepId,settings);
  return {project,stepId,pose:project.steps[0].pose!,source:project.states[0]};
}

test('all five line categories own independently persisted appearance defaults',()=>{
  const defaults=defaultDiagramLineDefaults(),original=defaultDiagramLineDefaults();
  defaults.valley={color:'#a12b34',width:1.2,strokePattern:'solid'};
  defaults.boundary={color:'#167c6b',width:2.5,strokePattern:'dash-dot'};
  assert.deepEqual(defaults.mountain,original.mountain);assert.notEqual(defaults.mountain,defaults.auxiliary);
  const records=new Map<string,string>(),storage={getItem:(key:string)=>records.get(key)??null,setItem:(key:string,value:string)=>{records.set(key,value);}};
  saveDiagramLineDefaults(defaults,storage);
  const loaded=readDiagramLineDefaults(storage);assert.deepEqual(loaded,defaults);assert.notEqual(loaded.boundary,defaults.boundary);
  loaded.boundary.color='#ffffff';assert.deepEqual(readDiagramLineDefaults(storage),defaults);
  assert.equal(JSON.parse(records.get(DIAGRAM_LINE_DEFAULTS_KEY)!).version,1);
  for(const bad of [null,{},[],{...defaults,valley:{...defaults.valley,width:0}},{...defaults,mountain:{...defaults.mountain,color:'red'}},{...defaults,crease:{...defaults.crease,strokePattern:'hidden'}}])assert.throws(()=>validateDiagramLineDefaults(bad));
  for(const raw of ['{','null','{"version":2}','{"version":1,"settings":{}}'])assert.deepEqual(readDiagramLineDefaults({getItem:()=>raw}),original);
});

test('legacy line paint remains unchanged while every category accepts an independent visual pattern',()=>{
  assert.equal(diagramLineDasharray('valley',1),'7 4');assert.equal(diagramLineDasharray('mountain',1),'9 3 1 3');
  assert.equal(diagramLineDasharray('auxiliary',1),'1 4');assert.equal(diagramLineDasharray('crease',1),undefined);assert.equal(diagramLineDasharray('boundary',1),undefined);
  for(const style of DIAGRAM_LINE_STYLES)for(const strokePattern of DIAGRAM_STROKE_PATTERNS){
    const mark=line({style,strokePattern,color:'#9b3158',width:2}),markup=diagramAnnotationMarkup(mark);
    assert.match(markup,/stroke="#9b3158" stroke-width="2"/);
    const dash=diagramLineDasharray(style,2,strokePattern);
    if(dash)assert.ok(markup.includes(`stroke-dasharray="${dash}"`));else assert.doesNotMatch(markup,/stroke-dasharray/);
    assert.deepEqual(diagramLineAppearance(mark),{color:'#9b3158',width:2,strokePattern});
  }
  assert.deepEqual(diagramLineAppearance(line()),{color:'#293d35',width:.7,strokePattern:'dashed'});
  assert.doesNotThrow(()=>validateDiagramAnnotations([line()]));
  for(const strokePattern of [undefined,null,'dash',1,{},[]])assert.throws(()=>validateDiagramAnnotations([line({strokePattern:strokePattern as never})]));
  assert.throws(()=>validateDiagramAnnotations([line({style:'boundary',foldAction:'precrease'})]));
});

test('boundary appearance roundtrips through drawings and SVG/PDF export without changing paper or CP',()=>{
  const {project,stepId}=fixture(),boundary=line({id:'boundary',style:'boundary',color:'#8d2d6b',width:2,strokePattern:'dash-dot'});
  const drawn=reconcileDiagramFoldAnnotations(project,stepId,[boundary]),loaded=importDiagramProject(exportDiagramProject(drawn));
  assert.deepEqual(drawn.states,project.states);assert.deepEqual(drawn.steps[0].pose,project.steps[0].pose);
  assert.deepEqual(loaded.steps[0].annotations,[boundary]);
  const svg=drawingSVG(loaded.steps[0].pose!,loaded.steps[0].annotations!,'','',[],[],true,undefined,[],undefined,{enabled:false}),pdf=diagramPDFStepSVG(loaded,loaded.steps[0],undefined,undefined,false);
  for(const markup of [svg,pdf])assert.match(markup,/<line[^>]+stroke="#8d2d6b" stroke-width="2"[^>]+stroke-dasharray="18 6 2 6"/);
});

test('global boundary color updates real paper outlines in main drawing, SVG and PDF',()=>{
  const {project,pose}=fixture(),before=JSON.stringify(project),palette=changeGlobalDiagramLineStyle(defaultDiagramLineDefaults(),'boundary',{color:'#bc3262'});
  for(const markup of [diagramModelMarkup(pose,undefined,false,[],palette),drawingSVG(pose,[],'','',undefined,[],true,palette),diagramPDFStepSVG(project,project.steps[0],undefined,palette)]){
    assert.match(markup,/stroke="#bc3262"[^>]+data-diagram-paper-face=/);
  }
  assert.equal(JSON.stringify(project),before);
  const legacy={...pose,view:{...pose.view!,colors:{front:'#ffffff',back:'#225588',line:'#357928'}}};
  assert.match(diagramModelMarkup(legacy,undefined,false,[],defaultDiagramLineDefaults()),/stroke="#357928"/);
});

test('visible folded-paper boundaries are repainted above existing drawn lines in export',()=>{
  const {pose}=fixture(),palette=changeGlobalDiagramLineStyle(defaultDiagramLineDefaults(),'boundary',{color:'#bc3262'});
  const svg=drawingSVG(pose,[line({id:'cover',a:[0,0],b:[100,100],style:'auxiliary',color:'#173b72',width:4})],'','',[],[],true,palette);
  const ink=svg.lastIndexOf('stroke="#173b72"'),boundary=svg.lastIndexOf('data-diagram-top-boundary="true"');
  assert.ok(ink>=0&&boundary>ink,'visible boundaries must paint after the drawn line');
  assert.match(svg,/<line data-diagram-top-boundary="true"[^>]+stroke="#bc3262"/);
  assert.doesNotMatch(drawingSVG(pose,[],'','',[],[],true,palette),/data-diagram-top-boundary/);
});

test('drawn boundaries never generate or highlight physical CP crease routes',()=>{
  const {project,stepId,pose,source}=fixture(),folded=reconcileDiagramFoldAnnotations(project,stepId,[line()]),after=folded.states.find(state=>state.id===folded.steps[0].afterId)!;
  const boundary=line({style:'boundary'}),mapped=mapDiagramFoldLines(pose,[boundary],settings,source);
  assert.deepEqual(mapped.segments,[]);assert.deepEqual(mapped.preview,[]);assert.deepEqual(mapped.precreases,[]);
  assert.ok(diagramCreaseCPEdges(pose,[line()],settings,after,source).length>0);
  assert.deepEqual(diagramCreaseCPEdges(pose,[boundary],settings,after,source),[]);
});

test('custom patterns survive linked crease projection, refresh and SVG/PDF export',()=>{
  const {project,stepId}=fixture(),mark=line({color:'#972b53',width:2,strokePattern:'dotted'});
  const linked=reconcileDiagramFoldAnnotations(project,stepId,[mark]),refreshed=refreshDiagramFoldDrawing(linked,stepId),step=refreshed.steps[0];
  const before=refreshed.states.find(state=>state.id===step.beforeId)!,after=refreshed.states.find(state=>state.id===step.afterId)!;
  assert.deepEqual(refreshed.states,linked.states);
  const lines=step.annotations!.filter((item):item is DiagramLineAnnotation=>item.kind==='line'&&item.style==='valley');
  assert.ok(lines.length);assert.ok(lines.every(item=>item.color===mark.color&&item.width===mark.width&&item.strokePattern==='dotted'));
  const preview=projectDiagramFoldCP(step.pose!,before.doc,after.doc,before).preview;
  assert.ok(preview.length);assert.equal(diagramFoldPreviewAttributes(preview[0],step.annotations!,'#333333').strokePattern,'dotted');
  for(const markup of [drawingSVG(step.pose!,step.annotations!,'','',preview),diagramPDFStepSVG(refreshed,step)])assert.match(markup,/<line[^>]+stroke="#972b53" stroke-width="2"[^>]+stroke-dasharray="2 8"/);
  const saved=importDiagramProject(exportDiagramProject(updateDiagramAnnotations(refreshed,stepId,step.annotations!)));
  assert.deepEqual(saved.steps[0].annotations,step.annotations);
});

test('CP-authored existing crease styles survive refresh while retaining their physical identity',()=>{
  const doc=blankDoc('已有折痕样式',100,100);doc.segments.push({id:'existing',a:[50,0],b:[50,100],assignment:'F',angle:0});
  let id=0,project=createDiagramProject(doc,()=>`existing-style-${++id}`);const stepId=project.activeStepId;
  const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});assert.equal(result.geometry.status,'ready');
  project=updateDiagramFoldLink(adoptDiagramPose(project,stepId,project.states[0].id,result),stepId,settings);
  const projected=refreshDiagramFoldDrawing(project,stepId),original=projected.steps[0].annotations!;
  assert.ok(original.some(item=>item.id.startsWith('cp-existing:')));
  const painted=updateDiagramAnnotations(projected,stepId,original.map(item=>item.kind==='line'?{...item,color:'#1b6792',width:1.5,strokePattern:'dashed'}:item));
  const refreshed=refreshDiagramFoldDrawing(painted,stepId),step=refreshed.steps[0];
  assert.deepEqual(refreshed.states,projected.states);
  assert.ok(step.annotations!.every(item=>item.kind==='line'&&item.id.startsWith('cp-existing:')&&item.style==='crease'&&item.strokePattern==='dashed'));
  assert.match(diagramPDFStepSVG(refreshed,step),/<g opacity="0\.55"><line[^>]+stroke="#1b6792" stroke-width="1\.5"[^>]+stroke-dasharray="10\.5 6"/);
});

test('converting generated F marks to fold instructions replaces their automatic faded paint',()=>{
  const defaults=defaultDiagramLineDefaults(),mark=line({id:'cp-existing:step:0',style:'crease',color:'#8d9b92',width:.45}),saved=structuredClone(mark);
  for(const style of ['mountain','valley'] as const){
    const converted=changeDiagramLineCategory(mark,style,defaults);
    assert.deepEqual(diagramLineAppearance(converted),diagramLineAppearance(line({style,...defaults[style]})));
    assert.deepEqual({a:converted.a,b:converted.b,id:converted.id},{a:mark.a,b:mark.b,id:mark.id});
  }
  assert.deepEqual(mark,saved);
  const authoredGray=changeDiagramLineCategory({...mark,id:'authored-mark'},'mountain',defaults);
  assert.equal(authoredGray.color,mark.color);assert.equal(authoredGray.width,mark.width);
});

test('category changes preserve explicit overrides and non-default authored paint',()=>{
  const defaults=defaultDiagramLineDefaults(),mark=line({id:'cp-existing:step:0',style:'crease',color:'#8d9b92',width:.45,strokePattern:'solid',appearanceOverrides:['color','width','strokePattern']});
  assert.deepEqual(diagramLineAppearance(changeDiagramLineCategory(mark,'mountain',defaults)),diagramLineAppearance(mark));
  const custom=line({id:mark.id,style:'crease',color:'#ab2255',width:1.4,strokePattern:'dotted'});
  assert.deepEqual(diagramLineAppearance(changeDiagramLineCategory(custom,'valley',defaults)),diagramLineAppearance(custom));
  const partial=changeDiagramLineCategory({...mark,appearanceOverrides:['color']},'mountain',defaults);
  assert.equal(partial.color,'#8d9b92');assert.equal(partial.width,.7);assert.equal(partial.strokePattern,'dash-dot');
});

test('category defaults follow the target custom palette while per-line fields remain independent',()=>{
  let defaults=changeGlobalDiagramLineStyle(defaultDiagramLineDefaults(),'crease',{color:'#123456',width:.9,strokePattern:'dotted'});
  defaults=changeGlobalDiagramLineStyle(defaults,'mountain',{color:'#654321',width:1.1,strokePattern:'dashed'});
  for(const mark of [line({style:'crease',...defaults.crease}),line({style:'crease',...defaultDiagramLineDefaults().crease}),line({id:'cp-existing:step:0',style:'crease',color:'#8d9b92',width:.45})]){
    assert.deepEqual(diagramLineAppearance(changeDiagramLineCategory(mark,'mountain',defaults)),{color:'#654321',width:1.1,strokePattern:'dashed'});
  }
  const fold=line({style:'valley',strokePattern:'dashed'}),mountain=changeDiagramLineCategory(fold,'mountain',defaultDiagramLineDefaults());
  assert.equal(mountain.strokePattern,'dash-dot');assert.equal(changeDiagramLineCategory(mountain,'valley',defaultDiagramLineDefaults()).strokePattern,'dashed');
  assert.equal(changeDiagramLineCategory({...fold,strokePattern:'dotted'},'mountain',defaults).strokePattern,'dotted');
});

test('overlapping linked strokes use latest paint on their own material face',()=>{
  const old=line({style:'mountain',color:'#8d9b92',width:.45,foldFaces:[0]}),fresh=line({id:'fresh',style:'mountain',color:'#293d35',width:.7,strokePattern:'dash-dot',foldFaces:[0]});
  const segment={a:old.a,b:old.b,face:0,assignment:'M' as const,visibility:'visible' as const};
  assert.deepEqual(diagramFoldPreviewAttributes(segment,[old,fresh],'#000000'),{color:fresh.color,width:.7,strokePattern:'dash-dot',opacity:1});
  const otherFace={...fresh,id:'other-face',color:'#ff0000',foldFaces:[1]},unbound={...fresh,id:'unbound',color:'#00ff00',foldFaces:undefined};
  assert.equal(diagramFoldPreviewAttributes(segment,[old,fresh,otherFace,unbound],'#000000').color,fresh.color);
  assert.equal(diagramFoldPreviewAttributes({...segment,face:1},[old,fresh,otherFace,unbound],'#000000').color,otherFace.color);
  assert.equal(diagramFoldPreviewAttributes({...segment,face:2},[unbound,{...unbound,color:'#123456'}],'#000000').color,'#123456');
});

test('partially redrawn linked creases retain old paint outside the newer stroke',()=>{
  const doc=blankDoc('局部重画样式',100,100);let id=0,project=createDiagramProject(doc,()=>`overpaint-${++id}`);const stepId=project.activeStepId;
  project=updateDiagramFoldLink(adoptDiagramPose(project,stepId,project.states[0].id,computeFlatFold(doc)),stepId,settings);
  const old=line({id:'older',a:[5,5],b:[95,95],style:'mountain',color:'#8d9b92',width:.45,strokePattern:'dash-dot'}),fresh=line({id:'newer',a:[20,20],b:[80,80],style:'mountain',color:'#293d35',width:.7,strokePattern:'dash-dot'});
  project=reconcileDiagramFoldAnnotations(project,stepId,[old]);
  project=reconcileDiagramFoldAnnotations(project,stepId,[...project.steps[0].annotations!,fresh]);
  const step=project.steps[0],before=project.states.find(s=>s.id===step.beforeId)!,after=project.states.find(s=>s.id===step.afterId)!;
  const physicalPreview=projectDiagramFoldCP(step.pose!,before.doc,after.doc,before).preview.filter(part=>part.assignment==='M');
  assert.equal(physicalPreview.length,1); // CP geometry stays merged; only the ink is divided.
  const preview=diagramFoldPreviewAppearanceSegments(physicalPreview,step.annotations!);
  assert.equal(preview.length,3);
  for(const part of preview){const paint=diagramFoldPreviewAttributes(part,step.annotations!,'#000000'),middle=(part.a[0]+part.b[0])/2,expected=middle>20&&middle<80?fresh:old;
    assert.equal(part.visibility,'visible');assert.equal(paint.color,expected.color);assert.equal(paint.width,expected.width);
  }
  assert.equal(preview[1].strokeSpan!.offset,Math.hypot(15,15));
  assert.equal(preview[2].strokeSpan!.length,physicalPreview[0].strokeSpan!.length);
  const refreshed=refreshDiagramFoldDrawing(project,stepId),refreshedLines=refreshed.steps[0].annotations!.filter((a):a is DiagramLineAnnotation=>a.kind==='line'&&a.style==='mountain');
  assert.equal(refreshedLines.length,3);
  assert.equal(refreshedLines.find(a=>Math.abs(a.a[0]-20)<1e-7&&Math.abs(a.b[0]-80)<1e-7)?.color,fresh.color);
  assert.deepEqual(refreshed.states,project.states);
  const svg=drawingSVG(step.pose!,step.annotations!,'','',physicalPreview);
  assert.equal(svg.match(/<line[^>]+stroke="#293d35" stroke-width="0\.7"/g)?.length,1);
  assert.equal(svg.match(/<line[^>]+stroke="#8d9b92" stroke-width="0\.45"/g)?.length,2);
});
