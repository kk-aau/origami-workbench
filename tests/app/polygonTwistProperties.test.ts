import assert from 'node:assert/strict';
import test from 'node:test';
import {polygonTwistProperties,type Point2} from '../../src/app/polygonTwistProperties';
import {unitTriangleOffsetTwistAngle,unitTriangleOffsetTwistShrinkage} from '../../src/app/unitTriangleOffset';

const close=(actual:number,expected:number,tolerance=1e-9)=>
  assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);

test('square offset twist reproduces the source vertex ordering and all five properties',()=>{
  const square:Point2[]=[[0,0],[1,0],[1,1],[0,1]];
  const props=polygonTwistProperties(square,.2,.2,90)!;
  assert.equal(props.numSides,4);
  props.centralVertices.forEach((point,i)=>point.forEach((v,j)=>
    close(v,[[.6,.2],[.8,.6],[.4,.8],[.2,.4]][i][j])));
  props.twistAngles.forEach(angle=>close(angle,Math.atan(.5)*180/Math.PI));
  props.centralPolygonSides.forEach(length=>close(length,Math.hypot(.2,.4)));
  props.centralPolygonAngles.forEach(angle=>close(angle,90));
  props.centralPolygonAnglesExcess.forEach(excess=>close(excess,0));
});

test('triangle query agrees with the independent UnitTriangleOffset formulas and exact tile geometry',()=>{
  const [a,b,c]=[50,60,70],r=Math.PI/180;
  const side=Math.sin(b*r)/Math.sin(c*r);
  const triangle:Point2[]=[[0,0],[1,0],[side*Math.cos(a*r),side*Math.sin(a*r)]];
  const props=polygonTwistProperties(triangle,.09,.06,90)!;
  const alpha=unitTriangleOffsetTwistAngle([a,b,c],.09,.06)!;
  const rho=unitTriangleOffsetTwistShrinkage([a,b,c],.09,.06)!;
  const lengths=triangle.map((p,i)=>Math.hypot(p[0]-triangle[(i+1)%3][0],p[1]-triangle[(i+1)%3][1]));
  props.twistAngles.forEach(angle=>close(angle,alpha));
  props.centralPolygonSides.forEach((length,i)=>close(length/lengths[i],rho));
  props.centralPolygonAngles.forEach((angle,i)=>close(angle,[a,b,c][i]));
  props.centralPolygonAnglesExcess.forEach(excess=>close(excess,0));
});

test('irregular quadrilateral has nonconstant twist angles and telescoping Kawasaki excess',()=>{
  const outer:Point2[]=[[0,0],[1,0],[.8,.9],[-.1,.7]];
  const props=polygonTwistProperties(outer,.2,.2,90)!;
  assert.equal(props.numSides,4);
  // Direct transcription of the notebook's 4i+{-1,4,0} vertex triples.
  [34.25803682217164,21.370622269343166,35.83765295427826,19.086009203151484]
    .forEach((expected,i)=>close(props.twistAngles[i],expected));
  [113.30212997317614,64.58377773802003,104.46703068493507,77.64706160386876]
    .forEach((expected,i)=>close(props.centralPolygonAngles[i],expected));
  assert.ok(Math.max(...props.twistAngles)-Math.min(...props.twistAngles)>1);
  assert.ok(props.centralPolygonAnglesExcess.some(value=>Math.abs(value)>1));
  close(props.centralPolygonAngles.reduce((a,b)=>a+b,0),360);
  close(props.centralPolygonAnglesExcess.reduce((a,b)=>a+b,0),0);
  const reversed=polygonTwistProperties([outer[0],...outer.slice(1).reverse()],.2,.2,90)!;
  reversed.twistAngles.forEach((angle,i)=>close(angle,props.twistAngles[i]));
});

