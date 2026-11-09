import test from 'node:test';
import assert from 'node:assert/strict';
import type {Doc,Point} from '../../src/core/types';
import {validateDoc} from '../../src/core/types';
import {upgradeProject} from '../../src/core/project';
import {blankDoc,exampleDoc,historyReducer,line,type History} from '../../src/app/state';
import {getGridReferenceBounds,getPaperBounds,getDrawingBounds,paperPath} from '../../src/app/paper';
import {DEFAULT_PAPER_SIZE} from '../../src/app/paperDefaults';
import {paperGridGeometry,gridLineFamilies} from '../../src/app/gridGeometry';

const expected={x:0,y:0,width:300,height:300};
function latticeState(doc:Doc){
  const grid=paperGridGeometry(getGridReferenceBounds(doc),8,{pattern:'square',diagonal:true,rotation:22.5});
  return {origin:grid.origin,stepX:grid.stepX,stepY:grid.stepY,rotation:grid.rotation,axes:gridLineFamilies(grid),snap:grid.snap([110,90])};
}

test('new blank projects use 300 mm while the existing demonstration geometry remains 200 mm',()=>{
  assert.equal(DEFAULT_PAPER_SIZE,300);
  for(const doc of [blankDoc(),blankDoc('新建'),exampleDoc('blank')]){
    validateDoc(doc);assert.deepEqual(doc.paper,{width:300,height:300});assert.deepEqual(getGridReferenceBounds(doc),expected);
    assert.deepEqual(doc.segments.map(s=>s.a),[[0,0],[300,0],[300,300],[0,300]]);assert.ok(paperPath(doc));
  }
  for(const name of ['waterbomb','accordion']){
    const doc=exampleDoc(name);validateDoc(doc);assert.deepEqual(doc.paper,{width:200,height:200});
    assert.deepEqual(getPaperBounds(doc),{x:0,y:0,width:200,height:200});
    assert.ok(doc.segments.every(s=>[...s.a,...s.b].every(v=>v>=0&&v<=200)));
  }
});

test('removing boundaries and drawing each replacement edge cannot move or resize the grid reference',()=>{
  const initial=blankDoc(),before=latticeState(initial),points:Point[]=[[40,20],[220,20],[220,170],[40,170]];
  let doc:Doc={...initial,segments:[]};
  assert.deepEqual(latticeState(doc),before);assert.equal(paperPath(doc),'');
  for(let i=0;i<4;i++){
    doc={...doc,segments:[...doc.segments,line(points[i],points[(i+1)%4],'B')]};
    assert.deepEqual(getGridReferenceBounds(doc),expected);assert.deepEqual(latticeState(doc),before);
    assert.notDeepEqual(getPaperBounds(doc),expected,'actual boundary bounds can change independently');
    assert.equal(!!paperPath(doc),i===3,'open reconstruction never manufactures a paper face');
  }
  assert.deepEqual(getPaperBounds(doc),{x:40,y:20,width:180,height:150});
});

test('distant auxiliary lines and drawing objects do not change lattice origin, spacing or rotation centre',()=>{
  const base=blankDoc(),before=structuredClone(base),reference=latticeState(base);
  const doc:Doc={...base,segments:[...base.segments,line([-10000,4000],[20000,-5000],'A')],objects:[
    {id:'far-circle',kind:'circle',center:[-30000,7000],radius:1000,color:'#123456'},
    {id:'far-mark',kind:'mark',a:[40000,0],b:[40010,20],color:'#123456'},
  ]};
  assert.ok(getDrawingBounds(doc).width>60000);assert.deepEqual(getGridReferenceBounds(doc),expected);assert.deepEqual(latticeState(doc),reference);
  assert.deepEqual(base,before);
});

test('saving, reloading, undoing and redoing boundary reconstruction preserve the reference',()=>{
  const doc=blankDoc(),before=latticeState(doc),corner:Point[]=[[0,0],[180,0],[180,160],[0,160]];
  let history:History={past:[],present:doc,future:[]};
  history=historyReducer(history,{type:'commit',doc:{...doc,segments:[]}});
  for(let i=0;i<4;i++){
    history=historyReducer(history,{type:'commit',doc:{...history.present,segments:[...history.present.segments,line(corner[i],corner[(i+1)%4],'B')]}});
    const loaded=upgradeProject(JSON.parse(JSON.stringify(history.present)));
    assert.deepEqual(getGridReferenceBounds(loaded),expected);assert.deepEqual(latticeState(loaded),before);
  }
  for(let i=0;i<5;i++){history=historyReducer(history,{type:'undo'});assert.deepEqual(latticeState(history.present),before);}
  assert.equal(history.past.length,0);
  for(let i=0;i<5;i++){history=historyReducer(history,{type:'redo'});assert.deepEqual(latticeState(history.present),before);}
  assert.equal(history.future.length,0);
});

test('existing document paper dimensions remain authoritative and are not migrated to the new default',()=>{
  for(const [width,height]of [[200,200],[210,297],[320,120],[.1,.2]]){
    const doc=blankDoc('已有文件',width,height),copy=upgradeProject(JSON.parse(JSON.stringify(doc))),before=structuredClone(copy);
    copy.segments=copy.segments.map(s=>({...s,a:[s.a[0]-100,s.a[1]+50],b:[s.b[0]-100,s.b[1]+50]}));
    assert.deepEqual(getGridReferenceBounds(copy),{x:0,y:0,width,height});assert.deepEqual(copy.paper,before.paper);
  }
});

test('invalid dimensions fall back per axis without inspecting temporary drawing geometry',()=>{
  const base=blankDoc('不完整状态',200,120);
  for(const value of [undefined,null,'200',NaN,Infinity,-1,0,1000001]){
    assert.deepEqual(getGridReferenceBounds({...base,paper:{width:value,height:120}} as unknown as Doc),{x:0,y:0,width:300,height:120});
  }
  assert.deepEqual(getGridReferenceBounds({...base,paper:undefined} as unknown as Doc),expected);
  const doc={paper:{width:200,height:120}} as Doc;
  Object.defineProperty(doc,'segments',{get(){throw new Error('grid reference must not read changing segments');}});
  Object.defineProperty(doc,'objects',{get(){throw new Error('grid reference must not read drawing extents');}});
  assert.deepEqual(getGridReferenceBounds(doc),{x:0,y:0,width:200,height:120});
});
