import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assembleTiles,isConvexTile,joinTile,joinTileGroup,reflectedTile,regularTileAtEdge,reshapeStarTile,starTileAtEdge,starTileParameters,transformTile,tilesOverlap,unitStarTile,type Tile} from '../../src/app/tileAssembly';
import {readTessParams,tessPreset,changeTessParams} from '../../src/app/tessellation';
import {cross,sub,distance,polygonArea} from '../../src/core/geometry';

const square:Tile=[[0,0],[1,0],[1,1],[0,1]];
test('scaled group attachment preserves every seam and applies one common similarity',()=>{
  const group=[square,transformTile(square,[1,0])],target=transformTile(square,[4,2],25,false,undefined,2);
  const joined=joinTileGroup(group,0,0,target,2,true);
  assert.ok(distance(joined[0][0],target[3])<1e-8);
  assert.ok(distance(joined[0][1],target[2])<1e-8);
  assert.ok(distance(joined[0][1],joined[1][0])<1e-8);
  assert.ok(distance(joined[0][2],joined[1][3])<1e-8);
  const before=group.flat(),after=joined.flat();
  before.forEach((p,i)=>before.slice(i+1).forEach((q,j)=>assert.ok(Math.abs(distance(p,q)*2-distance(after[i],after[i+j+1]))<1e-8)));
  assert.equal(assembleTiles([target,...joined]).faces.length,3);
  assert.throws(()=>joinTileGroup(group,0,0,target,2),/长度不同/);
  assert.throws(()=>transformTile(square,[0,0],0,false,undefined,0),/正数/);
  assert.deepEqual(group,[square,transformTile(square,[1,0])]);
  const reflected=group.map(tile=>reflectedTile(tile,0,group[0]));
  assert.equal(assembleTiles([...group,...reflected]).faces.length,4);
  assert.ok(reflected.every(tile=>tile.every(p=>p[1]<=0)));
});
test('whole-tile rigid transforms and common-edge attachment preserve all lengths',()=>{
  const shape:Tile=[[0,0],[2,0],[1.4,1],[.2,1.3]];
  for(const transformed of [transformTile(shape,[2,-1],73),transformTile(shape,[2,-1],73,true),reflectedTile(shape,2)]){
    const distances=(tile:Tile)=>tile.flatMap((p,i)=>tile.slice(i+1).map(q=>distance(p,q))).sort((a,b)=>a-b);
    distances(shape).forEach((d,i)=>assert.ok(Math.abs(d-distances(transformed)[i])<1e-8));
    assert.ok(polygonArea(transformed)>0);
  }
  for(let edge=0;edge<4;edge++){
    const second=joinTile(transformTile(square,[3,4],39),1,square,edge);
    assert.equal(tilesOverlap(square,second),false);
    const mesh=assembleTiles([square,second]);assert.equal(mesh.faces.length,2);assert.equal(mesh.vertices.length,6);
    for(const n of [3,4,6,12,13,16,24]){
      const next=regularTileAtEdge(n,square,edge);
      assert.equal(tilesOverlap(square,next),false);
      next.forEach((p,i)=>assert.ok(Math.abs(distance(p,next[(i+1)%n])-1)<1e-8));
      assert.equal(assembleTiles([square,next]).faces.length,2);
    }
  }
  assert.throws(()=>joinTile(shape,0,square,0),/长度不同/);
  assert.throws(()=>regularTileAtEdge(25,square,0),/3–24/);
});

test('assembly conforms partial edges and rejects overlaps, isolated tiles and holes',()=>{
  const upper:Tile=[[1,0],[2,0],[2,.5],[1,.5]],lower=transformTile(upper,[0,.5]);
  const mesh=assembleTiles([square,upper,lower]);
  assert.equal(mesh.faces.length,3);assert.equal(mesh.faces[0].length,5);
  assert.throws(()=>assembleTiles([square,square]),/重叠/);
  assert.throws(()=>assembleTiles([square,transformTile(square,[.9,0])]),/重叠/);
  assert.throws(()=>assembleTiles([square,transformTile(square,[1,1])]),/共边/);
  assert.throws(()=>assembleTiles([square,transformTile(square,[2,0])]),/共边/);
  const ring=Array.from({length:9},(_,i)=>[i%3,Math.floor(i/3)] as [number,number]).filter(([x,y])=>x!==1||y!==1).map(offset=>transformTile(square,offset));
  assert.throws(()=>assembleTiles(ring),/孔洞/);
  assert.equal(assembleTiles([square]).faces.length,1);
});