test('the saved irregular quadrilateral keeps all five properties under small similarity transforms',()=>{
  const outer:Point2[]=[[0,0],[1,0],[.8,.9],[-.1,.7]];
  const baseline=polygonTwistProperties(outer,.2,.2,90)!;
  for(const [scale,translation] of [[1e-3,[0,0]],[1e-6,[0,0]],[1e-6,[.125,-.375]]] as const){
    const transformed=outer.map(([x,y]):Point2=>[
      translation[0]+scale*x,translation[1]+scale*y
    ]);
    const props=polygonTwistProperties(transformed,.2,.2,90);
    assert.ok(props,`scale ${scale}, translation ${translation}`);
    assert.equal(props.numSides,baseline.numSides);
    baseline.centralVertices.forEach(([x,y],i)=>{
      close((props.centralVertices[i][0]-translation[0])/scale,x,1e-9);
      close((props.centralVertices[i][1]-translation[1])/scale,y,1e-9);
    });
    baseline.twistAngles.forEach((value,i)=>close(props.twistAngles[i],value,1e-8));
    baseline.centralPolygonSides.forEach((value,i)=>close(props.centralPolygonSides[i]/scale,value,1e-9));
    baseline.centralPolygonAngles.forEach((value,i)=>close(props.centralPolygonAngles[i],value,1e-8));
    baseline.centralPolygonAnglesExcess.forEach((value,i)=>
      close(props.centralPolygonAnglesExcess[i],value,1e-8));
  }
});

test('irregular-tile parameter sweep preserves properties across six orders of magnitude',()=>{
  const outer:Point2[]=[[0,0],[1,0],[.8,.9],[-.1,.7]];
  const tiny=outer.map(([x,y]):Point2=>[x*1e-6,y*1e-6]);
  let valid=0;
  for(const width of [.09,.2,.4])for(const offset of [-.2,0,.2])
    for(const tilt of [30,45,60,75,90,105,120,135,150]){
      const baseline=polygonTwistProperties(outer,width,offset,tilt);
      if(!baseline)continue;
      valid++;
      const scaled=polygonTwistProperties(tiny,width,offset,tilt);
      assert.ok(scaled,`w=${width}, d=${offset}, τ=${tilt}`);
      baseline.twistAngles.forEach((value,i)=>close(scaled.twistAngles[i],value,1e-7));
      baseline.centralPolygonSides.forEach((value,i)=>
        close(scaled.centralPolygonSides[i]/1e-6,value,1e-9));
      baseline.centralPolygonAngles.forEach((value,i)=>
        close(scaled.centralPolygonAngles[i],value,1e-7));
      baseline.centralPolygonAnglesExcess.forEach((value,i)=>
        close(scaled.centralPolygonAnglesExcess[i],value,1e-7));
    }
  assert.ok(valid>40,`expected a meaningful valid parameter range, got ${valid}`);
});

test('13- and 24-sided precise tiles expose the same five cyclic properties',()=>{
  for(const n of [13,24]){
    const outer:Point2[]=Array.from({length:n},(_,i)=>[
      Math.cos(2*Math.PI*i/n),Math.sin(2*Math.PI*i/n)
    ]);
    const props=polygonTwistProperties(outer,.2,0,90);
    assert.ok(props,`${n}-sided precise tile`);
    assert.equal(props.numSides,n);
    assert.equal(props.centralVertices.length,n);
    for(const value of props.twistAngles)close(value,props.twistAngles[0],1e-8);
    for(const value of props.centralPolygonSides)close(value,props.centralPolygonSides[0],1e-8);
    for(const value of props.centralPolygonAngles)close(value,props.centralPolygonAngles[0],1e-8);
    close(props.centralPolygonAngles.reduce((sum,value)=>sum+value,0),(n-2)*180,1e-7);
    close(props.centralPolygonAnglesExcess.reduce((sum,value)=>sum+value,0),0,1e-7);
  }
});

test('invalid or singular polygon inputs have no misleading property output',()=>{
  const square:Point2[]=[[0,0],[1,0],[1,1],[0,1]];
  assert.equal(polygonTwistProperties(square,0,0,90),null);
  assert.equal(polygonTwistProperties(square,.2,.45,90),null);
  assert.equal(polygonTwistProperties(square,.2,0,0),null);
  assert.equal(polygonTwistProperties([[0,0],[1,0],[2,0]],.2,0,90),null);
  assert.equal(polygonTwistProperties([[0,0],[1,0],[.2,.2],[1,1],[0,1]],.2,0,90),null);
  assert.equal(polygonTwistProperties(Array.from({length:25},(_,i):Point2=>[
    Math.cos(2*Math.PI*i/25),Math.sin(2*Math.PI*i/25)
  ]),.2,0,90),null);
});
