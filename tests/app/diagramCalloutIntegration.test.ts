import {test} from 'node:test';
import assert from 'node:assert/strict';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {defaultCreaseDisplay} from '../../src/app/creaseDisplay';
import {defaultModelView} from '../../src/app/modelViewState';
import {changeGlobalDiagramLineStyle,defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import {diagramDrawingFrame,drawingSVG} from '../../src/app/diagramDrawing';
import {diagramPDFDrawingLayout} from '../../src/app/diagramPDFDrawing';
import {diagramPDFStepSVG} from '../../src/app/diagramPDF';
import {diagramCalloutCPMarkup,diagramCalloutsSVG} from '../../src/app/diagramCalloutSVG';
import {diagramCalloutLocator,type DiagramCallout} from '../../src/app/diagramCallouts';
import {createDiagramProject,adoptDiagramPose,updateDiagramAnnotations,updateDiagramCallouts,updateDiagramCP,exportDiagramProject,importDiagramProject,type DiagramProject} from '../../src/app/diagramProject';

function fixture(){
  const doc=blankDoc('圆形插图集成',100,100);let id=0,project=createDiagramProject(doc,()=>`callout-integration-${++id}`);
  project=adoptDiagramPose(project,project.activeStepId,project.steps[0].beforeId,computeFlatFold(doc),defaultModelView());
  project=updateDiagramAnnotations(project,project.activeStepId,[{id:'teaching-line',kind:'line',a:[10,20],b:[40,20],style:'valley',color:'#123456',width:.7,foldFaces:[]}]);
  const callouts:DiagramCallout[]=[
    {id:'paper-detail',source:{kind:'paper',center:[25,20],radius:15},target:{center:[-280,140],radius:70}},
    {id:'cp-before',source:{kind:'cp',stateId:project.steps[0].beforeId,center:[50,40],radius:20},target:{center:[250,90],radius:45}},
    {id:'cp-after',source:{kind:'cp',stateId:project.steps[0].afterId,center:[50,40],radius:20},target:{center:[480,-120],radius:55}},
  ];
  return updateDiagramCallouts(project,project.activeStepId,callouts);
}
const cpMarkup=(project:DiagramProject)=>(stateId:string)=>diagramCalloutCPMarkup(project.states.find(state=>state.id===stateId)!.doc,defaultCreaseDisplay());
function drawing(project:DiagramProject,palette=defaultDiagramLineDefaults()){
  const step=project.steps[0];return drawingSVG(step.pose,step.annotations??[],'标题','说明',undefined,step.images,step.paperVisible,palette,step.callouts,cpMarkup(project));
}
type Node=Record<string,unknown>;
function insetNodes(svg:string):Map<string,Node>{
  assert.equal(XMLValidator.validate(svg),true);const result=new Map<string,Node>();
  function walk(value:unknown){
    if(Array.isArray(value)){value.forEach(walk);return;}
    if(value&&typeof value==='object'){
      const node=value as Node,id=node['@_data-diagram-callout'];if(typeof id==='string')result.set(id,node);
      Object.values(node).forEach(walk);
    }
  }
  walk(new XMLParser({ignoreAttributes:false}).parse(svg));return result;
}
function viewBox(svg:string){const match=/\bviewBox="([^"]+)"/.exec(svg);assert.ok(match);const [x,y,width,height]=match[1].split(/\s+/).map(Number);return {x,y,width,height};}
function contains(frame:{x:number;y:number;width:number;height:number},center:readonly number[],radius:number){
  assert.ok(frame.x<=center[0]-radius&&frame.y<=center[1]-radius&&frame.x+frame.width>=center[0]+radius&&frame.y+frame.height>=center[1]+radius,JSON.stringify({frame,center,radius}));
}