test('saved assembly and custom lattice survive later rotation/scale edits',()=>{
  const params={...tessPreset('custom'),...assembleTiles([square,reflectedTile(square,1)]),lattice:[[2,0],[0,1]] as [[number,number],[number,number]]};
  assert.deepEqual(readTessParams(params),params);
  for(const patch of [{angle:42},{scale:.4}])assert.deepEqual(readTessParams(changeTessParams(params,patch)),{...params,...patch});
  assert.equal(readTessParams({...params,lattice:[[1,0],[2,0]]}),null);
  assert.equal(readTessParams({...params,lattice:[[1,0],[0,NaN]]}),null);
  const one={...tessPreset('custom'),...assembleTiles([[[0,0],[1,0],[0,1]]])};
  assert.deepEqual(readTessParams(one),one);
});

test('Origamica unit stars retain their exact concave outline and attach without overlap',()=>{
  // Notebook UnitRegularStarPolygonCenter/PointRadius/OtherRadius/Vertices
  // (26480–26553, 26701–26736): for n=5, α=36°, two points have the
  // closed-form golden-ratio coordinates below.
  const pentagram=unitStarTile(5,36);
  assert.ok(distance(pentagram[2],[(3+Math.sqrt(5))/4,-Math.sqrt(10+2*Math.sqrt(5))/4])<1e-10);
  assert.ok(distance(pentagram[3],[(1+Math.sqrt(5))/2,0])<1e-10);
  for(const n of [3,4,5,6,12]){
    const tip=36,star=unitStarTile(n,tip);
    assert.equal(star.length,2*n);
    assert.ok(distance(star[0],[0,0])<1e-10);
    assert.ok(distance(star[1],[1,0])<1e-10);
    star.forEach((p,i)=>assert.ok(Math.abs(distance(p,star[(i+1)%star.length])-1)<1e-9));
    const incoming=[star.at(-1)![0]-star[0][0],star.at(-1)![1]-star[0][1]],outgoing=[star[1][0]-star[0][0],star[1][1]-star[0][1]];
    const angle=Math.acos((incoming[0]*outgoing[0]+incoming[1]*outgoing[1])/(Math.hypot(...incoming)*Math.hypot(...outgoing)))*180/Math.PI;
    assert.ok(Math.abs(angle-tip)<1e-8);
    assert.equal(isConvexTile(star),false);
    const target=regularTileAtEdge(3,star,0),joined=starTileAtEdge(n,tip,target,0);
    assert.equal(tilesOverlap(target,joined),false);
    const mesh=assembleTiles([target,joined],true);
    assert.equal(mesh.faces.length,2);
    assert.equal(mesh.faces[1].length,2*n);
    const saved=readTessParams({...tessPreset('custom'),...mesh,customOutput:'tiling'});
    assert.ok(saved?.family==='custom'&&saved.customOutput==='tiling');
    assert.deepEqual(readTessParams(changeTessParams(saved,{angle:42})),{...saved,angle:42});
  }
  assert.throws(()=>unitStarTile(5,360-360/5),/星尖角/);
  assert.throws(()=>assembleTiles([unitStarTile(5,36)]),/凸多边形/);
  assert.throws(()=>assembleTiles([[[0,0],[1,1],[0,1],[1,0]]],true),/简单多边形/);
});

test('unit star vertices independently follow the original alternating-turn polygon for 3–12 tips',()=>{
  for(let n=3;n<=12;n++)for(const tip of [5,36,60,(180-180/n)-1].filter(x=>Math.abs(x-(180-360/n))>1e-8)){
    const star=unitStarTile(n,tip),expected:[[number,number],[number,number]]=[[0,0],[1,0]];
    const radians=tip*Math.PI/180,valleyTurn=radians-Math.PI+2*Math.PI/n,tipTurn=Math.PI-radians;
    let heading=0;
    for(let i=2;i<2*n;i++){
      heading+=(i-1)%2?valleyTurn:tipTurn;
      const previous=expected.at(-1)!;
      expected.push([previous[0]+Math.cos(heading),previous[1]+Math.sin(heading)]);
    }
    star.forEach((point,i)=>assert.ok(distance(point,expected[i])<1e-9,`n=${n} α=${tip} vertex=${i}`));
    assert.equal(isConvexTile(star),tip>=180-360/n,`n=${n} α=${tip}`);
    const mesh=assembleTiles([star],true);
    assert.equal(mesh.faces.length,1);
    assert.equal(mesh.faces[0].length,2*n);
  }
});

