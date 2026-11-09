import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {centeredUnitTriangleVertices,unitRegularCircularTwist,unitRegularPolygonVertices} from '../../src/app/circularTwistOriginal';

test('Origamica unit regular polygon has the first unit edge on the x axis',()=>{
  const square=unitRegularPolygonVertices(4);
  const expected=[[0,0],[1,0],[1,1],[0,1]];
  assert.deepEqual(square,expected);
  const hexagon=unitRegularPolygonVertices(6);
  hexagon.forEach((point,index)=>{
    const next=hexagon[(index+1)%hexagon.length];
    assert.ok(Math.abs(Math.hypot(point[0]-next[0],point[1]-next[1])-1)<1e-12);
  });
  assert.ok(Math.abs(unitRegularCircularTwist(4,3).radius-3/Math.SQRT2)<1e-12);
  assert.ok(Math.abs(unitRegularCircularTwist(6,3).radius-3)<1e-12);
  const large=unitRegularCircularTwist(64,3);
  assert.equal(large.polygon.length,64);
  assert.ok(large.polygon.every((point,index)=>{
    const next=large.polygon[(index+1)%large.polygon.length];
    return Math.abs(Math.hypot(point[0]-next[0],point[1]-next[1])-1)<1e-11;
  }));
  for(const [n,m] of [[2,3],[65,3],[4,1],[4,0],[4,Infinity]]){
    assert.throws(()=>unitRegularCircularTwist(n,m));
  }
});

test('Origamica 40°, 60°, 80° triangle uses a unit base and is centered for circular CP',()=>{
  const triangle=centeredUnitTriangleVertices(40,60);
  const center=[0,1].map(k=>triangle.reduce((sum,point)=>sum+point[k],0)/3);
  center.forEach(value=>assert.ok(Math.abs(value)<1e-12));
  assert.ok(Math.abs(Math.hypot(triangle[1][0]-triangle[0][0],triangle[1][1]-triangle[0][1])-1)<1e-12);
  const side=Math.sin(60*Math.PI/180)/Math.sin(80*Math.PI/180);
  assert.ok(Math.abs((triangle[2][0]-triangle[0][0])-side*Math.cos(40*Math.PI/180))<1e-12);
  assert.ok(Math.abs((triangle[2][1]-triangle[0][1])-side*Math.sin(40*Math.PI/180))<1e-12);
  for(const [a,b] of [[0,60],[40,0],[90,90],[Infinity,60]]){
    assert.throws(()=>centeredUnitTriangleVertices(a,b));
  }
});

test('saved regular n=4/n=6 and angled triangle examples produce physical CP and strict FF',()=>{
  const cases=[
    {sides:4,types:['M','M','V','V'],expected:[68,76,9]},
    {sides:6,types:['M','V','M','V','M','V'],expected:[72,84,13]},
  ].map(({sides,types,expected})=>({
    request:{family:'circular-twist',...unitRegularCircularTwist(sides,3),
      angle:30,circleDivisions:64,centralTypes:types,stationaryFace:'auto'},
    expected,
  }));
  cases.push({request:{family:'circular-twist',polygon:centeredUnitTriangleVertices(40,60),
    angle:20,radius:1.5,circleDivisions:64,centralTypes:['M','M','M'],stationaryFace:'auto'},
  expected:[67,73,7]});
  const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',
    "import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps([generate(case['request']) for case in json.load(sys.stdin)]))"],
  {input:JSON.stringify(cases),encoding:'utf8',windowsHide:true,
    env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},timeout:30000});
  assert.equal(run.status,0,run.stderr);
  const responses=JSON.parse(run.stdout) as Array<{
    fold:{vertices_coords:number[][];edges_vertices:number[][];faces_vertices:number[][];edges_assignment:string[]};
    source:{foldedForm:number[][];closureError:number};
    stats:{checks:{geometry:{status:string};local:{status:string};layerOrder:{status:string}}};
  }>;
  responses.forEach((result,index)=>{
    const {fold,source,stats}=result;
    assert.deepEqual([fold.vertices_coords.length,fold.edges_vertices.length,fold.faces_vertices.length],cases[index].expected);
    assert.deepEqual(fold.edges_assignment.slice(0,cases[index].request.centralTypes.length),
      cases[index].request.centralTypes);
    assert.equal(stats.checks.geometry.status,'passed');
    assert.equal(stats.checks.local.status,'passed');
    assert.equal(stats.checks.layerOrder.status,'not_checked');
    assert.ok(source.closureError<1e-8);
    for(const face of fold.faces_vertices){
      for(let a=0;a<face.length;a++)for(let b=a+1;b<face.length;b++){
        const i=face[a],j=face[b];
        const planar=Math.hypot(fold.vertices_coords[i][0]-fold.vertices_coords[j][0],
          fold.vertices_coords[i][1]-fold.vertices_coords[j][1]);
        const flat=Math.hypot(source.foldedForm[i][0]-source.foldedForm[j][0],
          source.foldedForm[i][1]-source.foldedForm[j][1]);
        assert.ok(Math.abs(planar-flat)<1e-7,`case ${index} face ${i},${j} lost isometry`);
      }
    }
  });
});