test('paper and both CP insets reach drawing SVG and PDF as actual artwork with all external target circles inside the frame',()=>{
  const project=fixture(),step=project.steps[0],snapshot=structuredClone(project),frame=diagramDrawingFrame(step.pose,step.annotations!,undefined,[],true,step.callouts);
  const layout=diagramPDFDrawingLayout(step.pose!,step.annotations!,[],{width:140,height:90},[],step.callouts);assert.ok(layout);
  for(const svg of [drawing(project),diagramPDFStepSVG(project,step,{width:140,height:90})]){
    const nodes=insetNodes(svg);assert.equal(nodes.size,3);
    assert.match(JSON.stringify(nodes.get('paper-detail')),/data-diagram-paper-face/);
    assert.match(JSON.stringify(nodes.get('paper-detail')),/#123456/);
    assert.equal((nodes.get('paper-detail')!.path as Node[]).length,2,'paper magnifiers keep their two tangent connectors');
    for(const id of ['cp-before','cp-after'])assert.match(JSON.stringify(nodes.get(id)),/x1/,'CP callouts must contain their source crease geometry');
    for(const callout of step.callouts!){
      const locator=diagramCalloutLocator(callout);
      for(const circle of [locator,callout.target]){contains(viewBox(svg),circle.center,circle.radius);contains(frame,circle.center,circle.radius);contains(layout.frame,circle.center,circle.radius);}
      if(callout.source.kind==='cp'){
        assert.equal(nodes.get(callout.id)!.path,undefined,'CP circles have no tangent connectors in the drawing or PDF');
        const circles=nodes.get(callout.id)!.circle as Node[];assert.equal(circles.length,3,'CP inset paints its small locator, white target backing and target outline');
        assert.equal(circles[0]['@_cx'],String(locator.center[0]));assert.equal(circles[0]['@_cy'],String(locator.center[1]));
      }
    }
  }
  assert.deepEqual(project,snapshot);
});

test('an uncalculated CP-only step exports its selected structure rather than silently falling back to a full CP',()=>{
  let project=createDiagramProject(blankDoc('仅 CP 局部图',100,100));const step=project.steps[0];
  project=updateDiagramCallouts(project,step.id,[{id:'structure-only',source:{kind:'cp',stateId:step.afterId,center:[50,50],radius:25},target:{center:[200,50],radius:60}}]);
  const svg=diagramPDFStepSVG(project,project.steps[0]),nodes=insetNodes(svg);
  assert.equal(nodes.size,1);assert.match(JSON.stringify(nodes.get('structure-only')),/x1/);contains(viewBox(svg),[200,50],60);
  assert.equal(project.steps[0].pose,null);assert.deepEqual(project.steps[0].annotations,[]);
});

test('sampling artwork excludes existing insets and isolates real tear-window masks and references in every SVG/PDF copy',()=>{
  let project=fixture(),step=project.steps[0];
  project=updateDiagramAnnotations(project,step.id,[...step.annotations!,{id:'window',kind:'symbol',symbol:'tearWindow',position:[25,50],size:100,rotation:0,color:'#483b24',width:.7,params:{radius:12},cutawayFaces:[0]}]);
  const another=structuredClone(project.steps[0].callouts![0]);another.id='second-paper';another.target.center=[120,-300];
  project=updateDiagramCallouts(project,step.id,[...project.steps[0].callouts!,another]);step=project.steps[0];
  for(const svg of [drawing(project),diagramPDFStepSVG(project,step)]){
    const nodes=insetNodes(svg);assert.equal(nodes.size,4);assert.equal((svg.match(/data-diagram-callout=/g)??[]).length,4,'an inset must never sample another inset');
    for(const id of ['paper-detail','second-paper']){
      const subtree=JSON.stringify(nodes.get(id));assert.match(subtree,/mask/);assert.equal((subtree.match(/@_data-diagram-callout/g)??[]).length,1);
    }
    const ids=[...svg.matchAll(/\sid="([^"]+)"/g)].map(match=>match[1]);assert.equal(ids.length,new Set(ids).size,'all main and sampled defs IDs are unique');
    for(const reference of svg.matchAll(/(?:url\(#([^)]*)\)|(?:href|xlink:href)="#([^"]+)")/g))assert.ok(ids.includes(reference[1]??reference[2]),`unresolved reference ${reference[0]}`);
  }
});

test('editing the after CP updates only that live CP inset while saved paper geometry and before CP stay untouched',()=>{
  const project=fixture(),step=project.steps[0],nextDoc=structuredClone(project.states[1].doc);
  nextDoc.segments.push({id:'new-cp-valley',a:[10,23],b:[90,23],assignment:'V',angle:180});
  const updated=updateDiagramCP(project,step.afterId,nextDoc),snapshot=structuredClone(updated);
  for(const svg of [drawing(updated),diagramPDFStepSVG(updated,updated.steps[0])]){
    const nodes=insetNodes(svg),after=JSON.stringify(nodes.get('cp-after')),before=JSON.stringify(nodes.get('cp-before'));
    assert.match(after,/@_y1":"23"/);assert.doesNotMatch(before,/@_y1":"23"/);assert.doesNotMatch(JSON.stringify(nodes.get('paper-detail')),/@_y1":"23"/);
  }
  assert.deepEqual(updated.steps[0].pose,step.pose);assert.deepEqual(updated.steps[0].annotations,step.annotations);assert.deepEqual(updated.states[0],project.states[0]);assert.deepEqual(updated,snapshot);
});

test('global line appearance resolves inside the paper inset in SVG and PDF without baking derived paint into the saved project',()=>{
  const project=fixture(),step=project.steps[0],before=structuredClone(project),palette=changeGlobalDiagramLineStyle(defaultDiagramLineDefaults(),'valley',{color:'#bd1234',width:2,strokePattern:'dotted'});
  for(const svg of [drawing(project,palette),diagramPDFStepSVG(project,step,undefined,palette)]){
    const paper=JSON.stringify(insetNodes(svg).get('paper-detail'));
    assert.match(paper,/#bd1234/);assert.match(paper,/@_stroke-width":"2"/);assert.match(paper,/@_stroke-dasharray":"2 8"/);assert.doesNotMatch(paper,/#123456/);
  }
  const serialized=exportDiagramProject(project),loaded=importDiagramProject(serialized);
  assert.deepEqual(project,before);assert.deepEqual(loaded.states,before.states);assert.deepEqual(loaded.steps[0].pose!.result.geometry.vertices,before.steps[0].pose!.result.geometry.vertices);
  assert.deepEqual(loaded.steps[0].annotations,before.steps[0].annotations);assert.deepEqual(loaded.steps[0].callouts,before.steps[0].callouts);
  assert.doesNotMatch(serialized,/#bd1234|baseCP|paperMarkup|cpMarkup|<svg/);
  assert.match(serialized,/#123456/);
});

test('a CP selection far from the source drawing does not expand the main or PDF canvas',()=>{
  let project=fixture();const callouts=structuredClone(project.steps[0].callouts!);
  for(const callout of callouts)if(callout.source.kind==='cp')callout.source.center=[999_000,-999_000];
  project=updateDiagramCallouts(project,project.activeStepId,callouts);
  for(const svg of [drawing(project),diagramPDFStepSVG(project,project.steps[0])]){
    const frame=viewBox(svg);assert.ok(frame.width<2000&&frame.height<2000);assert.equal(insetNodes(svg).size,3);
  }
});

test('moving and resizing a CP locator changes SVG/PDF annotation geometry while preserving the chosen CP structure',()=>{
  const project=fixture(),original=structuredClone(project),callouts=structuredClone(project.steps[0].callouts!);
  const cp=callouts.find(callout=>callout.id==='cp-after')!;if(cp.source.kind!=='cp')throw new Error('fixture');
  cp.source.locator={center:[-600,-350],radius:27};
  const updated=updateDiagramCallouts(project,project.activeStepId,callouts),loaded=importDiagramProject(exportDiagramProject(updated));
  for(const svg of [drawing(loaded),diagramPDFStepSVG(loaded,loaded.steps[0])]){
    const node=insetNodes(svg).get('cp-after')!,circles=node.circle as Node[];
    assert.equal(circles[0]['@_cx'],'-600');assert.equal(circles[0]['@_cy'],'-350');assert.equal(circles[0]['@_r'],'27');
    assert.match(JSON.stringify(node),/translate\(480 -120\) scale\(2.75\) translate\(-50 -40\)/);contains(viewBox(svg),[-600,-350],27);
  }
  assert.deepEqual(loaded.states,original.states);assert.deepEqual(loaded.steps[0].annotations,original.steps[0].annotations);
  assert.deepEqual(loaded.steps[0].pose!.result.geometry.vertices,original.steps[0].pose!.result.geometry.vertices);assert.deepEqual(project,original);
});

test('a before/after comparison exports the same selected CP region twice and keeps both captions within SVG/PDF bounds',()=>{
  let project=fixture(),step=project.steps[0];const after=structuredClone(project.states[1].doc);
  after.segments.push({id:'after-only',a:[10,23],b:[90,23],assignment:'V',angle:180});project=updateDiagramCP(project,step.afterId,after);
  const callout:DiagramCallout={id:'cp-change',source:{kind:'cp',stateId:step.beforeId,center:[50,40],radius:20,locator:{center:[25,30],radius:10}},target:{center:[-300,100],radius:50},comparison:{stateId:step.afterId,target:{center:[500,260],radius:70}}};
  project=updateDiagramCallouts(project,step.id,[callout]);step=project.steps[0];const before=structuredClone(project);
  for(const svg of [drawing(project),diagramPDFStepSVG(project,step,{width:100,height:60})]){
    const node=insetNodes(svg).get('cp-change')!,targets=node.g as Node[];assert.equal(targets.length,2);
    assert.equal(node.path,undefined,'before/after CP circles stand independently without external tangent lines');
    const first=targets.find(target=>target['@_data-diagram-callout-target']==='target')!,second=targets.find(target=>target['@_data-diagram-callout-target']==='comparison')!;
    assert.ok(first&&second);assert.doesNotMatch(JSON.stringify(first),/@_y1":"23"/);assert.match(JSON.stringify(second),/@_y1":"23"/);
    assert.match(JSON.stringify(first),/操作前 CP/);assert.match(JSON.stringify(second),/操作后 CP/);
    assert.match(JSON.stringify(first),/translate\(-300 100\) scale\(2.5\) translate\(-50 -40\)/);assert.match(JSON.stringify(second),/translate\(500 260\) scale\(3.5\) translate\(-50 -40\)/);
    for(const circle of [callout.target,callout.comparison!.target]){
      contains(viewBox(svg),circle.center,circle.radius);contains(viewBox(svg),[circle.center[0],circle.center[1]+circle.radius*1.35],circle.radius*.05);
    }
  }
  assert.deepEqual(project,before);
  const loaded=importDiagramProject(exportDiagramProject(project));assert.deepEqual(loaded.steps[0].callouts,[callout]);assert.deepEqual(loaded.states,before.states);assert.deepEqual(loaded.steps[0].annotations,before.steps[0].annotations);
  assert.deepEqual(loaded.steps[0].pose!.result.geometry.vertices,before.steps[0].pose!.result.geometry.vertices);
});

test('fitting a valid large external inset permits the resulting screen-scaled border width',()=>{
  const project=fixture(),callout=structuredClone(project.steps[0].callouts![0]);callout.target={center:[900_000,900_000],radius:100_000};
  const frame=diagramDrawingFrame(project.steps[0].pose,[],undefined,[],true,[callout]),pixel=Math.max(frame.width/900,frame.height/600),strokeWidth=pixel*1.3;
  assert.ok(strokeWidth>100);
  const markup=diagramCalloutsSVG([callout],{paperMarkup:'<path d="M 0 0 L 100 100"/>',cpMarkup:()=>'',strokeWidth});
  assert.equal(XMLValidator.validate(`<svg>${markup}</svg>`),true);assert.match(markup,new RegExp(`stroke-width="${strokeWidth}"`));
  for(const invalid of [0,-1,NaN,Infinity])assert.throws(()=>diagramCalloutsSVG([callout],{paperMarkup:'',cpMarkup:()=>'',strokeWidth:invalid}),/线宽/);
});
