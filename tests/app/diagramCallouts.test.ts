import {test} from 'node:test';
import assert from 'node:assert/strict';
import {XMLValidator} from 'fast-xml-parser';
import {blankDoc} from '../../src/app/state';
import {defaultCreaseDisplay} from '../../src/app/creaseDisplay';
import {diagramCalloutBounds,diagramCalloutDrawingBounds,diagramCalloutConnectors,diagramCalloutLocator,diagramCalloutTargets,validateDiagramCallouts,DIAGRAM_CALLOUT_MAX_COUNT,type DiagramCallout} from '../../src/app/diagramCallouts';
import {diagramCalloutCPMarkup,diagramCalloutSourceMarkup,diagramCalloutsSVG} from '../../src/app/diagramCalloutSVG';
import {createDiagramProject,appendDiagramStep,duplicateDiagramStep,removeDiagramStep,updateDiagramCallouts,updateDiagramCP,exportDiagramProject,importDiagramProject,validateDiagramProject} from '../../src/app/diagramProject';

const paper=(id='paper'):DiagramCallout=>({id,source:{kind:'paper',center:[25,30],radius:10},target:{center:[170,80],radius:40}});
const cp=(stateId:string,id='cp'):DiagramCallout=>({id,source:{kind:'cp',stateId,center:[50,40],radius:20},target:{center:[250,100],radius:35}});
const pair=(before:string,after:string):DiagramCallout=>({...cp(before),comparison:{stateId:after,target:{center:[420,100],radius:50}}});
function fixture(){let id=0;const ids=()=>`callout-${++id}`;return {project:createDiagramProject(blankDoc('圆形局部图',100,100),ids),ids};}

test('callouts persist independently of annotations, CPs and legacy projects without inserting a migration field',()=>{
  const {project}=fixture(),before=structuredClone(project),callouts=[paper(),cp(project.steps[0].afterId)];
  const updated=updateDiagramCallouts(project,project.activeStepId,callouts),loaded=importDiagramProject(exportDiagramProject(updated));
  assert.deepEqual(loaded.steps[0].callouts,callouts);assert.deepEqual(updated.states,before.states);
  assert.deepEqual(updated.steps[0].annotations,before.steps[0].annotations);assert.deepEqual(project,before);
  callouts[0].source.center[0]=-99;assert.equal(updated.steps[0].callouts![0].source.center[0],25);
  loaded.steps[0].callouts![0].target.center[0]=999;assert.equal(updated.steps[0].callouts![0].target.center[0],170);
  assert.ok(!Object.hasOwn(importDiagramProject(exportDiagramProject(project)).steps[0],'callouts'));
});

test('strict inset schema rejects ambiguous kinds, markup, unknown fields and unbounded coordinates',()=>{
  const invalid:unknown[]=[null,{},[null],[{...paper(),kind:'paper'}],[{...paper(),source:{...paper().source,kind:'zoom'}}],
    [{...paper(),source:{...paper().source,stateId:'foreign'}}],[{...paper(),target:{...paper().target,svg:'<svg/>'}}],
    [{...paper(),source:{...paper().source,locator:{center:[1,2],radius:10}}}],
    [{...cp('pre'),source:{...cp('pre').source,locator:undefined}}],
    [{...cp('pre'),source:{...cp('pre').source,locator:{center:[1,2],radius:0}}}],
    [{...cp('pre'),source:{...cp('pre').source,locator:{center:[1,2],radius:10,kind:'paper'}}}],
    [{...paper(),id:'\u0000bad'}],[{...paper(),id:''}],[paper(),paper()]];
  for(const radius of [0,-1,.099,100_001,NaN,Infinity,'12',undefined])invalid.push([{...paper(),source:{...paper().source,radius}}]);
  for(const center of [[Infinity,0],[0,NaN],[1_000_001,0],[0],[0,0,0],Array(2),['1',2]])invalid.push([{...paper(),target:{...paper().target,center}}]);
  for(const value of invalid)assert.throws(()=>validateDiagramCallouts(value));
  const bounds=paper();bounds.source.radius=.1;bounds.target.radius=100_000;bounds.source.center=[-1_000_000,1_000_000];
  assert.doesNotThrow(()=>validateDiagramCallouts([bounds]));
  assert.doesNotThrow(()=>validateDiagramCallouts(Array.from({length:DIAGRAM_CALLOUT_MAX_COUNT},(_,i)=>paper(String(i)))));
  assert.throws(()=>validateDiagramCallouts(Array.from({length:DIAGRAM_CALLOUT_MAX_COUNT+1},(_,i)=>paper(String(i)))));
});

