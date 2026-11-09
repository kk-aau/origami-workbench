import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {validateDiagramAnnotations,type DiagramLineAnnotation,type DiagramLineAppearanceField} from '../../src/app/diagramAnnotations';
import {DIAGRAM_LINE_DEFAULTS_KEY,defaultDiagramLineDefaults,changeGlobalDiagramLineStyle,applyDiagramLineAppearance,resolveDiagramLineAppearance,overrideDiagramLineAppearance,resetDiagramLineAppearance,validateDiagramLineDefaults,readDiagramLineDefaults,saveDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import {createDiagramProject,updateDiagramAnnotations,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';

const line=(patch:Partial<DiagramLineAnnotation>={}):DiagramLineAnnotation=>({id:'painted-fold',kind:'line',a:[10,20],b:[90,20],style:'valley',color:'#293d35',width:.7,...patch});
const storage=()=>{
 const records=new Map<string,string>();
 return {records,getItem:(key:string)=>records.get(key)??null,setItem:(key:string,value:string)=>{records.set(key,value);}};
};

test('global edits activate only chosen fields and leave other categories and source drawings intact',()=>{
 const initial=defaultDiagramLineDefaults(),saved=structuredClone(initial),doc=blankDoc('显示不修改CP',100,100),before=structuredClone(doc),raw=line();
 const colored=changeGlobalDiagramLineStyle(initial,'valley',{color:'#bc2345'});
 assert.deepEqual(initial,saved);assert.deepEqual(colored.valley.globalFields,['color']);
 assert.equal(colored.mountain,initial.mountain);assert.notEqual(colored.valley,initial.valley);
 const wider=changeGlobalDiagramLineStyle(colored,'valley',{width:1.4});
 assert.deepEqual(wider.valley.globalFields,['color','width']);assert.deepEqual(colored.valley.globalFields,['color']);
 assert.deepEqual(applyDiagramLineAppearance(raw,wider),{...raw,color:'#bc2345',width:1.4});
 assert.deepEqual(raw,line());assert.deepEqual(doc,before);
 // Selecting the original factory color is still an explicit global choice.
 const explicit=changeGlobalDiagramLineStyle(initial,'valley',{color:initial.valley.color});
 assert.deepEqual(explicit.valley.globalFields,['color']);
 assert.equal(applyDiagramLineAppearance(line({style:'mountain'}),wider).color,'#293d35');
});

test('legacy missing patterns and object identity survive unrelated or ineffective global edits',()=>{
 const raw=line(),initial=defaultDiagramLineDefaults();
 assert.equal(applyDiagramLineAppearance(raw,initial),raw);assert.equal(Object.hasOwn(raw,'strokePattern'),false);
 const color=changeGlobalDiagramLineStyle(initial,'valley',{color:'#623cbe'}),shown=applyDiagramLineAppearance(raw,color);
 assert.notEqual(shown,raw);assert.equal(shown.color,'#623cbe');assert.equal(Object.hasOwn(shown,'strokePattern'),false);
 assert.deepEqual(resolveDiagramLineAppearance(raw,color),{color:'#623cbe',width:.7,strokePattern:'dashed'});
 const sameWidth=changeGlobalDiagramLineStyle(initial,'valley',{width:.7});
 assert.equal(applyDiagramLineAppearance(raw,sameWidth),raw);
 const patterned=applyDiagramLineAppearance(raw,changeGlobalDiagramLineStyle(color,'valley',{strokePattern:'dotted'}));
 assert.equal(patterned.strokePattern,'dotted');assert.equal(Object.hasOwn(raw,'strokePattern'),false);
});

test('single-line exceptions protect only the edited fields and can return to global appearance',()=>{
 const palette=changeGlobalDiagramLineStyle(defaultDiagramLineDefaults(),'valley',{color:'#b52d67',width:1.8,strokePattern:'solid'});
 const raw=line({foldFaces:[1,3],foldAction:'precrease',animationTiming:{afterLineId:'other-fold',startAfter:.5}}),saved=structuredClone(raw);
 const local=overrideDiagramLineAppearance(raw,{width:2.5});
 assert.deepEqual(local.appearanceOverrides,['width']);
 assert.deepEqual(resolveDiagramLineAppearance(local,palette),{color:'#b52d67',width:2.5,strokePattern:'solid'});
 const custom=overrideDiagramLineAppearance(local,{color:'#1765ab'});
 assert.deepEqual(custom.appearanceOverrides,['color','width']);assert.deepEqual(local.appearanceOverrides,['width']);
 assert.deepEqual(resolveDiagramLineAppearance(custom,palette),{color:'#1765ab',width:2.5,strokePattern:'solid'});
 const reset=resetDiagramLineAppearance(custom,palette);
 assert.equal(Object.hasOwn(reset,'appearanceOverrides'),false);
 assert.deepEqual(reset,{...raw,color:'#b52d67',width:1.8,strokePattern:'solid'});
 assert.deepEqual(raw,saved);assert.equal(reset.foldFaces,raw.foldFaces);assert.equal(reset.animationTiming,raw.animationTiming);
 const changed=changeGlobalDiagramLineStyle(palette,'valley',{color:'#09a347'});
 assert.equal(resolveDiagramLineAppearance(reset,changed).color,'#09a347');assert.equal(resolveDiagramLineAppearance(custom,changed).color,'#1765ab');
});

test('an explicit single-line value equal to its old color remains an exception after later global changes',()=>{
 const raw=line(),custom=overrideDiagramLineAppearance(raw,{color:raw.color});
 const global=changeGlobalDiagramLineStyle(defaultDiagramLineDefaults(),'valley',{color:'#b40000',width:2});
 assert.deepEqual(resolveDiagramLineAppearance(custom,global),{color:raw.color,width:2,strokePattern:'dashed'});
 assert.deepEqual(custom.appearanceOverrides,['color']);
});

test('old preference values migrate once per field while explicit empty masks never activate old colors again',()=>{
 const initial=defaultDiagramLineDefaults(),old=structuredClone(initial);
 old.valley.color='#7940ac';old.mountain.width=2;old.auxiliary.strokePattern='solid';
 const memory=storage();memory.setItem(DIAGRAM_LINE_DEFAULTS_KEY,JSON.stringify({version:1,settings:old}));
 const migrated=readDiagramLineDefaults(memory);
 assert.deepEqual(migrated.valley.globalFields,['color']);assert.deepEqual(migrated.mountain.globalFields,['width']);assert.deepEqual(migrated.auxiliary.globalFields,['strokePattern']);
 assert.equal(Object.hasOwn(migrated.crease,'globalFields'),false);
 saveDiagramLineDefaults(migrated,memory);assert.deepEqual(readDiagramLineDefaults(memory),migrated);
 const persisted=JSON.parse(memory.getItem(DIAGRAM_LINE_DEFAULTS_KEY)!);
 assert.deepEqual(persisted.settings.crease.globalFields,[]);assert.deepEqual(persisted.settings.valley.globalFields,['color']);
 persisted.settings.valley.globalFields=[];
 memory.setItem(DIAGRAM_LINE_DEFAULTS_KEY,JSON.stringify(persisted));
 const cleared=readDiagramLineDefaults(memory);
 assert.equal(cleared.valley.color,'#7940ac');assert.equal(Object.hasOwn(cleared.valley,'globalFields'),false);
 assert.equal(applyDiagramLineAppearance(line(),cleared).color,'#293d35');
 saveDiagramLineDefaults(cleared,memory);assert.deepEqual(readDiagramLineDefaults(memory),cleared);
});

test('preference validation clones active masks and normalizes empty masks without changing old roundtrips',()=>{
 const initial=defaultDiagramLineDefaults(),active=changeGlobalDiagramLineStyle(initial,'boundary',{strokePattern:'dotted'}),valid=validateDiagramLineDefaults(active);
 assert.deepEqual(valid,active);assert.notEqual(valid.boundary.globalFields,active.boundary.globalFields);
 valid.boundary.globalFields!.push('color');assert.deepEqual(active.boundary.globalFields,['strokePattern']);
 const empty={...initial,valley:{...initial.valley,globalFields:[]}};
 assert.deepEqual(validateDiagramLineDefaults(empty),initial);
 const memory=storage();initial.valley.color='#bc412d';saveDiagramLineDefaults(initial,memory);
 assert.deepEqual(readDiagramLineDefaults(memory),initial);
 for(const globalFields of [null,undefined,'color',['color','color'],['unknown'],[1],new Array(1)])assert.throws(()=>validateDiagramLineDefaults({...initial,valley:{...initial.valley,globalFields}}));
 assert.throws(()=>validateDiagramLineDefaults({...initial,unknown:initial.valley}));
 assert.throws(()=>validateDiagramLineDefaults({...initial,valley:{...initial.valley,extra:1}}));
 assert.deepEqual(readDiagramLineDefaults({getItem:()=>JSON.stringify({version:1,settings:{...initial,valley:{...initial.valley,globalFields:['bogus']}}})}),defaultDiagramLineDefaults());
});

test('single-line override metadata is validated strictly and survives project export without CP changes',()=>{
 const raw=line({appearanceOverrides:['color','strokePattern'],strokePattern:'dotted'});
 assert.doesNotThrow(()=>validateDiagramAnnotations([raw]));assert.doesNotThrow(()=>validateDiagramAnnotations([line({appearanceOverrides:[]})]));
 for(const appearanceOverrides of [undefined,null,'color',['color','color'],['unknown'],[1],new Array(1)])assert.throws(()=>validateDiagramAnnotations([line({appearanceOverrides:appearanceOverrides as never})]));
 assert.throws(()=>validateDiagramAnnotations([{id:'symbol',kind:'symbol',symbol:'fold',position:[0,0],size:20,rotation:0,color:'#111111',width:.7,appearanceOverrides:['color']}]));
 const base=createDiagramProject(blankDoc('单线外观导出',100,100));
 const changed=updateDiagramAnnotations(base,base.activeStepId,[raw]),loaded=importDiagramProject(exportDiagramProject(changed));
 assert.deepEqual(changed.states,base.states);assert.deepEqual(loaded.states,base.states);assert.deepEqual(loaded.steps[0].annotations,[raw]);
 assert.notEqual(loaded.steps[0].annotations![0],raw);
});

test('appearance helpers reject malformed patches and do not create exceptions for empty patches',()=>{
 const raw=line(),palette=defaultDiagramLineDefaults();
 assert.equal(changeGlobalDiagramLineStyle(palette,'valley',{}),palette);assert.equal(overrideDiagramLineAppearance(raw,{}),raw);
 const bad=[{color:'red'},{width:0},{width:Infinity},{strokePattern:'dash'},{color:undefined},{width:undefined},{strokePattern:undefined},{style:'mountain'},null,[]];
 for(const patch of bad){
  assert.throws(()=>changeGlobalDiagramLineStyle(palette,'valley',patch as never));
  assert.throws(()=>overrideDiagramLineAppearance(raw,patch as never));
 }
 assert.throws(()=>changeGlobalDiagramLineStyle(palette,'unknown' as never,{color:'#111111'}));
 const fields:DiagramLineAppearanceField[]=['color'];
 const original=line({appearanceOverrides:fields}),next=overrideDiagramLineAppearance(original,{width:3});
 assert.deepEqual(fields,['color']);assert.notEqual(next.appearanceOverrides,fields);
});
