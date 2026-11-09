import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createNonuniformHelixDesign,parseCurveDesign,curveDesignGeometry,curveBandBoundary,
  curveDesignSampleMesh,exportCurveDesignJSON,exportCurveDesignSVG,exportCurveDesignOBJ} from '../../src/app/curveDesign';
import type {GenericNonuniformHelixResult} from '../../src/app/curvedNativeNonuniformHelix';

const fixtures=JSON.parse(fs.readFileSync('tests/fixtures/curved-nonuniform-helix-native-20261001.json','utf8')) as
  {name:string;response:GenericNonuniformHelixResult}[];
const fixture=(name='original-in3968')=>fixtures.find(x=>x.name===name)!.response;
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x));

test('continuous design saves source, dimensions and both sampled fields; reopened file revalidates source and geometry',()=>{
  const original=fixture(),design=createNonuniformHelixDesign(original,{name:'螺旋纸带',millimetersPerUnit:75});
  assert.equal(design.result.certification.exactStraightCreaseFOLD,false);
  assert.equal(design.result.certification.adoptableCreasePattern,false);
  assert.notEqual(design.result,original);
  const reopened=parseCurveDesign(JSON.parse(exportCurveDesignJSON(design)));
  assert.deepEqual(reopened,design);
  for(const mutate of [
    (d:any)=>{d.query.radius*=2;},
    (d:any)=>{d.result.grid[1].sourceLeft[1][0]+=.5;},
    (d:any)=>{d.result.flattening.result.grid[2].targetRight[1][0]+=.5;},
    (d:any)=>{d.result.certification.adoptableCreasePattern=true;},
    (d:any)=>{d.version=2;},
  ]){const damaged=clone(design);mutate(damaged);assert.throws(()=>parseCurveDesign(damaged));}
});

test('application rejects singular source, unavailable flattening and bands crossing a focal locus',()=>{
  for(const name of ['zero-gamma-spatial-only','zero-radius-spatial-only','gamma-cross-zero',
    'two-pi-planar-unknown','full-width-through-focus','positive-width-left-focus'])
    assert.throws(()=>createNonuniformHelixDesign(fixture(name)),name);
  for(const millimetersPerUnit of [0,-1,Infinity,NaN,1e7])
    assert.throws(()=>createNonuniformHelixDesign(fixture(),{millimetersPerUnit}));
  assert.throws(()=>createNonuniformHelixDesign(fixture(),{name:' '}));
});

test('mm geometry uses physical coordinates and actual changes in nonlinear source, not normalized preview coordinates',()=>{
  const source=fixture('nonlinear-gamma'),d=createNonuniformHelixDesign(source,{millimetersPerUnit:123}),g=curveDesignGeometry(d),
    standard=curveDesignGeometry(createNonuniformHelixDesign(fixture(),{millimetersPerUnit:123}));
  assert.deepEqual(g.crease2D[5],source.flattening.result!.sample.rows[5].targetBase.map(x=>x*123));
  assert.deepEqual(g.crease3D[5],source.sample.rows[5].sourceBase.map(x=>x*123));
  assert.deepEqual(g.left2D[5][2],source.flattening.result!.grid[5].targetLeft[2].map(x=>x*123));
  assert.deepEqual(g.right3D[5][2],source.grid[5].sourceRight[2].map(x=>x*123));
  assert.notDeepEqual(g.crease2D,standard.crease2D);
  assert.equal(curveBandBoundary(g.left2D).length,2*(source.query.segments+1));
});

test('SVG preserves actual millimeter dimensions and escaped names; OBJ contains only finite sampled surface geometry',()=>{
  const d=createNonuniformHelixDesign(fixture(),{name:'<script>&"纸带',millimetersPerUnit:80}),g=curveDesignGeometry(d),
    svg=exportCurveDesignSVG(d),obj=exportCurveDesignOBJ(d),points=[...g.crease2D,...g.left2D.flat(),...g.right2D.flat()],
    expectedWidth=Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0]))+4,
    width=Number(svg.match(/width="([^"]+)mm"/)![1]);
  assert.ok(Math.abs(width-expectedWidth)<1e-9);
  assert.match(svg,/&lt;script&gt;&amp;&quot;/);assert.doesNotMatch(svg,/<script>/);
  assert.match(svg,/不是经过刚性面等距验证/);
  const vertices=obj.split('\n').filter(x=>x.startsWith('v ')).map(x=>x.split(' ').slice(1).map(Number)),
    faces=obj.split('\n').filter(x=>x.startsWith('f ')).map(x=>x.split(' ').slice(1).map(Number));
  assert.equal(vertices.length,2*(d.query.segments+1)*(d.query.rulingSegments+1)+d.query.segments+1);
  assert.equal(faces.length,4*d.query.segments*d.query.rulingSegments);
  assert.ok(vertices.every(p=>p.length===3&&p.every(Number.isFinite)));
  assert.ok(faces.every(face=>face.length===3&&face.every(i=>Number.isInteger(i)&&i>=1&&i<=vertices.length)));
  assert.deepEqual(vertices[0],g.left3D[0][0].map(x=>Number(x.toPrecision(14))));
  const viewportMesh=curveDesignSampleMesh(g);
  assert.deepEqual(faces,viewportMesh.faces.map(face=>face.vertices.map(i=>i+1)));
  assert.deepEqual(vertices,viewportMesh.vertices.map(p=>p.map(x=>Number(x.toPrecision(14)))));
  assert.deepEqual(obj.split('\n').find(line=>line.startsWith('l '))!.split(' ').slice(1).map(Number),viewportMesh.curve.map(i=>i+1));
  assert.match(obj,/Not an exact rigid-face FOLD/);
});