test('CP insets can only refer to this step before/after and every import validates the same reference',()=>{
  const {project,ids}=fixture(),two=appendDiagramStep(project,ids),before=structuredClone(two);
  assert.throws(()=>updateDiagramCallouts(two,two.steps[0].id,[cp(two.steps[1].afterId)]),/本步骤/);
  const malformed=structuredClone(two);malformed.steps[0].callouts=[cp(two.steps[1].afterId)];
  assert.throws(()=>validateDiagramProject(malformed),/本步骤/);assert.throws(()=>importDiagramProject(JSON.stringify(malformed)),/本步骤/);
  assert.throws(()=>updateDiagramCallouts(two,'missing',[paper()]),/不存在/);assert.deepEqual(two,before);
});

test('comparison schema strictly binds a CP pair to this step before/after roles and rejects paper or ambiguous data',()=>{
  const {project}=fixture(),step=project.steps[0],valid=pair(step.beforeId,step.afterId);
  assert.doesNotThrow(()=>validateDiagramCallouts([valid],[step.beforeId,step.afterId]));
  const invalid:unknown[]=[{...paper(),comparison:valid.comparison},{...valid,comparison:undefined},{...valid,comparison:null},
    {...valid,comparison:{...valid.comparison,unexpected:true}},{...valid,comparison:{stateId:step.beforeId,target:valid.target}},
    {...valid,comparison:{stateId:'foreign',target:valid.target}},{...valid,source:{...valid.source,stateId:step.afterId},comparison:{stateId:step.beforeId,target:valid.target}},
    {...valid,comparison:{stateId:step.afterId,target:{center:[1,2],radius:0}}}];
  for(const value of invalid)assert.throws(()=>validateDiagramCallouts([value],[step.beforeId,step.afterId]));
  const same=pair('same','same');assert.throws(()=>validateDiagramCallouts([same]));
});

test('comparison targets and label bounds extend both circles without changing legacy target descriptors',()=>{
  const comparison=pair('before','after'),targets=diagramCalloutTargets(comparison);
  assert.deepEqual(targets,[{part:'target',circle:comparison.target,stateId:'before',label:'操作前 CP'},{part:'comparison',circle:comparison.comparison!.target,stateId:'after',label:'操作后 CP'}]);
  assert.deepEqual(diagramCalloutBounds(comparison),{minX:131,minY:50,maxX:470,maxY:170});
  assert.deepEqual(diagramCalloutConnectors(comparison,comparison.comparison!.target),[]);
  assert.deepEqual(diagramCalloutTargets(cp('before')),[{part:'target',circle:cp('before').target,stateId:'before'}]);
  assert.deepEqual(diagramCalloutTargets(paper()),[{part:'target',circle:paper().target}]);
});

test('comparison circles round-trip and copy by CP role while successor rebinding and deletion keep the after reference',()=>{
  const {project,ids}=fixture();let two=appendDiagramStep(project,ids);
  two=updateDiagramCallouts(two,two.steps[0].id,[pair(two.steps[0].beforeId,two.steps[0].afterId)]);
  two=updateDiagramCallouts(two,two.steps[1].id,[pair(two.steps[1].beforeId,two.steps[1].afterId)]);
  const original=structuredClone(two),copied=duplicateDiagramStep(two,two.steps[0].id,ids),duplicate=copied.steps[1],following=copied.steps[2];
  assert.equal((duplicate.callouts![0].source as {stateId:string}).stateId,duplicate.beforeId);assert.equal(duplicate.callouts![0].comparison!.stateId,duplicate.afterId);
  assert.equal((following.callouts![0].source as {stateId:string}).stateId,duplicate.afterId);assert.equal(following.callouts![0].comparison!.stateId,two.steps[1].afterId);
  assert.deepEqual(importDiagramProject(exportDiagramProject(copied)).steps.map(step=>step.callouts),copied.steps.map(step=>step.callouts));
  const removed=removeDiagramStep(copied,duplicate.id);assert.deepEqual(removed.steps.map(step=>step.callouts),two.steps.map(step=>step.callouts));
  duplicate.callouts![0].comparison!.target.center[0]=999;assert.equal(copied.steps[0].callouts![0].comparison!.target.center[0],420);
  assert.deepEqual(two,original);assert.doesNotThrow(()=>validateDiagramProject(removed));
});