test('tip angles above the regular 2n-gon angle retain the original reflex-at-origin star',()=>{
  for(let n=3;n<=12;n++){
    const regularAngle=180-180/n,tip=200,star=unitStarTile(n,tip);
    assert.equal(star.length,2*n);
    assert.ok(distance(star[0],[0,0])<1e-10&&distance(star[1],[1,0])<1e-10);
    star.forEach((point,i)=>assert.ok(Math.abs(distance(point,star[(i+1)%star.length])-1)<1e-9));
    assert.equal(isConvexTile(star),false);
    const previous=star.at(-1)!,next=star[1];
    assert.ok(cross(sub(star[0],previous),sub(next,star[0]))<0,`n=${n} α=${tip} origin must be reflex`);
    const attached=regularTileAtEdge(3,star,0),mesh=assembleTiles([star,attached],true);
    assert.equal(mesh.faces[0].length,2*n);
    assert.equal(mesh.faces.length,2);
    assert.equal(tilesOverlap(star,attached),false);
    const regular=unitStarTile(n,regularAngle);
    const first=[regular[1][0]-regular[0][0],regular[1][1]-regular[0][1]];
    const second=[regular[2][0]-regular[1][0],regular[2][1]-regular[1][1]];
    assert.ok(Math.abs(Math.atan2(cross(first,second),first[0]*second[0]+first[1]*second[1])-Math.PI/n)<1e-10);
  }
});

test('an existing parameterized star can change tip count and angle without moving its joined edge',()=>{
  const attached=starTileAtEdge(5,36,square,0),snapshot=structuredClone(attached);
  const parameters=starTileParameters(attached);
  assert.equal(parameters?.points,5);
  assert.ok(Math.abs(parameters!.tipDegrees-36)<1e-9);
  const reshaped=reshapeStarTile(attached,7,48);
  assert.deepEqual(attached,snapshot);
  assert.ok(distance(reshaped[0],attached[0])<1e-9);
  assert.ok(distance(reshaped[1],attached[1])<1e-9);
  assert.equal(reshaped.length,14);
  reshaped.forEach((p,i)=>assert.ok(Math.abs(distance(p,reshaped[(i+1)%reshaped.length])-distance(attached[0],attached[1]))<1e-8));
  assert.ok(Math.abs(starTileParameters(reshaped)!.tipDegrees-48)<1e-8);
  assert.equal(tilesOverlap(square,reshaped),false);
  const mesh=assembleTiles([square,reshaped],true);
  assert.equal(mesh.faces.length,2);
  const repeated={...tessPreset('custom'),...mesh,customOutput:'tiling' as const,repeatX:2,repeatY:1};
  const restored=readTessParams(JSON.parse(JSON.stringify(repeated)));
  assert.deepEqual(restored,repeated);
  assert.deepEqual(readTessParams(changeTessParams(restored!,{repeatY:2})),{...repeated,repeatY:2});
  for(const reflected of [false,true]){
    const moved=transformTile(unitStarTile(6,200),[3,-2],31,reflected,undefined,1.7);
    const found=starTileParameters(moved);
    assert.equal(found?.points,6);
    assert.ok(Math.abs(found!.tipDegrees-200)<1e-8);
    const changed=reshapeStarTile(moved,4,35);
    assert.ok(distance(changed[0],moved[0])<1e-8&&distance(changed[1],moved[1])<1e-8);
    assert.ok(Math.abs(starTileParameters(changed)!.tipDegrees-35)<1e-8);
  }
  const distorted=structuredClone(attached);distorted[4][0]+=.02;
  assert.equal(starTileParameters(distorted),null);
  assert.throws(()=>reshapeStarTile(distorted,5,40),/不再是正星形/);
});
