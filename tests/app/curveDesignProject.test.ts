import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {curveDesignDocument,curveDesignFromDocument} from '../../src/app/curveDesignProject';
import {createNonuniformHelixDesign,curveBandBoundary,curveDesignGeometry} from '../../src/app/curveDesign';
import type {GenericNonuniformHelixResult} from '../../src/app/curvedNativeNonuniformHelix';
import {upgradeProject} from '../../src/core/project';
import {validateDoc,type Doc} from '../../src/core/types';

const fixture=(JSON.parse(fs.readFileSync('tests/fixtures/curved-nonuniform-helix-native-20261001.json','utf8')) as
  {name:string;response:GenericNonuniformHelixResult}[]).find(row=>row.name==='original-in3968')!.response;
const make=()=>createNonuniformHelixDesign(fixture,{name:'螺旋镶嵌设计',millimetersPerUnit:73});

test('curve design project preserves native source and gets paper dimensions from millimeter band boundaries',()=>{
  const design=make(),before=structuredClone(design),document=curveDesignDocument(design),geometry=curveDesignGeometry(design),
    boundary=[...curveBandBoundary(geometry.left2D),...curveBandBoundary(geometry.right2D)];
  assert.equal(document.name,design.name);assert.equal(document.schemaVersion,2);
  assert.deepEqual(document.segments,[],'continuous samples must not become rigid CP segments');
  assert.deepEqual(document.objects,[]);
  assert.equal(document.paper.width,Math.max(...boundary.map(p=>p[0]))-Math.min(...boundary.map(p=>p[0])));
  assert.equal(document.paper.height,Math.max(...boundary.map(p=>p[1]))-Math.min(...boundary.map(p=>p[1])));
  assert.deepEqual(curveDesignFromDocument(document),design);assert.deepEqual(design,before);
  assert.notEqual(document.metadata!.curveDesign,design);
  validateDoc(document);
});

test('curve design survives ordinary project serialization and version migration without losing native geometry',()=>{
  const design=make(),document=curveDesignDocument(design),reopened=upgradeProject(JSON.parse(JSON.stringify(document)));
  assert.deepEqual(curveDesignFromDocument(reopened),design);assert.deepEqual(reopened.segments,[]);
  const before=curveDesignGeometry(design),after=curveDesignGeometry(curveDesignFromDocument(reopened)!);
  assert.deepEqual(after,before);
});

test('standard project rename is reflected in the reopened native design while source metadata stays untouched',()=>{
  const document=curveDesignDocument(make());document.name='新的纸带设计';
  assert.equal(curveDesignFromDocument(document)!.name,'新的纸带设计');
  assert.equal((document.metadata!.curveDesign as ReturnType<typeof make>).name,'螺旋镶嵌设计');
  assert.throws(()=>curveDesignFromDocument({...document,name:' '}));
});

test('ordinary CP documents return null but recognized corrupt or unsupported curve metadata throws',()=>{
  const ordinary:Doc={name:'普通折痕',paper:{width:200,height:200},segments:[]};
  assert.equal(curveDesignFromDocument(ordinary),null);
  assert.equal(curveDesignFromDocument({...ordinary,metadata:{otherDesign:{}}}),null);
  for(const value of [null,undefined,{},42,{...make(),version:2}])
    assert.throws(()=>curveDesignFromDocument({...ordinary,metadata:{curveDesign:value}}));
  const corrupted=structuredClone(make());corrupted.result.grid[2].sourceLeft[1][0]+=.5;
  assert.throws(()=>curveDesignFromDocument({...ordinary,metadata:{curveDesign:corrupted}}));
});

test('project construction rejects unsafe dimensions and mixed CP segments rather than changing the source scale',()=>{
  const original=make(),oversized={...original,millimetersPerUnit:1e6};
  assert.throws(()=>curveDesignDocument(oversized),/纸张宽高/);
  const mixed=curveDesignDocument(original);
  mixed.segments.push({id:'ordinary',a:[0,0],b:[1,1],assignment:'M',angle:-180});
  assert.throws(()=>curveDesignFromDocument(mixed),/包含直线折痕/);
  const half=createNonuniformHelixDesign(fixture,{millimetersPerUnit:original.millimetersPerUnit/2}),small=curveDesignDocument(half),normal=curveDesignDocument(original);
  assert.equal(small.paper.width,normal.paper.width/2);assert.equal(small.paper.height,normal.paper.height/2);
});