test('one CP crop renders the before and after artworks in distinct clips with labels and isolated source definitions',()=>{
  const callout=pair('before','after'),before=structuredClone(callout),requested:string[]=[];
  const svg=diagramCalloutsSVG([callout],{paperMarkup:'',cpMarkup:id=>{requested.push(id);return `<defs><path id="shared" d="M 0 0 L 1 1"/><clipPath id="clip"><use href="#shared"/></clipPath></defs><g clip-path="url(#clip)" data-state="${id}"><line x1="50" y1="40" x2="70" y2="40"/></g>`;}});
  assert.equal(XMLValidator.validate(`<svg>${svg}</svg>`),true);assert.deepEqual(requested,['before','after']);
  assert.match(svg,/translate\(250 100\) scale\(1.75\) translate\(-50 -40\)/);assert.match(svg,/translate\(420 100\) scale\(2.5\) translate\(-50 -40\)/);
  assert.match(svg,/操作前 CP/);assert.match(svg,/操作后 CP/);assert.match(svg,/data-diagram-callout-target="target"/);assert.match(svg,/data-diagram-callout-target="comparison"/);
  const ids=[...svg.matchAll(/\sid="([^"]+)"/g)].map(match=>match[1]);assert.equal(ids.length,new Set(ids).size);assert.equal(ids.length,6);
  for(const reference of svg.matchAll(/(?:url\(#([^)]*)\)|href="#([^"]+)")/g))assert.ok(ids.includes(reference[1]??reference[2]));
  assert.deepEqual(callout,before);
  const legacy=cp('before'),single=diagramCalloutsSVG([legacy],{paperMarkup:'',cpMarkup:()=>'<line x1="50" y1="40" x2="70" y2="40"/>'});
  assert.doesNotMatch(single,/操作前 CP|操作后 CP|data-diagram-callout-target/);assert.equal((single.match(/<clipPath/g)??[]).length,1);assert.ok(!Object.hasOwn(legacy,'comparison'));
});

test('copying a step remaps both CP roles and the successor before inset without aliasing circles',()=>{
  const {project,ids}=fixture();let two=appendDiagramStep(project,ids);
  two=updateDiagramCallouts(two,two.steps[0].id,[paper(),cp(two.steps[0].beforeId,'pre'),cp(two.steps[0].afterId,'post')]);
  two=updateDiagramCallouts(two,two.steps[1].id,[cp(two.steps[1].beforeId,'following')]);
  const original=structuredClone(two),copied=duplicateDiagramStep(two,two.steps[0].id,ids),copy=copied.steps[1];
  assert.equal(copy.callouts![1].source.kind,'cp');assert.equal((copy.callouts![1].source as {stateId:string}).stateId,copy.beforeId);
  assert.equal((copy.callouts![2].source as {stateId:string}).stateId,copy.afterId);
  assert.equal((copied.steps[2].callouts![0].source as {stateId:string}).stateId,copy.afterId);
  assert.deepEqual(copied.steps[0].callouts,two.steps[0].callouts);assert.deepEqual(two,original);
  copy.callouts![0].source.center[0]=12;assert.equal(copied.steps[0].callouts![0].source.center[0],25);
  assert.doesNotThrow(()=>validateDiagramProject(copied));
});

test('deleting an operation rebinds a following before inset to its new boundary and preserves its after inset',()=>{
  const {project,ids}=fixture();let three=appendDiagramStep(appendDiagramStep(project,ids),ids);
  const following=three.steps[2];three=updateDiagramCallouts(three,following.id,[cp(following.beforeId,'pre'),cp(following.afterId,'post'),paper()]);
  const original=structuredClone(three),removed=removeDiagramStep(three,three.steps[1].id),survivor=removed.steps[1];
  assert.equal((survivor.callouts![0].source as {stateId:string}).stateId,survivor.beforeId);
  assert.equal((survivor.callouts![1].source as {stateId:string}).stateId,following.afterId);
  assert.deepEqual(survivor.callouts![2],paper());assert.deepEqual(three,original);assert.doesNotThrow(()=>validateDiagramProject(removed));
});

test('frame bounds include paper source and target while a CP selection remains in CP coordinates',()=>{
  assert.deepEqual(diagramCalloutBounds(paper()),{minX:15,minY:20,maxX:210,maxY:120});
  const inset=cp('pre');inset.source.center=[-99999,-99999];
  assert.deepEqual(diagramCalloutDrawingBounds([inset]),{x:131,y:65,width:154,height:70});
  assert.deepEqual(diagramCalloutDrawingBounds([paper(),inset]),{x:15,y:20,width:270,height:115});
  assert.equal(diagramCalloutDrawingBounds([]),null);
});

test('paper magnifiers use exact exterior tangents while CP circles remain independent',()=>{
  const inset=paper(),lines=diagramCalloutConnectors(inset);assert.equal(lines.length,2);
  for(const [a,b] of lines){
    const ra=[a[0]-inset.source.center[0],a[1]-inset.source.center[1]],rb=[b[0]-inset.target.center[0],b[1]-inset.target.center[1]],line=[b[0]-a[0],b[1]-a[1]];
    assert.ok(Math.abs(Math.hypot(...ra)-inset.source.radius)<1e-9);assert.ok(Math.abs(Math.hypot(...rb)-inset.target.radius)<1e-9);
    assert.ok(Math.abs(ra[0]*line[0]+ra[1]*line[1])<1e-8);assert.ok(Math.abs(rb[0]*line[0]+rb[1]*line[1])<1e-8);
  }
  inset.target.center=[25,30];assert.deepEqual(diagramCalloutConnectors(inset),[]);
  assert.deepEqual(diagramCalloutConnectors(cp('pre')),[]);
});

test('old CP insets derive a deterministic bounded small circle independently of CP coordinates and without metadata mutation',()=>{
  const inset=cp('pre'),before=structuredClone(inset),locator=diagramCalloutLocator(inset);
  assert.deepEqual(locator,{center:[145,100],radius:14});assert.deepEqual(diagramCalloutLocator(inset),locator);assert.deepEqual(inset,before);
  assert.equal(Object.hasOwn(inset.source,'locator'),false);
  inset.source.center=[999_999,-999_999];assert.deepEqual(diagramCalloutLocator(inset),locator);
  for(const center of [[-1_000_000,-1_000_000],[1_000_000,1_000_000]] as [number,number][]){
    inset.target={center,radius:100_000};const actual=diagramCalloutLocator(inset);
    assert.ok(actual.center.every(value=>Math.abs(value)<=1_000_000));assert.ok(Math.abs(actual.center[0]-center[0])===300_000);assert.equal(actual.center[1],center[1]);
    assert.doesNotThrow(()=>validateDiagramCallouts([{...inset,source:{...inset.source,kind:'cp',stateId:'pre',locator:actual}}]));
  }
  inset.target.radius=.1;assert.equal(diagramCalloutLocator(inset).radius,.1);
});

test('an explicit CP locator persists and changes only the main drawing circles, never the CP crop transform',()=>{
  const {project}=fixture(),inset=cp(project.steps[0].afterId);assert.equal(inset.source.kind,'cp');
  if(inset.source.kind!=='cp')throw new Error('fixture');inset.source.locator={center:[-120,160],radius:17};
  const updated=updateDiagramCallouts(project,project.activeStepId,[inset]),loaded=importDiagramProject(exportDiagramProject(updated));
  assert.deepEqual(loaded.steps[0].callouts,[inset]);assert.deepEqual(updated.states,project.states);
  const before=structuredClone(inset),options={paperMarkup:'',cpMarkup:()=>'<line x1="50" y1="40" x2="60" y2="40"/>'},svg=diagramCalloutsSVG([inset],options);
  assert.match(svg,/<circle cx="-120" cy="160" r="17" fill="none"/);assert.match(svg,/translate\(250 100\) scale\(1.75\) translate\(-50 -40\)/);
  assert.deepEqual(diagramCalloutBounds(inset),{minX:-137,minY:65,maxX:285,maxY:177});assert.deepEqual(inset,before);
  const moved=structuredClone(inset);if(moved.source.kind!=='cp')throw new Error('fixture');moved.source.locator={center:[500,-100],radius:30};
  const changed=diagramCalloutsSVG([moved],options);assert.equal(svg.match(/transform="[^"]+"/)![0],changed.match(/transform="[^"]+"/)![0]);
  assert.deepEqual(moved.source.center,inset.source.center);assert.equal(moved.source.radius,inset.source.radius);assert.equal(moved.source.stateId,inset.source.stateId);
});

test('inset SVG clips exact source coordinates with white backing and excludes recursive rendering',()=>{
  const requested:string[]=[],markup=diagramCalloutsSVG([paper(),cp('after')],{paperMarkup:'<path data-main="paper" d="M 25 30 L 30 30"/>',cpMarkup:id=>{requested.push(id);return '<path data-main="cp" d="M 50 40 L 60 40"/>';}});
  assert.equal(XMLValidator.validate(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`),true);
  assert.deepEqual(requested,['after']);assert.match(markup,/translate\(170 80\) scale\(4\) translate\(-25 -30\)/);
  assert.match(markup,/translate\(250 100\) scale\(1.75\) translate\(-50 -40\)/);
  assert.match(markup,/<circle cx="170" cy="80" r="40" fill="white"/);assert.equal((markup.match(/data-diagram-callout=/g)??[]).length,2);
  assert.equal((markup.match(/data-main="paper"/g)??[]).length,1);assert.equal((markup.match(/data-main="cp"/g)??[]).length,1);
});

test('each sampled paper copy namespaces mask, clip and use references across insets and canvas prefixes',()=>{
  const source='<defs><path id="window" d="M 0 0 L 10 0 L 0 10 Z"/><mask id="paper"><use href="#window"/></mask><clipPath id="cut"><use xlink:href="#window"/></clipPath></defs><g mask="url(#paper)" clip-path="url(\'#cut\')"><path data-id="original" d="M 0 0 L 10 10"/></g>';
  const options={paperMarkup:source,cpMarkup:()=>'',idPrefix:'main'},a=diagramCalloutsSVG([paper('one'),paper('two')],options),b=diagramCalloutsSVG([paper()],{...options,idPrefix:'thumbnail'});
  const combined=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${a}${b}</svg>`;
  assert.equal(XMLValidator.validate(combined),true);const ids=[...combined.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);assert.equal(ids.length,12);
  for(const match of combined.matchAll(/(?:url\(#([^)]*)\)|(?:href|xlink:href)="#([^"]+)")/g))assert.ok(ids.includes(match[1]??match[2]));
  assert.ok(!combined.includes('url(#paper)'));assert.ok(!combined.includes('href="#window"'));assert.ok(combined.includes('data-id="original"'));
});

test('CP inset artwork derives the latest referenced CP and retains standard line display without document mutation',()=>{
  const {project}=fixture(),stateId=project.steps[0].afterId,art=[cp(stateId)],withInset=updateDiagramCallouts(project,project.activeStepId,art);
  const changed=structuredClone(project.states[1].doc);changed.segments.push({id:'new-valley',a:[10,20],b:[90,20],assignment:'V',angle:180});
  const updated=updateDiagramCP(withInset,stateId,changed),before=structuredClone(updated),display=defaultCreaseDisplay();
  const markup=diagramCalloutsSVG(art,{paperMarkup:'',cpMarkup:id=>diagramCalloutCPMarkup(updated.states.find(s=>s.id===id)!.doc,display)});
  assert.match(markup,/x1="10" y1="20" x2="90" y2="20"/);assert.deepEqual(updated,before);assert.deepEqual(updated.steps[0].callouts,art);
  assert.ok(!diagramCalloutCPMarkup(project.states[1].doc,display).includes('x1="10" y1="20"'));
  assert.equal(diagramCalloutSourceMarkup('<svg viewBox="0 0 2 2"><path d="M 0 0"/></svg>'),'<path d="M 0 0"/>');
  assert.throws(()=>diagramCalloutSourceMarkup('<path/>'),/SVG 根/);
});

test('CP hide-existing option persists and filters only F strokes across shared inset renderers',()=>{
 const p=createDiagramProject(blankDoc('local',100,100)),c={...cp(p.steps[0].beforeId),hideExistingCreases:true};
 const q=importDiagramProject(exportDiagramProject(updateDiagramCallouts(p,p.activeStepId,[c])));assert.equal(q.steps[0].callouts![0].hideExistingCreases,true);
 assert.throws(()=>validateDiagramCallouts([{...paper(),hideExistingCreases:true}]));assert.throws(()=>validateDiagramCallouts([{...c,hideExistingCreases:'yes'}]));
 const d=blankDoc('CP',100,100);d.segments.push({id:'old',a:[10,11],b:[80,11],assignment:'F',angle:0},{id:'new',a:[10,22],b:[80,22],assignment:'M',angle:-45});
 const full=diagramCalloutCPMarkup(d,defaultCreaseDisplay(),{enabled:false}),hidden=diagramCalloutCPMarkup(d,defaultCreaseDisplay(),{enabled:false,hideExistingCreases:true});
 assert(full.includes('y1="11"'));assert(!hidden.includes('y1="11"'));assert(hidden.includes('y1="22"'));assert(hidden.includes('x1="0"'));assert.equal(d.segments.length,6);
 let flag: boolean|undefined;diagramCalloutsSVG([c],{paperMarkup:'',cpMarkup:(_id,_units,hide)=>{flag=hide;return hidden;}});assert.equal(flag,true);
});
